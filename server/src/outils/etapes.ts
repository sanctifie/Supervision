import type { EtapePipeline } from '../../../shared/outils';
import type { Statut } from '../../../shared/types';

/** Les jobs d'un pipeline reconnus par leur nom, pour cocher les 9 étapes du guide (catalogues.ts, PIPELINE). */
const MOTIFS: Record<string, RegExp> = {
  qualite: /lint|qualit|prettier|tsc|typecheck|eslint|format/i,
  tests: /test|e2e|vitest|jest|spec/i,
  sast: /sast|semgrep|gitleaks|secret/i,
  dependances: /audit|depend|renovate|trivy[-_ ]?fs|sbom/i,
  'scan-image': /scan|grype|trivy[-_ ]?image|cosign|sign/i,
  build: /build|docker|image/i,
  staging: /staging|preprod|recette/i,
  production: /prod|release|deploy(?!.*staging)/i,
  'post-deploiement': /smoke|post|verif|rollback|canary/i,
};

export function etatEtapePipeline(cle: string, etapes: EtapePipeline[]): { statut: Statut; detail: string } | undefined {
  const motif = MOTIFS[cle];
  if (!motif) return undefined;
  // Un job « scan d'image » ne compte pas aussi comme build ; un déploiement staging n'est pas la production.
  const exclu = cle === 'build' ? MOTIFS['scan-image'] : cle === 'production' ? MOTIFS.staging : null;
  const jobs = etapes.filter((e) => motif.test(`${e.nom} ${e.etape}`) && !exclu?.test(`${e.nom} ${e.etape}`));
  if (!jobs.length) return undefined;
  const statut: Statut = jobs.every((j) => j.etat === 'succes') ? 'vert' : jobs.some((j) => j.etat === 'echec') ? 'rouge' : 'orange';
  return { statut, detail: `Job(s) : ${jobs.map((j) => j.nom).join(', ')} — ${statut === 'vert' ? 'réussi' : statut === 'rouge' ? 'en échec' : 'en cours ou incomplet'}` };
}
