import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { Deploiements } from './deploiements';
import { versionDeImage } from '../../shared/deploiements';

function moteur() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'depl-')));
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
  return { stockage, tickets, deploiements: new Deploiements(stockage, tickets) };
}

/** Un changement standard de `ci` amené à l'état « en-cours » sans passer par le CAB. */
async function changementEnCours(tickets: Tickets, ci: string, versionCible: string) {
  const c = tickets.creer('changement', { titre: `MAJ ${ci}`, ci, typeChangement: 'standard', versionCible, silencerAlertes: false }, 'Alex');
  tickets.modifier(c.numero, { debutPrevu: Date.now() - 1000, finPrevue: Date.now() + 3_600_000 }, 'Alex');
  await tickets.changerStatut(c.numero, 'planifie', 'Alex');
  await tickets.changerStatut(c.numero, 'en-cours', 'Alex');
  return c;
}

describe('versionDeImage', () => {
  it('lit le tag ou l’empreinte', () => {
    expect(versionDeImage('officina/sales:1.8.3')).toBe('1.8.3');
    expect(versionDeImage('registry:5000/officina/sales:abc123')).toBe('abc123');
    expect(versionDeImage('registry:5000/officina/sales')).toBe('latest');
    expect(versionDeImage('officina/sales@sha256:0123456789abcdef0123')).toBe('sha256:0123456789ab');
  });
});

describe('santé et contexte', () => {
  it('santé à la manière d’Argo CD : inconnu, sain, dégradé, absent, en cours', async () => {
    const { tickets, deploiements } = moteur();
    const sante = (etat?: { enMarche: boolean; statut: 'vert' | 'orange' | 'rouge' }) =>
      deploiements.vue({ sales: { image: 'officina/sales:1.8.2', projet: 'officina' } }, etat ? { sales: etat } : {})[0].sante;
    expect(sante()).toBe('inconnu');
    expect(sante({ enMarche: true, statut: 'vert' })).toBe('sain');
    expect(sante({ enMarche: true, statut: 'orange' })).toBe('sain');
    expect(sante({ enMarche: true, statut: 'rouge' })).toBe('degrade');
    expect(sante({ enMarche: false, statut: 'rouge' })).toBe('absent');
    await changementEnCours(tickets, 'sales', '1.8.3');
    expect(sante({ enMarche: true, statut: 'vert' })).toBe('en-cours');
    expect(sante({ enMarche: true, statut: 'rouge' })).toBe('degrade');
  });

  it('projet, titres des changements et historique du plus récent au plus ancien', async () => {
    const { tickets, deploiements } = moteur();
    deploiements.observer({ sales: 'officina/sales:1.8.2' });
    const c = await changementEnCours(tickets, 'sales', '1.8.3');
    deploiements.observer({ sales: 'officina/sales:1.8.3' });
    const [ligne] = deploiements.vue({ sales: { image: 'officina/sales:1.8.3', projet: 'officina' } }, {});
    expect(ligne).toMatchObject({ projet: 'officina', version: '1.8.3', prevue: '1.8.3', titrePrevu: 'MAJ sales' });
    expect(ligne.historique.map((h) => [h.version, h.changement, h.changementTitre])).toEqual([
      ['1.8.3', c.numero, 'MAJ sales'],
      ['1.8.2', null, null],
    ]);
  });
});

