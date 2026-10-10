import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { BaseConnaissances } from './connaissances';

function preparer() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-')));
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
  return { tickets, kb: new BaseConnaissances(stockage, tickets) };
}

describe('base de connaissances', () => {
  it('numérote, publie, cherche sans accents', () => {
    const { kb } = preparer();
    const a = kb.creer({ titre: 'Imprimante ticket qui ne sort plus rien', contenu: 'Vérifier le rouleau et le câble USB.', motsCles: ['impression'], audience: 'tous' }, 'Béa');
    kb.creer({ titre: 'Réseau lent au comptoir', contenu: 'Redémarrer le routeur.' }, 'Béa');
    expect(a.numero).toBe('KB0001001');
    expect(() => kb.changerStatut(kb.creer({ titre: 'Vide' }, 'Béa').numero, 'publie', 'Béa')).toThrow(/vide/);
    kb.changerStatut(a.numero, 'publie', 'Béa');
    expect(kb.lister({ q: 'reseau' }, true).map((x) => x.titre)).toEqual(['Réseau lent au comptoir']);
    expect(kb.lister({ q: 'IMPRIMANTE câble' }, true)[0].numero).toBe(a.numero);
  });

  it('un demandeur ne voit que les articles publiés ouverts à tous', () => {
    const { kb } = preparer();
    const publicA = kb.creer({ titre: 'Changer son mot de passe', contenu: 'Profil → Mot de passe.', audience: 'tous' }, 'Béa');
    const interne = kb.creer({ titre: 'Redémarrer syncd', contenu: 'docker compose restart syncd', audience: 'equipe' }, 'Béa');
    kb.changerStatut(publicA.numero, 'publie', 'Béa');
    kb.changerStatut(interne.numero, 'publie', 'Béa');
    expect(kb.lister({}, false).map((x) => x.numero)).toEqual([publicA.numero]);
    expect(() => kb.consulter(interne.numero, false)).toThrow(/introuvable/);
    expect(kb.lister({}, true)).toHaveLength(2);
  });

  it('suggère des articles pour un ticket, garde les versions, un avis par personne', () => {
    const { kb, tickets } = preparer();
    const a = kb.creer({ titre: 'Paiement Airtel Money en échec', contenu: 'Vérifier le solde marchand.', audience: 'tous' }, 'Béa');
    kb.changerStatut(a.numero, 'publie', 'Béa');
    expect(kb.suggerer('Le paiement airtel ne passe pas', false).map((x) => x.numero)).toEqual([a.numero]);
    expect(kb.suggerer('imprimante', false)).toEqual([]);
    kb.modifier(a.numero, { contenu: 'Vérifier le solde marchand puis relancer.' }, 'Alex');
    expect(a.versions[0]).toMatchObject({ auteur: 'Béa', contenu: 'Vérifier le solde marchand.' });
    kb.donnerAvis(a.numero, true, false, 'compte-1');
    expect(() => kb.donnerAvis(a.numero, false, false, 'compte-1')).toThrow(/déjà/);
    const t = tickets.creer('incident', { titre: 'Airtel KO' }, 'Alex');
    kb.lierTicket(a.numero, t.numero, 'Alex');
    expect(kb.pourTicket(t.numero, false).map((x) => x.numero)).toEqual([a.numero]);
  });

  it('pré-remplit un article depuis un problème', () => {
    const { kb, tickets } = preparer();
    const p = tickets.creer('probleme', { titre: 'Synchronisation lente le matin', causeRacine: 'Index manquant', contournement: 'Relancer syncd' }, 'Alex');
    const m = kb.modeleDepuis(p);
    expect(m.titre).toBe('Erreur connue : Synchronisation lente le matin');
    expect(m.contenu).toContain('Relancer syncd');
    expect(m.motsCles).toContain('synchronisation');
  });
});
