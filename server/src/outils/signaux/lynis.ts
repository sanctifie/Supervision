import fs from 'node:fs';
import { config } from '../../config';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/** Lynis : indice de durcissement, avertissements et suggestions du dernier audit (/var/log/lynis-report.dat). */

export interface RapportLynis {
  indice: number | null;
  version: string;
  date: number | null;
  avertissements: { test: string; texte: string }[];
  suggestions: { test: string; texte: string }[];
}

/** Lignes `cle=valeur` ; `warning[]` et `suggestion[]` valent `TEST-ID|texte|…`. */
export function parserLynis(texte: string): RapportLynis {
  const r: RapportLynis = { indice: null, version: '', date: null, avertissements: [], suggestions: [] };
  for (const ligne of texte.split('\n')) {
    const i = ligne.indexOf('=');
    if (ligne.startsWith('#') || i < 1) continue;
    const cle = ligne.slice(0, i).trim();
    const valeur = ligne.slice(i + 1).trim();
    if (cle === 'hardening_index') r.indice = Number(valeur) || null;
    else if (cle === 'lynis_version') r.version = valeur;
    else if (cle === 'report_datetime_end') r.date = Date.parse(valeur.replace(' ', 'T')) || null;
    else if (cle === 'warning[]' || cle === 'suggestion[]') {
      const [test, t = ''] = valeur.split('|');
      (cle === 'warning[]' ? r.avertissements : r.suggestions).push({ test, texte: t });
    }
  }
  return r;
}

export function lectureLynis(r: RapportLynis, maintenant = Date.now()): LectureSignal {
  const statut: Statut = r.indice === null ? 'inconnu' : r.indice < 50 ? 'rouge' : r.indice < 70 ? 'orange' : 'vert';
  const ageH = r.date === null ? null : (maintenant - r.date) / 3_600_000;
  const ligne = (x: { test: string; texte: string }, s: Statut) => ({ libelle: x.test, detail: x.texte, statut: s, lien: `https://cisofy.com/lynis/controls/${x.test}/`, t: null });
  return {
    statut,
    resume: r.indice === null ? 'Indice absent du rapport' : `Indice de durcissement ${r.indice} %, ${r.avertissements.length} avertissement(s)`,
    mesures: [
      {
        cle: 'indice',
        libelle: 'Indice de durcissement',
        valeur: r.indice,
        unite: '%',
        statut,
        detail: `Lynis ${r.version}`.trim(),
        seuilWarning: '< 70 %',
        seuilCritique: '< 50 %',
      },
      {
        cle: 'avertissements',
        libelle: 'Avertissements',
        valeur: r.avertissements.length,
        unite: '',
        statut: r.avertissements.length ? 'orange' : 'vert',
        detail: 'À traiter en priorité',
      },
      { cle: 'suggestions', libelle: 'Suggestions', valeur: r.suggestions.length, unite: '', statut: 'vert', detail: 'Améliorations proposées' },
      { cle: 'age', libelle: 'Âge de l’audit', valeur: ageH, unite: 'h', statut: ageH !== null && ageH > 30 * 24 ? 'orange' : 'vert', detail: 'Orange au-delà de 30 jours' },
    ],
    lignes: [...r.avertissements.map((a) => ligne(a, 'orange')), ...r.suggestions.slice(0, 10).map((s) => ligne(s, 'vert'))],
    lien: null,
    verifie: [{ cle: 'securite:durcissement', statut, detail: `Audit Lynis : indice ${r.indice ?? '?'} %` }],
  };
}

export const lynis: SourceSignal = {
  cle: 'lynis',
  nom: 'Lynis',
  categorie: 'vulnerabilites',
  variables: 'LYNIS_RAPPORT',
  url: () => null,
  configure: () => !!config.lynisRapport,
  async lire() {
    if (!fs.existsSync(config.lynisRapport)) throw new Error(`Rapport introuvable (${config.lynisRapport}) : lancer « lynis audit system » et monter /var/log/lynis-report.dat`);
    const r = parserLynis(fs.readFileSync(config.lynisRapport, 'utf8'));
    return lectureLynis({ ...r, date: r.date ?? fs.statSync(config.lynisRapport).mtimeMs });
  },
  demo: () =>
    lectureLynis({
      indice: 74,
      version: '3.1.4',
      date: Date.now() - 2 * 86_400_000,
      avertissements: [{ test: 'KRNL-5830', texte: 'Reboot of system is most likely needed' }],
      suggestions: [
        { test: 'SSH-7408', texte: 'Consider hardening SSH configuration: MaxAuthTries (6 --> 3)' },
        { test: 'PKGS-7420', texte: 'Install debsums utility for the verification of packages' },
        { test: 'FILE-6310', texte: 'To decrease the impact of a full /var file system, place /var on a separate partition' },
      ],
    }),
};
