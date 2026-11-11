import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { Projets } from './projets';

function preparer() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'prj-')));
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
  const projets = new Projets(stockage, tickets);
  projets.creer({ cle: 'ops', nom: 'Exploitation' }, 'Admin');
  return { tickets, projets };
}

describe('projets et sprints', () => {
  it('contrôle la clé du projet et l’appartenance des tâches', () => {
    const { tickets, projets } = preparer();
    expect(() => projets.creer({ cle: 'O', nom: 'X' }, 'Admin')).toThrow(/2 à 6 lettres/);
    expect(() => projets.creer({ cle: 'OPS', nom: 'X' }, 'Admin')).toThrow(/existe déjà/);
    expect(() => projets.creerTache({ titre: 'T', projet: 'XXX' }, 'Awa')).toThrow(/introuvable/);
    expect(() => tickets.creer('tache', { titre: 'T' }, 'Awa')).toThrow(/appartient à un projet/);
    const t = projets.creerTache({ titre: 'Migrer la base', projet: 'OPS', points: 5 }, 'Awa');
    expect(t).toMatchObject({ numero: 'TSK0001001', statut: 'a-faire', projet: 'OPS', sprint: null, points: 5 });
    expect(tickets.modifier(t.numero, { points: 250, projet: 'AUTRE', sprint: 'x' }, 'Awa')).toMatchObject({ points: 100, projet: 'OPS', sprint: null });
    expect(() => projets.supprimer('OPS')).toThrow(/a des tâches/);
  });

  it('un sprint : planifier, démarrer, terminer, vélocité et report au backlog', async () => {
    const { tickets, projets } = preparer();
    projets.creer({ cle: 'WEB', nom: 'Site' }, 'Admin');
    const [a, b, c] = ['A', 'B', 'C'].map((titre, i) => projets.creerTache({ titre, projet: 'OPS', points: i + 1 }, 'Awa'));
    const s1 = projets.creerSprint('OPS', {}, 'Awa');
    expect(s1).toMatchObject({ nom: 'Sprint 1', statut: 'prevu' });
    expect(() => projets.demarrer(s1.id, 14, 'Awa')).toThrow(/au moins une tâche/);
    expect(() => projets.placer(a.numero, projets.creerSprint('WEB', {}, 'Awa').id, 'Awa')).toThrow(/autre projet/);
    projets.placer(a.numero, s1.id, 'Awa');
    projets.placer(b.numero, s1.id, 'Awa');
    const debut = Date.UTC(2026, 10, 2);
    expect(projets.demarrer(s1.id, 10, 'Awa', debut)).toMatchObject({ statut: 'actif', debut, fin: debut + 10 * 86_400_000 });
    const s2 = projets.creerSprint('OPS', { nom: 'Suivant' }, 'Awa');
    projets.placer(c.numero, s2.id, 'Awa');
    expect(() => projets.demarrer(s2.id, 14, 'Awa')).toThrow(/un seul sprint actif/);

    await tickets.changerStatut(a.numero, 'en-cours', 'Awa');
    await tickets.changerStatut(a.numero, 'termine', 'Awa');
    await tickets.changerStatut(b.numero, 'en-cours', 'Awa');
    // La tâche terminée reste visible tant que son sprint n'est pas clos.
    expect(
      projets
        .vue('OPS')
        .taches.map((t) => t.numero)
        .sort(),
    ).toEqual([a.numero, b.numero, c.numero].sort());
    expect(projets.terminer(s1.id, 'Awa')).toMatchObject({ statut: 'termine', bilan: { terminees: 1, reportees: 1, points: 1 } });
    expect(tickets.trouver(b.numero)).toMatchObject({ sprint: null, statut: 'en-cours' });
    expect(
      projets
        .vue('OPS')
        .taches.map((t) => t.numero)
        .sort(),
    ).toEqual([b.numero, c.numero].sort());
    expect(projets.vue('OPS').sprints.map((s) => s.statut)).toEqual(['prevu', 'termine']);
    expect(() => projets.placer(b.numero, s1.id, 'Awa')).toThrow(/terminé/);
    expect(() => projets.supprimerSprint(s1.id, 'Awa')).toThrow(/pas encore démarré/);
    projets.supprimerSprint(s2.id, 'Awa');
    expect(tickets.trouver(c.numero)?.sprint).toBeNull();
    expect(projets.lister().find((p) => p.cle === 'OPS')).toMatchObject({ ouvertes: 2, sprintActif: null });
  });
});
