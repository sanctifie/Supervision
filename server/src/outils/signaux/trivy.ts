import fs from 'node:fs';
import { config } from '../../config';
import type { LectureSignal } from '../../../../shared/outils';
import type { Statut } from '../../../../shared/types';
import type { SourceSignal } from './signal';

/** Trivy ou Grype : le rapport JSON d'un scan d'image, déposé par le pipeline ou le conteneur trivy (deploy/). */

interface RapportTrivy {
  ArtifactName?: string;
  CreatedAt?: string;
  Results?: {
    Target: string;
    Vulnerabilities?: { VulnerabilityID: string; Severity: string; PkgName: string; InstalledVersion?: string; FixedVersion?: string; Title?: string }[];
  }[];
}
interface RapportGrype {
  descriptor?: { timestamp?: string };
  source?: { target?: { userInput?: string } };
  matches?: { vulnerability: { id: string; severity: string; fix?: { versions?: string[] } }; artifact: { name: string; version?: string } }[];
}

export interface Vulnerabilite {
  id: string;
  severite: 'critique' | 'elevee' | 'moyenne' | 'faible';
  paquet: string;
  version: string;
  corrigee: string;
  titre: string;
}
const ORDRE: Record<Vulnerabilite['severite'], number> = { critique: 0, elevee: 1, moyenne: 2, faible: 3 };

function severite(s: string): Vulnerabilite['severite'] {
  const x = s.toLowerCase();
  return x === 'critical' ? 'critique' : x === 'high' ? 'elevee' : x === 'medium' ? 'moyenne' : 'faible';
}

/** Détecte Trivy (`Results`) ou Grype (`matches`) et normalise. */
export function parserRapport(json: unknown): { cible: string; date: number | null; vulnerabilites: Vulnerabilite[] } {
  const t = json as RapportTrivy & RapportGrype;
  if (Array.isArray(t.matches)) {
    return {
      cible: t.source?.target?.userInput ?? 'image',
      date: t.descriptor?.timestamp ? Date.parse(t.descriptor.timestamp) || null : null,
      vulnerabilites: t.matches.map((m) => ({
        id: m.vulnerability.id,
        severite: severite(m.vulnerability.severity),
        paquet: m.artifact.name,
        version: m.artifact.version ?? '',
        corrigee: m.vulnerability.fix?.versions?.[0] ?? '',
        titre: '',
      })),
    };
  }
  return {
    cible: t.ArtifactName ?? 'image',
    date: t.CreatedAt ? Date.parse(t.CreatedAt) || null : null,
    vulnerabilites: (t.Results ?? []).flatMap((r) =>
      (r.Vulnerabilities ?? []).map((v) => ({
        id: v.VulnerabilityID,
        severite: severite(v.Severity),
        paquet: v.PkgName,
        version: v.InstalledVersion ?? '',
        corrigee: v.FixedVersion ?? '',
        titre: v.Title ?? '',
      })),
    ),
  };
}

export function lectureTrivy(r: ReturnType<typeof parserRapport>, maintenant = Date.now()): LectureSignal {
  const n = (s: Vulnerabilite['severite']) => r.vulnerabilites.filter((v) => v.severite === s).length;
  const [critiques, elevees, moyennes] = [n('critique'), n('elevee'), n('moyenne')];
  const ageH = r.date === null ? null : (maintenant - r.date) / 3_600_000;
  const perime = ageH !== null && ageH > 7 * 24;
  const statut: Statut = critiques ? 'rouge' : elevees || perime ? 'orange' : 'vert';
  return {
    statut,
    resume: `${r.cible} : ${critiques} critique(s), ${elevees} élevée(s)${perime ? ' · rapport de plus de 7 jours' : ''}`,
    mesures: [
      { cle: 'critiques', libelle: 'Critiques', valeur: critiques, unite: '', statut: critiques ? 'rouge' : 'vert', detail: 'À corriger sans attendre' },
      { cle: 'elevees', libelle: 'Élevées', valeur: elevees, unite: '', statut: elevees ? 'orange' : 'vert', detail: 'À planifier' },
      { cle: 'moyennes', libelle: 'Moyennes', valeur: moyennes, unite: '', statut: 'vert', detail: 'À suivre' },
      { cle: 'total', libelle: 'Total', valeur: r.vulnerabilites.length, unite: '', statut: 'vert', detail: 'Toutes sévérités' },
      { cle: 'age', libelle: 'Âge du rapport', valeur: ageH, unite: 'h', statut: perime ? 'orange' : 'vert', detail: 'Orange au-delà de 7 jours' },
    ],
    lignes: [...r.vulnerabilites]
      .sort((a, b) => ORDRE[a.severite] - ORDRE[b.severite])
      .slice(0, 10)
      .map((v) => ({
        libelle: `${v.id} · ${v.paquet} ${v.version}`.trim(),
        detail: `${v.severite}${v.corrigee ? ` · corrigée en ${v.corrigee}` : ' · pas de correctif'}${v.titre ? ` · ${v.titre}` : ''}`,
        statut: v.severite === 'critique' ? 'rouge' : v.severite === 'elevee' ? 'orange' : 'vert',
        lien: /^CVE-/.test(v.id) ? `https://nvd.nist.gov/vuln/detail/${v.id}` : null,
        t: null,
      })),
    lien: null,
    verifie: [{ cle: 'securite:cve', statut, detail: `${r.cible} scanné : ${critiques} critique(s), ${elevees} élevée(s)` }],
  };
}

export const trivy: SourceSignal = {
  cle: 'trivy',
  nom: 'Trivy / Grype',
  categorie: 'vulnerabilites',
  variables: 'TRIVY_RAPPORT',
  url: () => null,
  configure: () => !!config.trivyRapport,
  async lire() {
    if (!fs.existsSync(config.trivyRapport)) throw new Error(`Rapport introuvable (${config.trivyRapport}) : lancer le conteneur trivy (deploy/) ou déposer le rapport`);
    const r = parserRapport(JSON.parse(fs.readFileSync(config.trivyRapport, 'utf8')));
    return lectureTrivy({ ...r, date: r.date ?? fs.statSync(config.trivyRapport).mtimeMs });
  },
  demo: () =>
    lectureTrivy({
      cible: 'officina/gateway:2.4.1',
      date: Date.now() - 9 * 3_600_000,
      vulnerabilites: [
        { id: 'CVE-2025-30204', severite: 'elevee', paquet: 'golang.org/x/crypto', version: '0.31.0', corrigee: '0.35.0', titre: 'ssh: denial of service' },
        { id: 'CVE-2024-45338', severite: 'moyenne', paquet: 'golang.org/x/net', version: '0.33.0', corrigee: '0.34.0', titre: 'html: non-linear parsing' },
        { id: 'CVE-2024-12797', severite: 'faible', paquet: 'libssl3', version: '3.3.2-r1', corrigee: '3.3.3-r0', titre: '' },
      ],
    }),
};
