import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Comptes, hacher, verifierHache } from './comptes';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { permissionsDe } from '../../shared/comptes';

function preparer() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'comptes-'));
  const stockage = new Stockage(dossier);
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
  const comptes = new Comptes(stockage, 3_600_000, (a, n) => tickets.renommerPersonne(a, n));
  return { dossier, stockage, comptes, tickets };
}

describe('mots de passe', () => {
  it('hache avec sel et vérifie', () => {
    const h = hacher('un mot de passe solide');
    expect(h).not.toContain('solide');
    expect(hacher('un mot de passe solide')).not.toBe(h);
    expect(verifierHache('un mot de passe solide', h)).toBe(true);
    expect(verifierHache('autre chose', h)).toBe(false);
  });
});

describe('comptes', () => {
  it('installe un seul administrateur, puis refuse', () => {
    const { comptes } = preparer();
    expect(comptes.aucun()).toBe(true);
    const a = comptes.installer({ identifiant: 'Alex', nom: 'Alex Mba', motDePasse: 'motdepasse-long' });
    expect(a.role).toBe('admin');
    expect(a.identifiant).toBe('alex');
    expect(a.doitChangerMotDePasse).toBe(false);
    expect(() => comptes.installer({ identifiant: 'b', nom: 'B', motDePasse: 'motdepasse-long' })).toThrow(/déjà installée/);
  });

  it('refuse un mot de passe trop court et les doublons', () => {
    const { comptes } = preparer();
    expect(() => comptes.installer({ identifiant: 'a', nom: 'A', motDePasse: 'court' })).toThrow(/10 caractères/);
    comptes.installer({ identifiant: 'a', nom: 'A', motDePasse: 'motdepasse-long' });
    expect(() => comptes.creer({ identifiant: 'A', nom: 'Autre', motDePasse: 'motdepasse-long' })).toThrow(/déjà pris/);
    expect(() => comptes.creer({ identifiant: 'b', nom: 'a', motDePasse: 'motdepasse-long' })).toThrow(/déjà utilisé/);
  });

  it('connexion, session persistée, compte désactivé', () => {
    const { comptes, dossier, stockage } = preparer();
    const a = comptes.installer({ identifiant: 'a', nom: 'A', motDePasse: 'motdepasse-long' });
    const b = comptes.creer({ identifiant: 'bea', nom: 'Béa', role: 'agent', motDePasse: 'provisoire-123' });
    expect(b.doitChangerMotDePasse).toBe(true);
    expect(comptes.verifier('bea', 'mauvais-mot-de-passe')).toBeNull();
    expect(comptes.verifier('inconnu', 'provisoire-123')).toBeNull();
    const c = comptes.verifier('BEA', 'provisoire-123');
    expect(c?.nom).toBe('Béa');
    const jeton = comptes.ouvrirSession(b.id);
    expect(comptes.sessionDe(jeton)?.id).toBe(b.id);
    // Persisté : la session survit à un redémarrage.
    stockage.ecrireMaintenant();
    expect(new Comptes(new Stockage(dossier), 3_600_000).sessionDe(jeton)?.id).toBe(b.id);
    comptes.modifier(b.id, { actif: false });
    expect(comptes.sessionDe(jeton)).toBeNull();
    expect(comptes.verifier('bea', 'provisoire-123')).toBeNull();
    expect(a.role).toBe('admin');
  });

  it('protège le dernier administrateur', () => {
    const { comptes } = preparer();
    const a = comptes.installer({ identifiant: 'a', nom: 'A', motDePasse: 'motdepasse-long' });
    expect(() => comptes.modifier(a.id, { role: 'agent' })).toThrow(/administrateur/);
    expect(() => comptes.modifier(a.id, { actif: false })).toThrow(/administrateur/);
    const b = comptes.creer({ identifiant: 'b', nom: 'B', role: 'admin', motDePasse: 'motdepasse-long' });
    comptes.modifier(a.id, { role: 'agent' });
    expect(() => comptes.modifier(b.id, { actif: false })).toThrow(/administrateur/);
  });

  it('changement et réinitialisation du mot de passe', () => {
    const { comptes } = preparer();
    comptes.installer({ identifiant: 'a', nom: 'A', motDePasse: 'motdepasse-long' });
    const b = comptes.creer({ identifiant: 'b', nom: 'B', motDePasse: 'provisoire-123' });
    const autre = comptes.ouvrirSession(b.id);
    const courante = comptes.ouvrirSession(b.id);
    expect(() => comptes.changerMotDePasse(b.id, 'faux', 'nouveau-mot-de-passe')).toThrow(/incorrect/);
    comptes.changerMotDePasse(b.id, 'provisoire-123', 'nouveau-mot-de-passe', courante);
    expect(comptes.sessionDe(courante)).not.toBeNull();
    expect(comptes.sessionDe(autre)).toBeNull();
    expect(comptes.trouver(b.id)?.doitChangerMotDePasse).toBe(false);
    const provisoire = comptes.reinitialiser(b.id);
    expect(comptes.sessionDe(courante)).toBeNull();
    expect(comptes.verifier('b', provisoire)?.doitChangerMotDePasse).toBe(true);
  });

  it('renomme la personne sur les tickets', () => {
    const { comptes, tickets } = preparer();
    const a = comptes.installer({ identifiant: 'a', nom: 'Alex', motDePasse: 'motdepasse-long' });
    const t = tickets.creer('incident', { titre: 'X', assigneA: 'Alex' }, 'Alex');
    comptes.modifier(a.id, { nom: 'Alex Mba' });
    expect(t.assigneA).toBe('Alex Mba');
    expect(t.demandeur).toBe('Alex Mba');
  });
});

describe('permissions', () => {
  it('par rôle', () => {
    expect(permissionsDe({ role: 'demandeur', approbateur: false })).toEqual(['lire', 'creer']);
    expect(permissionsDe({ role: 'agent', approbateur: false })).toContain('agir');
    expect(permissionsDe({ role: 'agent', approbateur: true })).toContain('approuver');
    expect(permissionsDe({ role: 'admin', approbateur: false })).toContain('administrer');
  });

  it('on n’approuve pas son propre changement', async () => {
    const { tickets } = preparer();
    const c = tickets.creer('changement', { titre: 'Y', typeChangement: 'normal', justification: 'j', planMiseEnOeuvre: 'p', planRetourArriere: 'r' }, 'Alex');
    await tickets.changerStatut(c.numero, 'evaluation', 'Alex');
    expect(() => tickets.approuver(c.numero, 'approuve', '', 'Alex')).toThrow(/quelqu’un d’autre/);
    tickets.approuver(c.numero, 'approuve', '', 'Béa');
    expect(c.statut).toBe('approuve');
  });
});
