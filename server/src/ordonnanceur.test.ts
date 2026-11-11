import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Ordonnanceur } from './ordonnanceur';
import { cronCorrespond, cronValide, instantLocal } from '../../shared/ordonnanceur';

function preparer() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'ord-')));
  const o = new Ordonnanceur(stockage, 'UTC');
  const { agent, jeton } = o.creerAgent('srv-prod', 'Admin');
  return { stockage, o, agent, jeton };
}

describe('planification cron', () => {
  it('valide et compare les 5 champs', () => {
    expect(cronValide('0 2 * * *')).toBe(true);
    expect(cronValide('*/15 8-20 * * 1-5')).toBe(true);
    for (const faux of ['', '0 2 * *', '60 2 * * *', '0 24 * * *', 'a b c d e', '5-1 * * * *', '*/0 * * * *']) expect(cronValide(faux)).toBe(false);
    const lundi = { minute: 30, heure: 9, jour: 9, mois: 11, jourSemaine: 1 };
    expect(cronCorrespond('*/15 8-20 * * 1-5', lundi)).toBe(true);
    expect(cronCorrespond('*/15 8-20 * * 6,0', lundi)).toBe(false);
    expect(cronCorrespond('30 9 9 11 *', lundi)).toBe(true);
    // Jour du mois OU jour de semaine quand les deux sont précisés, comme cron.
    expect(cronCorrespond('30 9 1 * 1', lundi)).toBe(true);
    expect(cronCorrespond('30 9 1 * 2', lundi)).toBe(false);
  });

  it('lit l’heure dans le fuseau de l’officine', () => {
    const t = Date.UTC(2026, 10, 9, 23, 30); // lundi 23:30 UTC
    expect(instantLocal(t, 'UTC')).toEqual({ minute: 30, heure: 23, jour: 9, mois: 11, jourSemaine: 1 });
    expect(instantLocal(t, 'Africa/Libreville')).toEqual({ minute: 30, heure: 0, jour: 10, mois: 11, jourSemaine: 2 });
  });
});

describe('ordonnanceur', () => {
  it('de la demande au résultat, puis le job suivant', () => {
    const { o, agent, jeton } = preparer();
    const sauvegarde = o.creerJob({ nom: 'Sauvegarde', agentId: agent.id, commande: 'pg_dump', delaiMax: 60 }, 'Admin');
    const envoi = o.creerJob({ nom: 'Envoi hors site', agentId: agent.id, commande: 'rclone sync', apres: sauvegarde.id }, 'Admin');
    expect(o.travail(jeton)).toBeNull();
    expect(o.vue().agents[0]).toMatchObject({ nom: 'srv-prod', enLigne: true });
    expect(JSON.stringify(o.vue())).not.toMatch(/empreinte/);

    const x = o.lancerALaMain(sauvegarde.id, 'Awa');
    expect(() => o.lancerALaMain(sauvegarde.id, 'Awa')).toThrow(/déjà en file/);
    expect(o.travail(jeton)).toEqual({ id: x.id, commande: 'pg_dump', delaiMax: 60 });
    expect(o.travail(jeton)).toBeNull();
    o.resultat(jeton, { id: x.id, code: 0, sortie: 'ok' });
    expect(o.execution(x.id)).toMatchObject({ statut: 'reussi', code: 0, sortie: 'ok' });
    // Le succès déclenche la suite ; les listes ne portent pas la sortie.
    expect(o.vue().executions).toMatchObject([{ jobId: envoi.id, statut: 'en-attente', declenchePar: 'suite de « Sauvegarde »' }, { jobId: sauvegarde.id }]);
    expect(o.vue().executions[1].sortie).toBeUndefined();

    const y = o.travail(jeton)!;
    o.resultat(jeton, { id: y.id, code: 2, sortie: 'x'.repeat(30_000) });
    expect(o.execution(y.id)).toMatchObject({ statut: 'echoue', code: 2 });
    expect(o.execution(y.id).sortie).toHaveLength(20_000);
  });

  it('refuse un jeton inconnu et le résultat d’un autre agent', () => {
    const { o, agent, jeton } = preparer();
    const autre = o.creerAgent('srv-2', 'Admin');
    const j = o.creerJob({ nom: 'J', agentId: agent.id, commande: 'true' }, 'Admin');
    const x = o.lancerALaMain(j.id, 'Awa');
    expect(() => o.travail('faux')).toThrow(/Jeton/);
    expect(() => o.travail(undefined)).toThrow(/Jeton/);
    expect(o.travail(autre.jeton)).toBeNull();
    o.travail(jeton);
    expect(() => o.resultat(autre.jeton, { id: x.id, code: 0 })).toThrow(/introuvable/);
    expect(o.execution(x.id).statut).toBe('en-cours');
    expect(() => o.supprimerAgent(agent.id, 'Admin')).toThrow(/Des jobs/);
  });

  it('contrôle un job : commande, agent, cron, boucle de dépendances', () => {
    const { o, agent } = preparer();
    expect(() => o.creerJob({ nom: 'J', agentId: agent.id, commande: '' }, 'Admin')).toThrow(/Commande/);
    expect(() => o.creerJob({ nom: 'J', agentId: 'x', commande: 'true' }, 'Admin')).toThrow(/agent/);
    expect(() => o.creerJob({ nom: 'J', agentId: agent.id, commande: 'true', cron: 'toutes les heures' }, 'Admin')).toThrow(/Planification/);
    const a = o.creerJob({ nom: 'A', agentId: agent.id, commande: 'true' }, 'Admin');
    const b = o.creerJob({ nom: 'B', agentId: agent.id, commande: 'true', apres: a.id }, 'Admin');
    expect(() => o.modifierJob(a.id, { apres: b.id }, 'Admin')).toThrow(/boucle/);
    expect(() => o.modifierJob(a.id, { apres: a.id }, 'Admin')).toThrow(/boucle/);
    o.supprimerJob(a.id, 'Admin');
    expect(o.vue().jobs).toMatchObject([{ nom: 'B', apres: null }]);
  });

  it('lance à l’heure, une seule fois par minute, et clôt ce qui ne répond plus', () => {
    const { o, agent, jeton } = preparer();
    const j = o.creerJob({ nom: 'Nuit', agentId: agent.id, commande: 'true', cron: '0 2 * * *', delaiMax: 60 }, 'Admin');
    const deuxHeures = Date.UTC(2026, 10, 10, 2, 0, 5);
    o.tic(deuxHeures - 60_000);
    expect(o.vue().executions).toHaveLength(0);
    o.tic(deuxHeures);
    o.tic(deuxHeures + 20_000);
    expect(o.vue().executions).toMatchObject([{ jobId: j.id, statut: 'en-attente', declenchePar: 'planification' }]);
    o.travail(jeton, deuxHeures + 30_000);
    o.tic(deuxHeures + 30_000 + 119_000);
    expect(o.vue().executions[0].statut).toBe('en-cours');
    o.tic(deuxHeures + 30_000 + 121_000);
    expect(o.vue().executions[0].statut).toBe('expire');
    // Une exécution en attente s'annule ; un job en pause n'est plus planifié.
    const x = o.lancerALaMain(j.id, 'Awa');
    expect(o.annuler(x.id, 'Awa').statut).toBe('annule');
    o.modifierJob(j.id, { actif: false }, 'Admin');
    o.tic(deuxHeures + 86_400_000);
    expect(o.vue().executions).toHaveLength(2);
  });
});
