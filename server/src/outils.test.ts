import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { Qualite, lireSarif } from './qualite';
import { Taches } from './taches';
import { Ressources } from './ressources';
import { Explorateur } from './explorateur';
import { prochaineExecution } from '../../shared/taches';
import { rapport } from '../../shared/ressources';
import type { LigneJournal } from '../../shared/types';

const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), 'outils-'));

function sarif(resultats: { regle: string; fichier: string; message: string; ligne?: number; niveau?: string }[]) {
  return {
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Semgrep',
            rules: [
              { id: 'sql-injection', shortDescription: { text: 'Injection SQL' }, properties: { tags: ['security', 'external/cwe/cwe-089'], 'security-severity': '8.8' } },
              { id: 'unused-var', shortDescription: { text: 'Variable inutilisée' }, defaultConfiguration: { level: 'note' }, properties: { tags: ['maintainability'] } },
            ],
          },
        },
        results: resultats.map((r) => ({
          ruleId: r.regle,
          level: r.niveau,
          message: { text: r.message },
          locations: [{ physicalLocation: { artifactLocation: { uri: r.fichier }, region: { startLine: r.ligne ?? 1 } } }],
        })),
      },
    ],
  };
}

describe('analyse de code (façon Coverity)', () => {
  const prep = () => {
    const stockage = new Stockage(dossier());
    const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
    return { stockage, tickets, qualite: new Qualite(stockage, tickets) };
  };

  it('lit le SARIF : impact, CWE, catégorie ; refuse ce qui n’en est pas', () => {
    const [a, b] = lireSarif(
      sarif([
        { regle: 'sql-injection', fichier: 'sales/src/repo.ts', message: 'Requête construite avec req.query.id' },
        { regle: 'unused-var', fichier: 'sales/src/x.ts', message: 'x est inutilisée' },
      ]),
    );
    expect(a).toMatchObject({ impact: 'eleve', cwe: 'CWE-89', categorie: 'Sécurité', titreRegle: 'Injection SQL', ligne: 1 });
    expect(b).toMatchObject({ impact: 'faible', cwe: null, categorie: 'Maintainability' });
    expect(() => lireSarif({ bonjour: 1 })).toThrow(/SARIF/);
  });

  it('suit les défauts d’une analyse à l’autre : nouveau, toujours là (ligne déplacée), corrigé, réapparu ; politique', () => {
    const { qualite } = prep();
    const a1 = qualite.importer(
      sarif([
        { regle: 'sql-injection', fichier: 'a.ts', message: 'injection', ligne: 10 },
        { regle: 'unused-var', fichier: 'b.ts', message: 'x inutilisée' },
      ]),
      { projet: 'officina' },
      'CI',
    );
    expect(a1).toMatchObject({ total: 2, nouveaux: 2, corriges: 0, politique: { respectee: false } });
    const a2 = qualite.importer(sarif([{ regle: 'sql-injection', fichier: 'a.ts', message: 'injection', ligne: 42 }]), { projet: 'officina' }, 'CI');
    expect(a2).toMatchObject({ total: 1, nouveaux: 0, corriges: 1, politique: { respectee: true } });
    const tous = qualite.lister({ etat: 'tous' });
    expect(tous.find((d) => d.regle === 'sql-injection')).toMatchObject({ etat: 'en-cours', ligne: 42 });
    expect(tous.find((d) => d.regle === 'unused-var')?.etat).toBe('corrige');
    qualite.importer(sarif([{ regle: 'unused-var', fichier: 'b.ts', message: 'x inutilisée' }]), { projet: 'officina' }, 'CI');
    const revenu = qualite.lister({ etat: 'tous' }).find((d) => d.regle === 'unused-var')!;
    expect(revenu.corrigeLe).toBeNull();
    expect(revenu.historique.at(-1)?.texte).toMatch(/Réapparu/);
  });

  it('tri : écarter demande une raison ; ticket créé et relié', () => {
    const { qualite, tickets } = prep();
    qualite.importer(sarif([{ regle: 'sql-injection', fichier: 'a.ts', message: 'injection' }]), {}, 'CI');
    const [d] = qualite.lister({});
    expect(() => qualite.trier(d.cid, { classification: 'faux-positif' }, 'Béa')).toThrow(/commentaire obligatoire/);
    expect(qualite.trier(d.cid, { classification: 'faux-positif', commentaire: 'Valeur constante' }, 'Béa').etat).toBe('ecarte');
    expect(qualite.lister({})).toHaveLength(0);
    qualite.trier(d.cid, { classification: 'bug', proprietaire: 'Alex', commentaire: 'En fait non' }, 'Béa');
    const v = qualite.creerTicket(d.cid, 'Béa');
    expect(v.ticket).toMatch(/^PRB/);
    expect(tickets.trouver(v.ticket!)).toMatchObject({ type: 'probleme', assigneA: 'Alex', ci: 'officina' });
    expect(() => qualite.creerTicket(d.cid, 'Béa')).toThrow(/Déjà relié/);
  });
});

