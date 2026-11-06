import { config } from '../config';
import { lireJson } from '../fournisseurs/clients';
import type { QualiteCode } from '../../../shared/outils';
import type { Mesure, Statut } from '../../../shared/types';

/** SonarQube (ou SonarCloud) : porte qualité et mesures du projet (Web API, jeton). */

const METRIQUES: { cle: string; libelle: string; unite: string; statut: (v: number) => Statut; detail: string }[] = [
  { cle: 'bugs', libelle: 'Bugs', unite: '', statut: (v) => (v ? 'orange' : 'vert'), detail: 'Défauts de fiabilité détectés' },
  { cle: 'vulnerabilities', libelle: 'Vulnérabilités', unite: '', statut: (v) => (v ? 'rouge' : 'vert'), detail: 'Failles de sécurité détectées' },
  { cle: 'security_hotspots', libelle: 'Points chauds de sécurité', unite: '', statut: (v) => (v ? 'orange' : 'vert'), detail: 'À revoir à la main' },
  { cle: 'code_smells', libelle: 'Mauvaises pratiques', unite: '', statut: (v) => (v > 100 ? 'orange' : 'vert'), detail: 'Dette technique' },
  { cle: 'coverage', libelle: 'Couverture de tests', unite: '%', statut: (v) => (v < 40 ? 'rouge' : v < 60 ? 'orange' : 'vert'), detail: 'Lignes exécutées par les tests' },
  { cle: 'duplicated_lines_density', libelle: 'Lignes dupliquées', unite: '%', statut: (v) => (v > 10 ? 'rouge' : v > 5 ? 'orange' : 'vert'), detail: 'Code copié-collé' },
  { cle: 'ncloc', libelle: 'Lignes de code', unite: '', statut: () => 'vert', detail: 'Hors commentaires et lignes vides' },
];
const LIBELLES: Record<string, string> = {
  new_reliability_rating: 'Fiabilité du nouveau code',
  new_security_rating: 'Sécurité du nouveau code',
  new_maintainability_rating: 'Maintenabilité du nouveau code',
  new_coverage: 'Couverture du nouveau code',
  new_duplicated_lines_density: 'Duplication dans le nouveau code',
  new_security_hotspots_reviewed: 'Points chauds revus (nouveau code)',
  ...Object.fromEntries(METRIQUES.map((m) => [m.cle, m.libelle])),
};

type Lecture = Pick<QualiteCode, 'porte' | 'conditions' | 'mesures' | 'lien'>;

export function mesuresSonar(valeurs: Record<string, string | undefined>): Mesure[] {
  return METRIQUES.map((m) => {
    const v = valeurs[m.cle] === undefined ? null : Number(valeurs[m.cle]);
    const valeur = v !== null && Number.isFinite(v) ? v : null;
    return { cle: m.cle, libelle: m.libelle, valeur, unite: m.unite, statut: valeur === null ? 'inconnu' : m.statut(valeur), detail: m.detail };
  });
}

export const configureSonar = () => !!(config.sonarUrl && config.sonarJeton && config.sonarProjet);

export class Sonar {
  get url() {
    return config.sonarUrl;
  }
  readonly projet = () => config.sonarProjet;

  private appel<T>(chemin: string): Promise<T> {
    // Jeton en identifiant « Basic » : accepté par toutes les versions (et SonarCloud).
    return lireJson<T>(`${config.sonarUrl}/api${chemin}`, { headers: { authorization: `Basic ${Buffer.from(`${config.sonarJeton}:`).toString('base64')}` } });
  }

  async lire(): Promise<Lecture> {
    const projet = encodeURIComponent(config.sonarProjet);
    const [porte, mesures] = await Promise.all([
      this.appel<{ projectStatus: { status: string; conditions?: { status: string; metricKey: string; comparator: string; errorThreshold: string; actualValue?: string }[] } }>(
        `/qualitygates/project_status?projectKey=${projet}`,
      ),
      this.appel<{ component: { measures: { metric: string; value?: string }[] } }>(`/measures/component?component=${projet}&metricKeys=${METRIQUES.map((m) => m.cle).join(',')}`),
    ]);
    const valeurs = Object.fromEntries(mesures.component.measures.map((m) => [m.metric, m.value]));
    return {
      porte: porte.projectStatus.status === 'OK' ? 'OK' : porte.projectStatus.status === 'ERROR' ? 'ERROR' : null,
      conditions: (porte.projectStatus.conditions ?? []).map((c) => ({
        libelle: LIBELLES[c.metricKey] ?? c.metricKey,
        statut: c.status === 'OK' ? 'OK' : 'ERROR',
        valeur: c.actualValue ?? '—',
        seuil: `${c.comparator === 'GT' ? '≤' : '≥'} ${c.errorThreshold}`,
      })),
      mesures: mesuresSonar(valeurs),
      lien: `${config.sonarUrl}/dashboard?id=${projet}`,
    };
  }
}

/** Démonstration : un projet sain, deux points chauds à revoir. */
export function qualiteDemo(): Lecture {
  return {
    porte: 'OK',
    conditions: [
      { libelle: 'Fiabilité du nouveau code', statut: 'OK', valeur: 'A', seuil: '≥ A' },
      { libelle: 'Sécurité du nouveau code', statut: 'OK', valeur: 'A', seuil: '≥ A' },
      { libelle: 'Couverture du nouveau code', statut: 'OK', valeur: '74,2 %', seuil: '≥ 70 %' },
      { libelle: 'Duplication dans le nouveau code', statut: 'OK', valeur: '1,1 %', seuil: '≤ 3 %' },
    ],
    mesures: mesuresSonar({ bugs: '0', vulnerabilities: '0', security_hotspots: '2', code_smells: '37', coverage: '71.4', duplicated_lines_density: '2.1', ncloc: '48210' }),
    lien: null,
  };
}
