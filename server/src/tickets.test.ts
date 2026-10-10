import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErreurMetier, Tickets } from './tickets';
import { Stockage } from './stockage';
import { SLA, etatSla, prioriteDeMatrice } from '../../shared/itsm';
import { calendrierParDefaut } from '../../shared/calendrier';
import type { Alerte } from '../../shared/types';

function moteur() {
  const silences: string[] = [];
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'itsm-')));
  const tickets = new Tickets(stockage, {
    creerSilence: async (ci) => {
      silences.push(ci);
      return `s-${ci}`;
    },
    supprimerSilence: async (id) => {
      silences.splice(silences.indexOf(id.slice(2)), 1);
    },
  });
  // Délais en temps calendaire : les tests ne dépendent pas de l'heure à laquelle ils tournent.
  stockage.donnees.parametres = { calendrier: { ...calendrierParDefaut('Africa/Libreville', 8, 20), jours: [] }, sla: SLA };
  return { tickets, silences, stockage };
}

const alerte = (id: string, priorite: Alerte['priorite'], debut: number): Alerte => ({
  id,
  nom: 'ServiceInjoignable',
  gravite: 'critique',
  resume: 'notify ne répond plus',
  action: '',
  debut,
  labels: { service: 'notify' },
  silencieuse: false,
  priorite,
  runbook: null,
});

describe('matrice de priorité', () => {
  it('impact × urgence → P1..P4', () => {
    expect(prioriteDeMatrice(1, 1)).toBe('P1');
    expect(prioriteDeMatrice(1, 2)).toBe('P2');
    expect(prioriteDeMatrice(2, 2)).toBe('P3');
    expect(prioriteDeMatrice(3, 3)).toBe('P4');
  });
});

describe('incidents', () => {
  it('numérote, calcule le SLA et exige une résolution documentée', async () => {
    const { tickets } = moteur();
    const t = tickets.creer('incident', { titre: 'Caisse bloquée', impact: 1, urgence: 1 }, 'Alex');
    expect(t.numero).toBe('INC0001001');
    expect(t.priorite).toBe('P1');
    expect(t.echeanceResolution! - t.creeLe).toBe(4 * 3_600_000);
    expect(tickets.creer('incident', { titre: 'Deux' }, 'Alex').numero).toBe('INC0001002');

    await tickets.changerStatut(t.numero, 'en-cours', 'Alex');
    expect(t.assigneA).toBe('Alex');
    expect(t.prisEnChargeLe).not.toBeNull();
    await expect(tickets.changerStatut(t.numero, 'resolu', 'Alex')).rejects.toThrow(ErreurMetier);
    tickets.modifier(t.numero, { codeResolution: 'Résolu (contournement)', notesResolution: 'Poste redémarré' }, 'Alex');
    await tickets.changerStatut(t.numero, 'resolu', 'Alex');
    expect(t.resoluLe).not.toBeNull();
    expect(etatSla(t).etat).toBe('tenu');
    // Pas de retour en arrière arbitraire.
    await expect(tickets.changerStatut(t.numero, 'nouveau', 'Alex')).rejects.toThrow(/impossible/);
  });

  it('recalcule la priorité et le SLA quand l’impact change', () => {
    const { tickets } = moteur();
    const t = tickets.creer('incident', { titre: 'Lent', impact: 3, urgence: 3 }, 'Alex');
    expect(t.priorite).toBe('P4');
    tickets.modifier(t.numero, { impact: 1, urgence: 2 }, 'Alex');
    expect(t.priorite).toBe('P2');
    expect(t.echeanceResolution! - t.creeLe).toBe(8 * 3_600_000);
    expect(t.activite.some((a) => a.texte.includes('P4 → P2'))).toBe(true);
  });

  it('ouvre un incident par alerte P1, le résout seul si personne ne l’a pris', () => {
    const { tickets } = moteur();
    const t0 = Date.now() - 10 * 60_000;
    tickets.synchroniser([alerte('a1', 'P1', t0), alerte('a3', 'P3', t0)]);
    tickets.synchroniser([alerte('a1', 'P1', t0)]);
    const liste = tickets.lister({ type: 'incident' });
    expect(liste).toHaveLength(1);
    expect(liste[0].ci).toBe('notify');
    tickets.synchroniser([]);
    expect(tickets.lister({ type: 'incident', etat: 'clos' })[0].statut).toBe('resolu');
  });

  it('ne résout pas seul un incident pris en charge', async () => {
    const { tickets } = moteur();
    tickets.synchroniser([alerte('a1', 'P1', Date.now())]);
    const n = tickets.lister({ type: 'incident' })[0].numero;
    await tickets.changerStatut(n, 'en-cours', 'Alex');
    tickets.synchroniser([]);
    expect(tickets.trouver(n)!.statut).toBe('en-cours');
  });
});

