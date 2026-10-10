import path from 'node:path';

/**
 * Toute la configuration vient de l'environnement (fichier .env ou
 * docker-compose). Les valeurs par défaut sont celles de la supervision
 * d'Officina (dossier `supervision/` du dépôt Pharmatech) : mêmes noms de
 * conteneurs, mêmes ports.
 */
function texte(nom: string, defaut = ''): string {
  return (process.env[nom] ?? defaut).trim();
}

export type ModeConfig = 'auto' | 'reel' | 'demo';

const mode = texte('SUPERVISION_MODE', 'auto') as ModeConfig;

export const config = {
  port: Number(texte('PORT', '8080')),
  hote: texte('HOTE', '0.0.0.0'),
  /** auto : Prometheus s'il répond, sinon démonstration. */
  mode: (['auto', 'reel', 'demo'].includes(mode) ? mode : 'auto') as ModeConfig,
  prometheusUrl: texte('PROMETHEUS_URL', 'http://prometheus:9090').replace(/\/$/, ''),
  alertmanagerUrl: texte('ALERTMANAGER_URL', 'http://alertmanager:9093').replace(/\/$/, ''),
  lokiUrl: texte('LOKI_URL', 'http://loki:3100').replace(/\/$/, ''),
  /** Lien vers Grafana pour « voir plus » (facultatif). */
  grafanaUrl: texte('GRAFANA_URL') || null,
  /**
   * Code d'installation : crée le premier administrateur depuis un autre poste,
   * et sert de secours si un administrateur perd son mot de passe.
   * (SUPERVISION_MOT_DE_PASSE, l'ancien nom, est encore lu.)
   */
  codeInstallation: texte('SUPERVISION_CODE_INSTALLATION') || texte('SUPERVISION_MOT_DE_PASSE'),
  /** Durée de la session, en heures. */
  dureeSessionHeures: Number(texte('SUPERVISION_SESSION_HEURES', '12')),
  /** Cookies « Secure » : à laisser à true derrière HTTPS. */
  cookieSecurise: texte('COOKIE_SECURISE', 'false') === 'true',
  dossierDonnees: path.resolve(texte('DOSSIER_DONNEES', './donnees')),
  /** Nom affiché de l'officine / du produit supervisé. */
  nomProduit: texte('NOM_PRODUIT', 'Officina'),
  delaiRequeteMs: Number(texte('DELAI_REQUETE_MS', '4000')),
  /** Fuseau et heures d'ouverture de l'officine (alerte « zéro vente »). */
  fuseau: texte('FUSEAU', 'Africa/Libreville'),
  ouverture: Number(texte('HEURE_OUVERTURE', '8')),
  fermeture: Number(texte('HEURE_FERMETURE', '20')),
};
