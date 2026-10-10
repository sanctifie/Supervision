import { describe, expect, it } from 'vitest';
import { analyserMetier, analyserSauvegardes, prioriteDe } from './analyse';
import { evaluer, pire, SEUILS } from '../../shared/seuils';

describe('seuils du guide', () => {
  it('colore selon warning / critique', () => {
    expect(evaluer(50, SEUILS.cpu)).toBe('vert');
    expect(evaluer(85, SEUILS.cpu)).toBe('orange');
    expect(evaluer(96, SEUILS.cpu)).toBe('rouge');
    expect(evaluer(null, SEUILS.cpu)).toBe('inconnu');
  });
  it('gère les seuils « vers le bas » (certificat)', () => {
    expect(evaluer(60, SEUILS.certificat)).toBe('vert');
    expect(evaluer(20, SEUILS.certificat)).toBe('orange');
    expect(evaluer(5, SEUILS.certificat)).toBe('rouge');
  });
  it('prend le pire statut, « inconnu » ne masque rien', () => {
    expect(pire('vert', 'inconnu', 'orange')).toBe('orange');
    expect(pire('inconnu')).toBe('inconnu');
  });
});

describe('priorités', () => {
  it('critique → P1, attention → P2 ou P3', () => {
    expect(prioriteDe({ nom: 'ServiceInjoignable', gravite: 'critique' })).toBe('P1');
    expect(prioriteDe({ nom: 'ApiLente', gravite: 'attention' })).toBe('P2');
    expect(prioriteDe({ nom: 'DisquePresquePlein', gravite: 'attention' })).toBe('P3');
    expect(prioriteDe({ nom: 'X', gravite: 'attention', priorite: 'P1' })).toBe('P1');
  });
});

describe('métier', () => {
  const brut = { ventesHeure: 0, ventesJour: 100, ventesJ7MemeHeure: 30, connexionsRefusees1h: 2, serieVentes: [], serieVentesJ7: [] };
  it('zéro vente en heure d’ouverture = anomalie rouge', () => {
    const midi = Date.parse('2026-10-10T11:00:00Z'); // 12 h à Libreville
    const v = analyserMetier(brut, { fuseau: 'Africa/Libreville', ouverture: 8, fermeture: 20, maintenant: midi });
    expect(v.anomalie).not.toBeNull();
    expect(v.statut).toBe('rouge');
  });
  it('la nuit, zéro vente est normal', () => {
    const nuit = Date.parse('2026-10-10T01:00:00Z');
    const v = analyserMetier(brut, { fuseau: 'Africa/Libreville', ouverture: 8, fermeture: 20, maintenant: nuit });
    expect(v.anomalie).toBeNull();
  });
});

describe('sauvegardes', () => {
  it('orange après 26 h, rouge sans sauvegarde', () => {
    const t = Date.now();
    expect(analyserSauvegardes({ derniereReussite: t - 30 * 3600_000, tailleOctets: 1 }, t).statut).toBe('orange');
    expect(analyserSauvegardes({ derniereReussite: null, tailleOctets: null }, t).statut).toBe('rouge');
  });
});