describe('problèmes', () => {
  it('erreur connue exige un contournement, résolution une cause racine', async () => {
    const { tickets } = moteur();
    const inc = tickets.creer('incident', { titre: 'Sync lente' }, 'Alex');
    const p = tickets.creer('probleme', { titre: 'Synchronisation lente récurrente' }, 'Alex', { lien: inc.numero });
    expect(inc.liens).toContain(p.numero);
    await tickets.changerStatut(p.numero, 'analyse', 'Alex');
    await expect(tickets.changerStatut(p.numero, 'erreur-connue', 'Alex')).rejects.toThrow(/contournement/);
    tickets.modifier(p.numero, { contournement: 'Relancer syncd' }, 'Alex');
    await tickets.changerStatut(p.numero, 'erreur-connue', 'Alex');
    await expect(tickets.changerStatut(p.numero, 'resolu', 'Alex')).rejects.toThrow(/cause racine/);
  });
});

describe('changements', () => {
  it('normal : plans, approbation, fenêtre, silence pendant la mise en œuvre, résultat', async () => {
    const { tickets, silences } = moteur();
    const c = tickets.creer('changement', { titre: 'Mise à jour 1.2', ci: 'sales', typeChangement: 'normal' }, 'Alex');
    expect(c.numero).toBe('CHG0001001');
    await expect(tickets.changerStatut(c.numero, 'evaluation', 'Alex')).rejects.toThrow(/justification/);
    await expect(tickets.changerStatut(c.numero, 'planifie', 'Alex')).rejects.toThrow(/standard/);
    tickets.modifier(c.numero, { justification: 'Correctifs', planMiseEnOeuvre: 'deployer.sh', planRetourArriere: 'image précédente' }, 'Alex');
    await tickets.changerStatut(c.numero, 'evaluation', 'Alex');
    expect(() => tickets.approuver(c.numero, 'rejete', '', 'Bea')).toThrow(/Expliquer/);
    await expect(tickets.changerStatut(c.numero, 'rejete', 'Bea')).rejects.toThrow(/Approbation/);
    expect(tickets.transitions(c).map((x) => x.statut)).not.toContain('rejete');
    tickets.approuver(c.numero, 'approuve', 'OK CAB', 'Bea');
    expect(c.statut).toBe('approuve');
    await expect(tickets.changerStatut(c.numero, 'planifie', 'Alex')).rejects.toThrow(/fenêtre/);
    const debut = Date.now() + 3_600_000;
    tickets.modifier(c.numero, { debutPrevu: debut, finPrevue: debut + 3_600_000 }, 'Alex');
    await tickets.changerStatut(c.numero, 'planifie', 'Alex');
    await tickets.changerStatut(c.numero, 'en-cours', 'Alex');
    expect(silences).toEqual(['sales']);
    await tickets.changerStatut(c.numero, 'revue', 'Alex');
    expect(silences).toEqual([]);
    await expect(tickets.changerStatut(c.numero, 'clos', 'Alex')).rejects.toThrow(/résultat/);
    tickets.modifier(c.numero, { resultat: 'reussi' }, 'Alex');
    await tickets.changerStatut(c.numero, 'clos', 'Alex');
    expect(c.closLe).not.toBeNull();
  });

  it('standard : planifiable sans approbation ; détecte les chevauchements', async () => {
    const { tickets } = moteur();
    const debut = Date.now() + 86_400_000;
    const a = tickets.creer('changement', { titre: 'Purge images', ci: 'serveur', typeChangement: 'standard', debutPrevu: debut, finPrevue: debut + 3_600_000 }, 'Alex');
    await tickets.changerStatut(a.numero, 'planifie', 'Alex');
    const b = tickets.creer('changement', { titre: 'Noyau', ci: 'serveur', debutPrevu: debut + 1_800_000, finPrevue: debut + 7_200_000 }, 'Alex');
    expect(tickets.conflits(b).map((x) => x.numero)).toEqual([a.numero]);
    expect(tickets.calendrier(debut - 1, debut + 86_400_000)).toHaveLength(2);
  });
});

