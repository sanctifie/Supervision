import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { Catalogue } from './catalogue';

function preparer() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-'));
  const stockage = new Stockage(dossier);
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
  return { dossier, stockage, tickets, catalogue: new Catalogue(stockage, tickets) };
}

describe('catalogue de demandes', () => {
  it('pose le catalogue de départ une seule fois', () => {
    const { stockage, tickets, catalogue } = preparer();
    expect(catalogue.lister(false).length).toBeGreaterThanOrEqual(8);
    for (const a of catalogue.lister(true)) catalogue.supprimer(a.id);
    expect(new Catalogue(stockage, tickets).lister(true)).toHaveLength(0);
  });

  it('commande : contrôle le formulaire, titre, groupe, réponses', () => {
    const { catalogue } = preparer();
    const compte = catalogue.lister(false).find((a) => a.nom === 'Créer un compte Officina')!;
    expect(() => catalogue.commander(compte.id, { prenom: 'Awa' }, '', 'Dr Ndong')).toThrow(/Nom.*obligatoire/);
    expect(() => catalogue.commander(compte.id, { prenom: 'Awa', nom: 'Moussa', role: 'Astronaute', arrivee: '2026-11-02' }, '', 'Dr Ndong')).toThrow(/choix inconnu/);
    expect(() => catalogue.commander(compte.id, { prenom: 'Awa', nom: 'Moussa', role: 'Comptable', arrivee: '02/11' }, '', 'Dr Ndong')).toThrow(/date invalide/);
    const t = catalogue.commander(compte.id, { prenom: 'Awa', nom: 'Moussa', role: 'Comptable', arrivee: '2026-11-02' }, 'Elle commence lundi.', 'Dr Ndong');
    expect(t).toMatchObject({ type: 'demande', titre: 'Compte Officina : Awa Moussa', groupe: 'Support officine', demandeur: 'Dr Ndong', categorie: 'Accès / compte' });
    expect(t.variables).toContainEqual({ libelle: 'Date d’arrivée', valeur: '02/11/2026' });
    expect(t.description).toContain('Elle commence lundi.');
    expect(t.catalogue?.nom).toBe('Créer un compte Officina');
  });

  it('gestion : champs propres, choix obligatoires, article désactivé', () => {
    const { catalogue } = preparer();
    expect(() => catalogue.creer({ nom: 'X', variables: [{ libelle: 'Type', type: 'choix', options: [] }] })).toThrow(/au moins un choix/);
    const a = catalogue.creer({
      nom: 'Badge',
      modeleTitre: 'Badge pour {qui}',
      variables: [
        { libelle: 'Pour qui ?', cle: 'qui', type: 'texte', obligatoire: true },
        { libelle: 'Pour qui ?', cle: 'qui', type: 'case' },
      ],
    });
    expect(a.variables.map((v) => v.cle)).toEqual(['qui', 'qui_2']);
    expect(catalogue.commander(a.id, { qui: 'Awa', qui_2: true }, '', 'Alex').titre).toBe('Badge pour Awa');
    catalogue.modifier(a.id, { actif: false });
    expect(() => catalogue.commander(a.id, { qui: 'Awa' }, '', 'Alex')).toThrow(/introuvable/);
  });
});