describe('déploiements', () => {
  it('première observation sans bruit, puis déploiement rattaché au changement en cours', async () => {
    const { tickets, deploiements, stockage } = moteur();
    const horsChangement = () => stockage.donnees.evenements.filter((e) => e.detail === 'Déploiement hors changement');
    deploiements.observer({ sales: 'officina/sales:1.8.2' });
    expect(horsChangement()).toHaveLength(0);
    deploiements.observer({ sales: 'officina/sales:1.8.2' });
    expect(stockage.donnees.deploiements).toHaveLength(1);

    const c = await changementEnCours(tickets, 'sales', '1.8.3');
    deploiements.observer({ sales: 'officina/sales:1.8.3' });
    expect(stockage.donnees.deploiements.at(-1)).toMatchObject({ ci: 'sales', version: '1.8.3', changement: c.numero });
    expect(c.activite.at(-1)?.texte).toMatch(/1\.8\.3 en production/);
    expect(horsChangement()).toHaveLength(0);
  });

  it('un déploiement sans changement est signalé', () => {
    const { deploiements, stockage } = moteur();
    deploiements.observer({ sales: 'officina/sales:1.8.2' });
    deploiements.observer({ sales: 'officina/sales:1.9.0' });
    expect(stockage.donnees.deploiements.at(-1)?.changement).toBeNull();
    expect(stockage.donnees.evenements[0]).toMatchObject({ type: 'deploiement', statut: 'orange', detail: 'Déploiement hors changement' });
  });

  it('état de synchronisation : non suivi, à déployer, à jour, écart', async () => {
    const { tickets, deploiements } = moteur();
    const ligne = (images: Record<string, string>) =>
      deploiements
        .vue(Object.fromEntries(Object.entries(images).map(([ci, image]) => [ci, { image, projet: 'officina' }])), { sales: { enMarche: true, statut: 'vert' } })
        .find((v) => v.ci === 'sales')!;
    deploiements.observer({ sales: 'officina/sales:1.8.2' });
    expect(ligne({ sales: 'officina/sales:1.8.2' })).toMatchObject({ synchro: 'non-suivi', version: '1.8.2', enMarche: true });

    const c = await changementEnCours(tickets, 'sales', '1.8.3');
    expect(ligne({ sales: 'officina/sales:1.8.2' })).toMatchObject({ synchro: 'a-deployer', prevue: '1.8.3', changementPrevu: c.numero });
    deploiements.observer({ sales: 'officina/sales:1.8.3' });
    expect(ligne({ sales: 'officina/sales:1.8.3' }).synchro).toBe('synchronise');

    tickets.modifier(c.numero, { resultat: 'reussi' }, 'Alex');
    await tickets.changerStatut(c.numero, 'revue', 'Alex');
    await tickets.changerStatut(c.numero, 'clos', 'Alex');
    expect(ligne({ sales: 'officina/sales:1.8.3' }).synchro).toBe('synchronise');
    // Quelqu'un redéploie une autre version après la clôture : écart.
    expect(ligne({ sales: 'officina/sales:1.9.0' })).toMatchObject({ synchro: 'ecart', version: '1.9.0' });
  });

  it('retour arrière : changement urgent complet, lié au déploiement fautif ; versions inconnues refusées', async () => {
    const { tickets, deploiements } = moteur();
    deploiements.observer({ sales: 'officina/sales:1.8.2' });
    const c = await changementEnCours(tickets, 'sales', '1.8.3');
    deploiements.observer({ sales: 'officina/sales:1.8.3' });

    expect(() => deploiements.retourArriere('sales', '9.9.9', 'Alex')).toThrow(/historique/);
    expect(() => deploiements.retourArriere('sales', '1.8.3', 'Alex')).toThrow(/déjà/);
    expect(() => deploiements.retourArriere('inconnu', '1.0', 'Alex')).toThrow(/Aucun déploiement/);

    const r = deploiements.retourArriere('sales', '1.8.2', 'Alex');
    expect(r).toMatchObject({ type: 'changement', typeChangement: 'urgent', ci: 'sales', versionCible: '1.8.2', statut: 'brouillon' });
    expect(r.liens).toEqual([c.numero]);
    await tickets.changerStatut(r.numero, 'evaluation', 'Alex'); // les plans sont déjà remplis
  });

  it('garde 30 versions par service', () => {
    const { deploiements, stockage } = moteur();
    for (let i = 0; i < 40; i++) deploiements.observer({ sales: `officina/sales:1.0.${i}` });
    const h = stockage.donnees.deploiements.filter((d) => d.ci === 'sales');
    expect(h).toHaveLength(30);
    expect(h.at(-1)?.version).toBe('1.0.39');
  });
});
