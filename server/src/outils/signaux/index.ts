import type { SourceSignal } from './signal';
import { sentry } from './sentry';
import { uptimerobot } from './uptimerobot';
import { uptimekuma } from './uptimekuma';
import { trivy } from './trivy';
import { crowdsec } from './crowdsec';
import { wazuh } from './wazuh';
import { falco } from './falco';
import { lynis } from './lynis';
import { aide } from './aide';
import { argocd } from './argocd';
import { hetzner } from './hetzner';
import { jaeger } from './jaeger';

/** Toutes les sources, dans l'ordre d'affichage. Ajouter un outil = un fichier ici. */
export const SOURCES: SourceSignal[] = [sentry, uptimerobot, uptimekuma, trivy, crowdsec, wazuh, falco, lynis, aide, argocd, hetzner, jaeger];