describe('tâches automatisées (façon AWX)', () => {
  const prep = (mode: 'reel' | 'demo' = 'reel') => {
    const d = dossier();
    const scripts = path.join(d, 'scripts');
    fs.mkdirSync(scripts);
    fs.writeFileSync(path.join(scripts, 'bonjour.sh'), '#!/bin/sh\necho "bonjour $1"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(scripts, 'echec.sh'), '#!/bin/sh\necho oups >&2\nexit 3\n', { mode: 0o755 });
    fs.writeFileSync(path.join(d, 'dehors.sh'), '#!/bin/sh\necho dehors\n', { mode: 0o755 });
    const prevenus: string[] = [];
    const stockage = new Stockage(path.join(d, 'donnees'));
    const taches = new Taches(stockage, { mode: () => mode, fuseau: 'Africa/Libreville', dossierScripts: scripts, prevenir: (qui, n) => void prevenus.push(`${qui}:${n.titre}`) });
    return { taches, prevenus, stockage };
  };
  const attendre = async (f: () => boolean) => {
    for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 30));
  };

  it('pose les modèles de départ une seule fois', () => {
    const { taches } = prep();
    expect(taches.modeles().map((m) => m.nom)).toContain('Redémarrer un service');
  });

  it('refuse un script hors du dossier et une valeur hors liste', () => {
    const { taches } = prep();
    expect(() => taches.creerModele({ nom: 'X', script: '../dehors.sh' })).toThrow(/chemin relatif/);
    expect(() => taches.creerModele({ nom: 'X', script: '/bin/sh' })).toThrow(/chemin relatif/);
    const m = taches.creerModele({ nom: 'Bonjour', script: 'bonjour.sh', parametre: { nom: 'qui', choix: ['monde'] } });
    expect(() => taches.lancer(m.id, 'monde; rm -rf /', 'Alex')).toThrow(/choisissez une valeur/);
  });

  it('exécute le script, garde la sortie et le code ; prévient en cas d’échec', async () => {
    const { taches, prevenus } = prep();
    const ok = taches.lancer(taches.creerModele({ nom: 'Bonjour', script: 'bonjour.sh', parametre: { nom: 'qui', choix: ['monde'] } }).id, 'monde', 'Alex');
    const ko = taches.lancer(taches.creerModele({ nom: 'Échec', script: 'echec.sh' }).id, null, 'Alex');
    await attendre(() => taches.travail(ok.id).statut === 'reussi' && taches.travail(ko.id).statut === 'echoue');
    expect(taches.travail(ok.id)).toMatchObject({ statut: 'reussi', code: 0 });
    expect(taches.travail(ok.id).sortie).toContain('bonjour monde');
    expect(taches.travail(ko.id)).toMatchObject({ statut: 'echoue', code: 3 });
    expect(taches.travail(ko.id).sortie).toContain('oups');
    expect(prevenus.some((p) => p.startsWith('agents:') && p.includes('Échec'))).toBe(true);
  });

  it('approbation : pas par le demandeur ; un refus ne lance rien', () => {
    const { taches, prevenus } = prep();
    const m = taches.creerModele({ nom: 'Sensible', script: 'bonjour.sh', approbation: true });
    const t = taches.lancer(m.id, null, 'Alex');
    expect(t.statut).toBe('approbation');
    expect(prevenus).toContain('approbateurs:Tâche à approuver : Sensible');
    expect(() => taches.decider(t.id, true, 'Alex')).toThrow(/séparation/);
    expect(taches.decider(t.id, false, 'Béa').statut).toBe('refuse');
    expect(() => taches.creerPlanning({ modeleId: m.id, frequence: 'quotidien', heure: '02:00' }, 'Alex', false)).toThrow(/approbateur/);
  });

  it('script absent : échec en réel ; en démonstration, rien n’est lancé (simulation)', async () => {
    const reel = prep('reel');
    const t = reel.taches.lancer(reel.taches.creerModele({ nom: 'Absent', script: 'absent.sh' }).id, null, 'Alex');
    expect(reel.taches.travail(t.id).statut).toBe('echoue');
    expect(reel.taches.travail(t.id).sortie).toMatch(/introuvable/);
    const demo = prep('demo');
    const s = demo.taches.lancer(demo.taches.creerModele({ nom: 'Absent', script: 'absent.sh' }).id, null, 'Alex');
    expect(demo.taches.travail(s.id)).toMatchObject({ statut: 'en-cours', simule: true });
    demo.taches.annuler(s.id, 'Alex');
    expect(demo.taches.travail(s.id).statut).toBe('annule');
  });

  it('planning : prochaine exécution à l’heure locale', () => {
    // Libreville = UTC+1. Mercredi 18/11/2026 10:00 UTC.
    const depart = Date.UTC(2026, 10, 18, 10, 0);
    expect(new Date(prochaineExecution({ frequence: 'quotidien', heure: '02:30', jour: 0 }, depart, 'Africa/Libreville')).toISOString()).toBe('2026-11-19T01:30:00.000Z');
    expect(new Date(prochaineExecution({ frequence: 'horaire', heure: '00:15', jour: 0 }, depart, 'Africa/Libreville')).toISOString()).toBe('2026-11-18T10:15:00.000Z');
    expect(new Date(prochaineExecution({ frequence: 'hebdomadaire', heure: '03:00', jour: 0 }, depart, 'Africa/Libreville')).toISOString()).toBe('2026-11-22T02:00:00.000Z');
  });
});

