import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { Applications } from './applications';
import { identifiantDe } from '../../shared/applications';

function moteur() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'apps-')));
  const applications = new Applications(stockage);
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined }, applications);
  return { stockage, applications, tickets };
}

describe('identifiantDe', () => {
  it('fait un identifiant lisible', () => {
    expect(identifiantDe('Mon Appli n°2 — été')).toBe('mon-appli-n-2-ete');
    expect(identifiantDe('???')).toBe('application');
  });
});

describe('applications', () => {
  it('Officina est posée au premier démarrage, une seule fois', () => {
    const { applications, stockage } = moteur();
    expect(applications.lister().map((a) => a.id)).toEqual(['officina']);
    expect(applications.deCi('sales')?.id).toBe('officina');
    expect(applications.deProjet('officina')?.nom).toBe('Officina');
    applications.supprimer('officina');
    // Tout supprimé : un redémarrage ne ressuscite pas Officina.
    expect(new Applications(stockage).lister()).toHaveLength(0);
  });

  it('valide, refuse les doublons d’élément et de projet, identifiants uniques', () => {
    const { applications } = moteur();
    expect(() => applications.creer({ nom: ' ' }, 'Alex')).toThrow(/nom/);
    expect(() => applications.creer({ nom: 'X', services: ['bon', '<script>'] }, 'Alex')).toThrow(/invalide/);
    expect(() => applications.creer({ nom: 'X', services: ['sales'] }, 'Alex')).toThrow(/appartient déjà à l’application Officina/);
    expect(() => applications.creer({ nom: 'X', projet: 'officina' }, 'Alex')).toThrow(/déjà celui/);
    const a = applications.creer({ nom: 'Boutique en ligne', projet: 'shop', services: 'web, api\ndb ,web' }, 'Alex');
    expect(a).toMatchObject({ id: 'boutique-en-ligne', projet: 'shop', services: ['web', 'api', 'db'] });
    expect(applications.creer({ nom: 'Boutique en ligne' }, 'Alex').id).toBe('boutique-en-ligne-2');
    expect(applications.deCi('api')?.id).toBe('boutique-en-ligne');
    expect(applications.modifier(a.id, { description: 'Site', services: ['web'] }).services).toEqual(['web']);
    expect(() => applications.modifier(a.id, { services: ['gateway'] })).toThrow(/Officina/);
    expect(() => applications.modifier('inconnue', {})).toThrow(/introuvable/);
  });
});

describe('tickets et applications', () => {
  it('l’application se déduit de l’élément, se choisit, se filtre', () => {
    const { applications, tickets } = moteur();
    applications.creer({ nom: 'Boutique', services: ['web'] }, 'Alex');
    const a = tickets.creer('incident', { titre: 'Caisse HS', ci: 'sales' }, 'Alex');
    const b = tickets.creer('incident', { titre: 'Site lent', ci: 'web' }, 'Alex');
    const c = tickets.creer('incident', { titre: 'Autre', application: 'boutique' }, 'Alex');
    const d = tickets.creer('incident', { titre: 'Sans', application: 'inconnue' }, 'Alex');
    expect([a.application, b.application, c.application, d.application]).toEqual(['officina', 'boutique', 'boutique', null]);
    expect(tickets.lister({ application: 'boutique' }).map((t) => t.numero)).toEqual(expect.arrayContaining([b.numero, c.numero]));
    expect(tickets.lister({ application: 'boutique' })).toHaveLength(2);

    tickets.modifier(d.numero, { ci: 'web' }, 'Alex');
    expect(d.application).toBe('boutique');
    tickets.modifier(d.numero, { application: 'inconnue' }, 'Alex');
    expect(d.application).toBe('boutique');
    tickets.modifier(d.numero, { application: 'officina' }, 'Alex');
    expect(d.application).toBe('officina');
  });

  it('les éléments proposés viennent des applications ; supprimer détache les tickets ; un nouvel élément rattache les anciens', () => {
    const { applications, tickets } = moteur();
    const t = tickets.creer('incident', { titre: 'Mystère', ci: 'cache' }, 'Alex');
    expect(t.application).toBeNull();
    expect(tickets.elementsConfiguration()).toEqual(expect.arrayContaining(['sales', 'cache']));
    applications.creer({ nom: 'Boutique', services: ['cache'] }, 'Alex');
    expect(t.application).toBe('boutique');
    applications.supprimer('boutique');
    expect(t.application).toBeNull();
    expect(tickets.elementsConfiguration()).toContain('cache');
  });
});
