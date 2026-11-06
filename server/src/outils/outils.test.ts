import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from '../stockage';
import { Outils, statutOrchestration } from './outils';
import { etatGitlab } from './gitlab';
import { etatAwx } from './awx';
import { etatControlm, instantControlm } from './controlm';
import type { Execution } from '../../../shared/outils';

const ex = (outil: Execution['outil'], nom: string, etat: Execution['etat'], debut: number, contexte = 'main'): Execution => ({
  outil,
  id: `${nom}-${debut}`,
  nom,
  contexte,
  etat,
  statutBrut: etat,
  debut,
  fin: etat === 'en-cours' ? null : debut + 60_000,
  par: null,
  lien: null,
});
const outil = (cle: Execution['outil'], joignable = true, configure = true) => ({ cle, nom: cle, url: null, configure, demo: false, joignable, erreur: null });

describe('statuts des outils → un même modèle', () => {
  it('GitLab, AWX et Control-M parlent la même langue', () => {
    expect(etatGitlab('success')).toBe('succes');
    expect(etatGitlab('failed')).toBe('echec');
    expect(etatGitlab('running')).toBe('en-cours');
    expect(etatGitlab('manual')).toBe('attente');
    expect(etatGitlab('canceled')).toBe('annule');
    expect(etatAwx('successful')).toBe('succes');
    expect(etatAwx('error')).toBe('echec');
    expect(etatAwx('pending')).toBe('attente');
    expect(etatControlm('Ended OK')).toBe('succes');
    expect(etatControlm('Ended Not OK')).toBe('echec');
    expect(etatControlm('Executing')).toBe('en-cours');
    expect(etatControlm('Wait Condition')).toBe('attente');
    expect(etatControlm('Ended OK', true)).toBe('annule');
    expect(instantControlm('20260301023000')).toBe(new Date(2026, 2, 1, 2, 30, 0).getTime());
    expect(instantControlm(undefined)).toBeNull();
  });
});

describe('voyant Orchestration', () => {
  const t = Date.now();
  it('est inconnu sans outil, orange si un outil est muet', () => {
    expect(statutOrchestration({ outils: [outil('gitlab', false, false)], executions: [] })).toBe('inconnu');
    expect(statutOrchestration({ outils: [outil('awx', false)], executions: [] })).toBe('orange');
  });
  it('ne regarde que la dernière exécution terminée de chaque job', () => {
    const outils = [outil('gitlab'), outil('controlm')];
    const echecPuisSucces = [ex('gitlab', 'Pipeline #2', 'succes', t), ex('gitlab', 'Pipeline #1', 'echec', t - 3600_000)];
    expect(statutOrchestration({ outils, executions: echecPuisSucces })).toBe('vert');
    const echecEnDernier = [ex('controlm', 'EXPORT', 'en-cours', t, 'NUIT'), ex('controlm', 'EXPORT', 'echec', t - 3600_000, 'NUIT')];
    expect(statutOrchestration({ outils, executions: echecEnDernier })).toBe('orange');
  });
});

describe('fil d’activité', () => {
  it('publie chaque échec une seule fois et trace les lancements', async () => {
    const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'outils-')));
    const t = Date.now();
    const executions = [ex('awx', 'Déployer', 'echec', t - 60_000, 'prod'), ex('awx', 'Sauvegarde', 'succes', t - 120_000, 'nuit')];
    const faux = {
      cle: 'awx' as const,
      url: 'http://awx',
      executions: async () => executions,
      lancables: async () => [{ outil: 'awx' as const, id: '7', nom: 'Déployer', description: '' }],
      lancer: async () => ex('awx', 'Déployer', 'en-cours', t, 'prod'),
      relancer: async () => ex('awx', 'Déployer', 'en-cours', t, 'prod'),
    };
    // AWX « configuré » : le faux client remplace l'appel réseau.
    const { config } = await import('../config');
    config.awxUrl = 'http://awx';
    config.awxJeton = 'x';
    const outils = new Outils(stockage, () => false, { awx: faux });

    await outils.surveiller();
    await outils.surveiller();
    expect(stockage.donnees.evenements.filter((e) => e.titre.startsWith('Échec'))).toHaveLength(1);
    expect(stockage.donnees.vus.executions).toHaveProperty(`awx:${executions[0].id}`);

    const vue = await outils.vue();
    expect(vue.outils.find((o) => o.cle === 'awx')).toMatchObject({ configure: true, joignable: true });
    expect(vue.outils.find((o) => o.cle === 'gitlab')).toMatchObject({ configure: false, demo: false, joignable: false });
    expect(vue.statut).toBe('orange');

    const e = await outils.lancer('awx', '7', 'Alex');
    expect(e.etat).toBe('en-cours');
    expect(stockage.donnees.evenements[0].titre).toBe('Déployer lancé par Alex');
    await expect(outils.lancer('gitlab', 'main', 'Alex')).rejects.toThrow(/non configuré/);
  });
});