describe('ressources (façon Centreon)', () => {
  const ctrl = (etat: 'ok' | 'critique' | 'avertissement') => [{ cle: 'docker/notify', hote: 'docker', nom: 'notify', etat, sortie: etat, lien: '/conteneurs' }];

  it('confirme un problème après 3 contrôles, un retour à OK tout de suite ; l’acquittement tombe au retour', () => {
    const stockage = new Stockage(dossier());
    const r = new Ressources(stockage);
    r.actualiser(ctrl('ok'), 0);
    expect(r.actualiser(ctrl('critique'), 30_000)).toEqual([]);
    expect(r.vue().ressources[0]).toMatchObject({ etat: 'critique', confirme: false, tentatives: 1 });
    r.actualiser(ctrl('critique'), 60_000);
    expect(r.actualiser(ctrl('critique'), 90_000)).toHaveLength(1);
    expect(stockage.donnees.evenements[0].titre).toMatch(/notify : Critique/);
    expect(() => r.acquitter('docker/notify', '', 'Béa')).toThrow(/commentaire/);
    r.acquitter('docker/notify', 'Je regarde', 'Béa');
    expect(r.vue().ressources[0].acquittement?.par).toBe('Béa');
    expect(r.actualiser(ctrl('ok'), 120_000)).toHaveLength(1);
    expect(r.vue().ressources[0].acquittement).toBeNull();
  });

  it('arrêt planifié : cible connue, raison, durée bornée', () => {
    const r = new Ressources(new Stockage(dossier()));
    r.actualiser(ctrl('ok'));
    expect(() => r.planifierArret({ cible: 'inconnu', fin: Date.now() + 1000, commentaire: 'x' }, 'Béa')).toThrow(/Cible/);
    expect(() => r.planifierArret({ cible: 'hote:docker', fin: Date.now() + 1000 }, 'Béa')).toThrow(/raison/);
    r.planifierArret({ cible: 'hote:docker', fin: Date.now() + 3_600_000, commentaire: 'Mise à jour' }, 'Béa');
    expect(r.vue().ressources[0].enArret).toBe(true);
  });

  it('rapport de disponibilité : parts du temps et nombre de pannes', () => {
    const lignes = rapport(
      [
        { t: 0, cle: 'a', hote: 'h', nom: 'a', etat: 'ok', sortie: '' },
        { t: 50, cle: 'a', hote: 'h', nom: 'a', etat: 'critique', sortie: '' },
        { t: 75, cle: 'a', hote: 'h', nom: 'a', etat: 'ok', sortie: '' },
      ],
      [
        { cle: 'a', hote: 'h', nom: 'a' },
        { cle: 'b', hote: 'h', nom: 'b' },
      ],
      0,
      100,
    );
    expect(lignes[0]).toMatchObject({ ok: 0.75, critique: 0.25, pannes: 1, nonMesure: 0 });
    expect(lignes[1]).toMatchObject({ nonMesure: 1 });
  });
});

describe('explorateur de journaux (façon Kibana)', () => {
  it('règle d’alerte : prévient au seuil, une fois par fenêtre', async () => {
    const lignes: LigneJournal[] = Array.from({ length: 5 }, (_, i) => ({ t: i, service: 'notify', niveau: 'error', message: 'ECONNREFUSED' }));
    const prevenus: string[] = [];
    const ex = new Explorateur(
      new Stockage(dossier()),
      async (f) => lignes.slice(0, f.limite),
      (n) => void prevenus.push(n.titre),
    );
    expect(() => ex.creer({ nom: 'X', alerte: { seuil: 0, minutes: 10 } }, 'Béa')).toThrow(/Seuil/);
    ex.creer({ nom: 'Notify en panne', filtre: { service: 'notify', niveau: 'error' }, alerte: { seuil: 5, minutes: 10 } }, 'Béa');
    ex.creer({ nom: 'Trop haut', filtre: {}, alerte: { seuil: 6, minutes: 10 } }, 'Béa');
    await ex.evaluer(1_000_000);
    expect(prevenus).toEqual(['🔎 Alerte journaux : Notify en panne']);
    await ex.evaluer(1_000_000 + 120_000);
    expect(prevenus).toHaveLength(1);
  });
});
