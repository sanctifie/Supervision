import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Stockage } from './stockage';
import { Tickets } from './tickets';
import { Comptes } from './comptes';
import { Notifications } from './notifications';
import { config } from './config';
import type { Canaux } from './canaux';

function preparer() {
  const stockage = new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'notif-')));
  const envois: { canal: string; vers: string; texte: string }[] = [];
  const canaux: Canaux = {
    telegramActif: () => true,
    emailActif: () => true,
    telegram: async (vers, texte) => void envois.push({ canal: 'telegram', vers, texte }),
    email: async (vers, _s, texte) => void envois.push({ canal: 'email', vers, texte }),
  };
  let notifications!: Notifications;
  const tickets = new Tickets(stockage, { creerSilence: async () => '', supprimerSilence: async () => undefined, signaler: (e) => notifications.traiter(e) });
  const comptes = new Comptes(stockage, 3_600_000);
  notifications = new Notifications(stockage, comptes, canaux);
  const alex = comptes.installer({ identifiant: 'alex', nom: 'Alex', motDePasse: 'motdepasse-long' });
  const bea = comptes.creer({ identifiant: 'bea', nom: 'Béa', role: 'agent', approbateur: true, motDePasse: 'motdepasse-long' });
  const ndong = comptes.creer({ identifiant: 'ndong', nom: 'Dr Ndong', role: 'demandeur', motDePasse: 'motdepasse-long' });
  comptes.modifierProfil(bea.id, { telegram: '111', email: 'bea@officine.ga' });
  comptes.modifierProfil(ndong.id, { email: 'ndong@officine.ga', notifications: { email: true, telegram: false } });
  const cloche = (id: string) => notifications.lister(id).notifications.map((n) => n.titre);
  return { tickets, notifications, envois, alex, bea, ndong, cloche };
}

describe('notifications', () => {
  it('incident P1 : tous les agents (sauf l’auteur) et la conversation de l’équipe', () => {
    const avant = config.telegramEquipe;
    config.telegramEquipe = '-999';
    const { tickets, envois, alex, bea, ndong, cloche } = preparer();
    tickets.creer('incident', { titre: 'Caisse bloquée', impact: 1, urgence: 1 }, 'Alex');
    expect(cloche(bea.id)[0]).toMatch(/Incident P1/);
    expect(cloche(alex.id)).toHaveLength(0);
    expect(cloche(ndong.id)).toHaveLength(0);
    expect(envois.map((e) => `${e.canal}:${e.vers}`).sort()).toEqual(['email:bea@officine.ga', 'telegram:-999', 'telegram:111']);
    config.telegramEquipe = avant;
  });

  it('assignation, commentaires et notes', async () => {
    const { tickets, alex, bea, ndong, cloche } = preparer();
    const t = tickets.creer('demande', { titre: 'Compte préparatrice', demandeur: 'Dr Ndong' }, 'Dr Ndong');
    tickets.modifier(t.numero, { assigneA: 'Béa' }, 'Alex');
    expect(cloche(bea.id)[0]).toMatch(/Vous êtes assigné/);
    tickets.ajouterActivite(t.numero, 'note', 'interne', 'Alex');
    expect(cloche(bea.id)[0]).toMatch(/Note de Alex/);
    expect(cloche(ndong.id)).toHaveLength(0);
    tickets.ajouterActivite(t.numero, 'commentaire', 'Quel rôle ?', 'Béa');
    expect(cloche(ndong.id)[0]).toMatch(/Réponse sur/);
    tickets.ajouterActivite(t.numero, 'commentaire', 'Préparatrice', 'Dr Ndong');
    expect(cloche(bea.id)[0]).toMatch(/Dr Ndong a écrit/);
    tickets.modifier(t.numero, { notesResolution: 'Compte créé' }, 'Béa');
    await tickets.changerStatut(t.numero, 'resolu', 'Béa');
    expect(cloche(ndong.id)[0]).toMatch(/est résolu/);
    // Alex a seulement été prévenu de l’ouverture (aucun assigné), pas de la suite.
    expect(cloche(alex.id)).toEqual(['Nouvelle demande : Compte préparatrice']);
  });

  it('changement : approbateurs prévenus, puis le demandeur de la décision', async () => {
    const { tickets, alex, bea, cloche } = preparer();
    const c = tickets.creer('changement', { titre: 'MAJ', justification: 'j', planMiseEnOeuvre: 'p', planRetourArriere: 'r' }, 'Alex');
    await tickets.changerStatut(c.numero, 'evaluation', 'Alex');
    expect(cloche(bea.id)[0]).toMatch(/à approuver/);
    expect(cloche(alex.id)).toHaveLength(0);
    tickets.approuver(c.numero, 'approuve', 'OK', 'Béa');
    expect(cloche(alex.id)[0]).toMatch(/approuvé par Béa/);
  });

  it('SLA : une seule alerte par état et par phase', () => {
    const { tickets, bea, cloche } = preparer();
    const t = tickets.creer('incident', { titre: 'Lent', impact: 2, urgence: 2, assigneA: 'Béa' }, 'Alex');
    const avant = cloche(bea.id).length;
    const presque = (t.echeanceReponse as number) - 60_000;
    tickets.verifierSla(presque);
    tickets.verifierSla(presque);
    expect(cloche(bea.id).length).toBe(avant + 1);
    expect(cloche(bea.id)[0]).toMatch(/à risque/);
    tickets.verifierSla((t.echeanceResolution as number) + 60_000);
    expect(cloche(bea.id)[0]).toMatch(/dépassé/);
  });

  it('marquer comme lu', () => {
    const { tickets, notifications, bea } = preparer();
    tickets.creer('incident', { titre: 'X', impact: 1, urgence: 1 }, 'Alex');
    expect(notifications.lister(bea.id).nonLues).toBe(1);
    notifications.marquerLues(bea.id);
    expect(notifications.lister(bea.id).nonLues).toBe(0);
  });
});
