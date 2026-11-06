import fs from 'node:fs';
import { config } from '../../config';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/** AIDE : intégrité des fichiers système, d'après la sortie de « aide --check ». */

export interface RapportAide {
  ajoutes: number;
  supprimes: number;
  modifies: number;
  total: number | null;
  chemins: { chemin: string; type: 'ajouté' | 'supprimé' | 'modifié' }[];
}

/** Totaux « Added/Removed/Changed entries: n » et chemins des sections détaillées (`f++++++++++: /etc/x`). */
export function parserAide(texte: string): RapportAide {
  const r: RapportAide = { ajoutes: 0, supprimes: 0, modifies: 0, total: null, chemins: [] };
  let section: RapportAide['chemins'][number]['type'] | null = null;
  for (const brut of texte.split('\n')) {
    const ligne = brut.trim();
    const total = /^(Added|Removed|Changed) entries:\s+(\d+)/.exec(ligne);
    const nombre = /^(?:Number of entries|Total number of entries):\s+(\d+)/.exec(ligne);
    if (total) r[total[1] === 'Added' ? 'ajoutes' : total[1] === 'Removed' ? 'supprimes' : 'modifies'] = Number(total[2]);
    else if (nombre) r.total = Number(nombre[1]);
    else if (/^Added entries:$/.test(ligne)) section = 'ajouté';
    else if (/^Removed entries:$/.test(ligne)) section = 'supprimé';
    else if (/^Changed entries:$/.test(ligne)) section = 'modifié';
    else if (/^Detailed information/.test(ligne)) section = null;
    const chemin = /^[fdlcbps][^:]{0,30}:\s+(\/\S+)/.exec(ligne);
    if (section && chemin && r.chemins.length < 20) r.chemins.push({ chemin: chemin[1], type: section });
  }
  return r;
}

export function lectureAide(r: RapportAide, date: number | null, maintenant = Date.now()): LectureSignal {
  const ecarts = r.ajoutes + r.supprimes + r.modifies;
  const statut: Statut = ecarts ? 'orange' : 'vert';
  const ageH = date === null ? null : (maintenant - date) / 3_600_000;
  return {
    statut,
    resume: ecarts ? `${r.modifies} fichier(s) modifié(s), ${r.ajoutes} ajouté(s), ${r.supprimes} supprimé(s)` : 'Aucun écart : les fichiers système sont intacts',
    mesures: [
      { cle: 'modifies', libelle: 'Modifiés', valeur: r.modifies, unite: '', statut: r.modifies ? 'orange' : 'vert', detail: 'Contenu ou attributs changés' },
      { cle: 'ajoutes', libelle: 'Ajoutés', valeur: r.ajoutes, unite: '', statut: r.ajoutes ? 'orange' : 'vert', detail: 'Nouveaux fichiers surveillés' },
      { cle: 'supprimes', libelle: 'Supprimés', valeur: r.supprimes, unite: '', statut: r.supprimes ? 'orange' : 'vert', detail: 'Fichiers disparus' },
      { cle: 'total', libelle: 'Fichiers surveillés', valeur: r.total, unite: '', statut: 'vert', detail: 'Entrées de la base AIDE' },
      { cle: 'age', libelle: 'Âge du contrôle', valeur: ageH, unite: 'h', statut: ageH !== null && ageH > 48 ? 'orange' : 'vert', detail: 'Orange au-delà de 48 h' },
    ],
    lignes: r.chemins.map((c) => ({ libelle: c.chemin, detail: c.type, statut: 'orange', lien: null, t: null })),
    lien: null,
    verifie: [{ cle: 'securite:integrite', statut, detail: ecarts ? `AIDE : ${ecarts} écart(s) à vérifier` : 'AIDE : aucun écart' }],
  };
}

export const aide: SourceSignal = {
  cle: 'aide',
  nom: 'AIDE',
  categorie: 'securite',
  variables: 'AIDE_RAPPORT',
  url: () => null,
  configure: () => !!config.aideRapport,
  async lire() {
    if (!fs.existsSync(config.aideRapport)) throw new Error(`Rapport introuvable (${config.aideRapport}) : planifier « aide --check > rapport » et monter le fichier`);
    return lectureAide(parserAide(fs.readFileSync(config.aideRapport, 'utf8')), fs.statSync(config.aideRapport).mtimeMs);
  },
  demo: () => lectureAide({ ajoutes: 0, supprimes: 0, modifies: 0, total: 48213, chemins: [] }, Date.now() - 5 * 3_600_000),
};
