import { describe, expect, it } from 'vitest';
import { ajouterHeuresOuvrees, calendrierParDefaut, heuresOuvreesEntre, instantLocal, partiesLocales } from './calendrier';

const cal = calendrierParDefaut('Africa/Libreville', 8, 20); // lun-sam, 8 h - 20 h
const H = 3_600_000;
const lbv = (iso: string) => Date.parse(`${iso}+01:00`);
const local = (t: number) => {
  const p = partiesLocales(t, 'Africa/Libreville');
  return `${p.annee}-${String(p.mois).padStart(2, '0')}-${String(p.jour).padStart(2, '0')} ${String(p.heure).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

describe('calendrier de service', () => {
  it('convertit une heure locale en instant', () => {
    expect(instantLocal(2026, 10, 9, 8 * 60, 'Africa/Libreville')).toBe(lbv('2026-10-09T08:00:00'));
    // Paris, changement d'heure du 25 octobre 2026 : 12 h locale = 11 h UTC.
    expect(new Date(instantLocal(2026, 10, 26, 12 * 60, 'Europe/Paris')).toISOString()).toBe('2026-10-26T11:00:00.000Z');
  });

  it('reporte au lendemain matin en dehors des heures', () => {
    expect(local(ajouterHeuresOuvrees(lbv('2026-10-09T19:00:00'), 2 * H, cal))).toBe('2026-10-10 09:00'); // ven → sam
    expect(local(ajouterHeuresOuvrees(lbv('2026-10-10T19:00:00'), 2 * H, cal))).toBe('2026-10-12 09:00'); // sam → lun (dimanche fermé)
    expect(local(ajouterHeuresOuvrees(lbv('2026-10-12T03:00:00'), 1 * H, cal))).toBe('2026-10-12 09:00'); // la nuit ne compte pas
  });

  it('saute les jours fériés', () => {
    expect(local(ajouterHeuresOuvrees(lbv('2026-12-24T19:00:00'), 2 * H, cal))).toBe('2026-12-26 09:00');
    const avecPaques = { ...cal, feries: [...cal.feries, '2026-04-06'] };
    expect(local(ajouterHeuresOuvrees(lbv('2026-04-04T19:30:00'), 1 * H, avecPaques))).toBe('2026-04-07 08:30');
  });

  it('compte les heures ouvrées entre deux instants', () => {
    expect(heuresOuvreesEntre(lbv('2026-10-09T18:00:00'), lbv('2026-10-12T10:00:00'), cal) / H).toBe(2 + 12 + 2);
    expect(heuresOuvreesEntre(lbv('2026-10-11T00:00:00'), lbv('2026-10-11T23:00:00'), cal)).toBe(0);
  });

  it('sans jour ouvré, retombe sur le temps calendaire', () => {
    const vide = { ...cal, jours: [] };
    expect(ajouterHeuresOuvrees(1000, 5000, vide)).toBe(6000);
  });
});
