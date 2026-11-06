import { config } from '../../config';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';
import { lireTexte, parserPrometheus, type EchantillonTexte } from './uptimekuma';

/** Falco : règles déclenchées, lues sur sa page de métriques Prometheus (metrics.enabled). */

const CRITIQUES = new Set(['Emergency', 'Alert', 'Critical', 'Error']);

export function lectureFalco(echantillons: EchantillonTexte[], lien: string | null): LectureSignal {
  const regles = echantillons
    .filter((e) => e.nom === 'falcosecurity_falco_rules_matches_total' && e.valeur > 0)
    .map((e) => ({ regle: e.etiquettes.rule_name ?? '?', priorite: e.etiquettes.priority ?? '', n: e.valeur }))
    .sort((a, b) => b.n - a.n);
  const critiques = regles.filter((r) => CRITIQUES.has(r.priorite)).reduce((s, r) => s + r.n, 0);
  const avertissements = regles.filter((r) => r.priorite === 'Warning').reduce((s, r) => s + r.n, 0);
  const statut: Statut = critiques ? 'rouge' : avertissements ? 'orange' : 'vert';
  return {
    statut,
    resume: regles.length ? `${regles.length} règle(s) déclenchée(s), ${critiques} événement(s) critique(s)` : 'Aucune règle déclenchée',
    mesures: [
      { cle: 'regles', libelle: 'Règles déclenchées', valeur: regles.length, unite: '', statut: regles.length ? 'orange' : 'vert', detail: 'Depuis le démarrage de Falco' },
      { cle: 'critiques', libelle: 'Événements critiques', valeur: critiques, unite: '', statut: critiques ? 'rouge' : 'vert', detail: 'Emergency, Alert, Critical, Error' },
      { cle: 'avertissements', libelle: 'Avertissements', valeur: avertissements, unite: '', statut: avertissements ? 'orange' : 'vert', detail: 'Priorité Warning' },
    ],
    lignes: regles.slice(0, 15).map((r) => ({
      libelle: r.regle,
      detail: `${r.priorite} · ${r.n} fois`,
      statut: CRITIQUES.has(r.priorite) ? 'rouge' : r.priorite === 'Warning' ? 'orange' : 'vert',
      lien: null,
      t: null,
    })),
    lien,
    verifie: [{ cle: 'securite:runtime', statut: critiques ? 'rouge' : 'vert', detail: `Falco en marche, ${regles.length} règle(s) déclenchée(s)` }],
  };
}

export const falco: SourceSignal = {
  cle: 'falco',
  nom: 'Falco',
  categorie: 'securite',
  variables: 'FALCO_METRICS_URL',
  url: () => config.falcoMetricsUrl || null,
  configure: () => !!config.falcoMetricsUrl,
  async lire() {
    return lectureFalco(parserPrometheus(await lireTexte(`${config.falcoMetricsUrl}/metrics`)), null);
  },
  demo: () =>
    lectureFalco(
      parserPrometheus(
        [
          'falcosecurity_falco_rules_matches_total{priority="Notice",rule_name="Terminal shell in container"} 3',
          'falcosecurity_falco_rules_matches_total{priority="Warning",rule_name="Read sensitive file untrusted"} 1',
          'falcosecurity_falco_rules_matches_total{priority="Error",rule_name="Write below etc"} 0',
        ].join('\n'),
      ),
      null,
    ),
};