describe('stockage', () => {
  it('migre les anciens incidents et garde les numéros', () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'itsm-'));
    fs.writeFileSync(
      path.join(dossier, 'etat.json'),
      JSON.stringify({
        version: 1,
        incidents: [
          { id: 'x', titre: 'Ancien', priorite: 'P1', statut: 'resolu', detecteLe: 1, acquitteLe: 2, resoluLe: 3, alertes: [], journal: [], postMortem: '', automatique: true },
        ],
      }),
    );
    const stockage = new Stockage(dossier);
    const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined });
    expect(tickets.lister({ etat: 'tous' })[0]).toMatchObject({ numero: 'INC0001001', titre: 'Ancien', statut: 'resolu' });
    expect(tickets.creer('incident', { titre: 'Nouveau' }, 'Alex').numero).toBe('INC0001002');
  });

  it('met de côté un fichier illisible au lieu de l’écraser', () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'itsm-'));
    fs.writeFileSync(path.join(dossier, 'etat.json'), '{ cassé');
    new Stockage(dossier);
    expect(fs.readdirSync(dossier).some((f) => f.startsWith('etat.json.illisible-'))).toBe(true);
  });
});

describe('SLA en heures ouvrées', () => {
  const lbv = (iso: string) => Date.parse(`${iso}+01:00`);
  const H = 3_600_000;
  function avecCalendrier() {
    const m = moteur();
    m.stockage.donnees.parametres = { calendrier: calendrierParDefaut('Africa/Libreville', 8, 20), sla: SLA };
    return m;
  }

  it('P3 ouvert le vendredi soir : la prise en charge court samedi matin', () => {
    const { tickets } = avecCalendrier();
    const t = tickets.creer('incident', { titre: 'Imprimante', impact: 2, urgence: 2 }, 'Alex', { creeLe: lbv('2026-10-09T19:00:00') });
    // 4 h ouvrées : 1 h vendredi (19-20 h) + 3 h samedi (8-11 h).
    expect(t.echeanceReponse).toBe(lbv('2026-10-10T11:00:00'));
  });

  it('P1 reste en 24 h/24', () => {
    const { tickets } = avecCalendrier();
    const t = tickets.creer('incident', { titre: 'Panne', impact: 1, urgence: 1 }, 'Alex', { creeLe: lbv('2026-10-10T23:00:00') });
    expect(t.echeanceResolution! - t.creeLe).toBe(4 * H);
  });

  it('« En attente » met le SLA en pause et repousse l’échéance', async () => {
    const { tickets } = moteur();
    const t = tickets.creer('incident', { titre: 'Attente fournisseur', impact: 2, urgence: 2 }, 'Alex');
    const avant = t.echeanceResolution!;
    await tickets.changerStatut(t.numero, 'en-cours', 'Alex');
    await tickets.changerStatut(t.numero, 'en-attente', 'Alex');
    expect(etatSla(t).etat).toBe('pause');
    t.pauseDepuis = Date.now() - 2 * H; // deux heures d'attente
    await tickets.changerStatut(t.numero, 'en-cours', 'Alex');
    expect(t.pauseDepuis).toBeNull();
    expect(Math.round((t.echeanceResolution! - avant) / 60_000)).toBe(120);
    // Les pauses sont gardées si la priorité change.
    tickets.modifier(t.numero, { impact: 1 }, 'Alex');
    expect(t.priorite).toBe('P2');
    expect(Math.round((t.echeanceResolution! - t.creeLe) / 60_000)).toBe(8 * 60 + 120);
    expect(SLA.incident.P3.resolution).toBe(36 * H);
  });
});
