import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { ReglesJournaux } from './regles';
import type { FiltreJournaux, LigneJournal } from '../../shared/types';

const MIN = 60_000;
const ligne = (message: string, service = 'notify'): LigneJournal => ({ t: Date.now(), service, niveau: 'error', message });

function moteur() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'regles-')));
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
  const etat = { lignes: [] as LigneJournal[], erreur: null as string | null, filtres: [] as FiltreJournaux[] };
  const regles = new ReglesJournaux(stockage, tickets, async (f) => {
    etat.filtres.push(f);
    if (etat.erreur) throw new Error(etat.erreur);
    return etat.lignes.slice(0, f.limite);
  });
  return { stockage, tickets, regles, etat };
}

describe('règles de journaux', () => {
  it('valide les champs', () => {
    const { regles } = moteur();
    expect(() => regles.creer({ nom: '' }, 'Alex')).toThrow(/nom/);
    expect(() => regles.creer({ nom: 'x', seuil: 5, minutes: 15 }, 'Alex')).toThrow(/filtre/);
    expect(() => regles.creer({ nom: 'x', niveau: 'error', seuil: 0, minutes: 15 }, 'Alex')).toThrow(/Seuil/);
    expect(() => regles.creer({ nom: 'x', niveau: 'error', seuil: 5, minutes: 7 }, 'Alex')).toThrow(/Fenêtre/);
    const r = regles.creer({ nom: 'x', niveau: 'fatal', texte: 'a', seuil: '5', minutes: 15, priorite: 'P9' }, 'Alex');
    expect(r).toMatchObject({ niveau: '', seuil: 5, priorite: 'P3', actif: true, etat: 'ok' });
    expect(regles.modifier(r.id, { actif: false })).toMatchObject({ actif: false, nom: 'x', seuil: 5 });
    expect(() => regles.modifier(r.id, { seuil: 5000 })).toThrow(/Seuil/);
    expect(() => regles.modifier('inconnue', {})).toThrow(/introuvable/);
  });

  it('seuil atteint : un seul incident, puis plus rien tant qu’il est ouvert', async () => {
    const { regles, tickets, etat } = moteur();
    const r = regles.creer({ nom: 'Erreurs notify', service: 'notify', niveau: 'error', seuil: 3, minutes: 15, priorite: 'P2' }, 'Alex');
    const t0 = Date.now();

    etat.lignes = [ligne('a'), ligne('b')];
    await regles.evaluer(t0);
    expect(r).toMatchObject({ etat: 'ok', dernierComptage: 2, ticket: null });
    expect(etat.filtres[0]).toMatchObject({ service: 'notify', niveau: 'error', minutes: 15, limite: 3 });

    etat.lignes = [ligne('ECONNREFUSED nats:4222'), ligne('b'), ligne('c')];
    await regles.evaluer(t0 + 30_000);
    expect(r).toMatchObject({ etat: 'declenchee', dernierDeclenchement: t0 + 30_000 });
    const t = tickets.trouver(r.ticket!)!;
    expect(t).toMatchObject({ type: 'incident', priorite: 'P2', automatique: true, regle: r.id, ci: 'notify', canal: 'Supervision (alerte)' });
    expect(t.description).toMatch(/ECONNREFUSED/);
    expect(t.description).toMatch(/\/journaux\?minutes=15&service=notify/);

    await regles.evaluer(t0 + 60_000);
    expect(tickets.lister({ type: 'incident', etat: 'tous' })).toHaveLength(1);
    // Le rapprochement avec Alertmanager ne referme pas un incident de règle.
    tickets.synchroniser([]);
    expect(t.statut).toBe('nouveau');
  });

  it('retour à la normale : une note ; pas de nouvel incident avant la fin de la fenêtre', async () => {
    const { regles, tickets, etat } = moteur();
    const r = regles.creer({ nom: 'R', texte: 'timeout', seuil: 2, minutes: 15 }, 'Alex');
    const t0 = Date.now();
    etat.lignes = [ligne('timeout 1'), ligne('timeout 2')];
    await regles.evaluer(t0);
    const t = tickets.trouver(r.ticket!)!;

    etat.lignes = [];
    await regles.evaluer(t0 + MIN);
    expect(r.etat).toBe('ok');
    expect(t.activite.at(-1)?.texte).toMatch(/n’est plus déclenchée/);

    // L'équipe résout, le problème revient dans la fenêtre : pas d'incident tout de suite.
    tickets.modifier(t.numero, { codeResolution: 'Résolu automatiquement', notesResolution: 'ok' }, 'Alex');
    await tickets.changerStatut(t.numero, 'resolu', 'Alex');
    etat.lignes = [ligne('timeout 3'), ligne('timeout 4')];
    await regles.evaluer(t0 + 5 * MIN);
    expect(r.ticket).toBe(t.numero);
    // Une fenêtre plus tard : nouvel incident.
    await regles.evaluer(t0 + 16 * MIN);
    expect(r.ticket).not.toBe(t.numero);
    expect(tickets.lister({ type: 'incident', etat: 'tous' })).toHaveLength(2);
  });

  it('règle inactive ignorée ; erreur de lecture gardée sans rien déclencher', async () => {
    const { regles, tickets, etat } = moteur();
    const off = regles.creer({ nom: 'off', niveau: 'error', seuil: 1, minutes: 15, actif: false }, 'Alex');
    const on = regles.creer({ nom: 'on', niveau: 'error', seuil: 1, minutes: 15 }, 'Alex');
    etat.lignes = [ligne('x')];
    etat.erreur = 'Loki injoignable';
    await regles.evaluer();
    expect(on.erreur).toBe('Loki injoignable');
    expect(tickets.lister({ etat: 'tous' })).toHaveLength(0);
    etat.erreur = null;
    await regles.evaluer();
    expect(on).toMatchObject({ etat: 'declenchee', erreur: null });
    expect(off).toMatchObject({ etat: 'ok', dernierComptage: null });
    expect(etat.filtres.every((f) => f.minutes === 15)).toBe(true);
  });

  it('supprime et limite à 20 règles', () => {
    const { regles } = moteur();
    for (let i = 0; i < 20; i++) regles.creer({ nom: `r${i}`, niveau: 'error', seuil: 1, minutes: 5 }, 'Alex');
    expect(() => regles.creer({ nom: 'de trop', niveau: 'error', seuil: 1, minutes: 5 }, 'Alex')).toThrow(/20/);
    regles.supprimer(regles.lister()[0].id);
    expect(regles.lister()).toHaveLength(19);
  });
});
