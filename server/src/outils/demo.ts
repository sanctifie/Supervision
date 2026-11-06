import type { CleOutil, DemandeFusion, Execution, Lancable } from '../../../shared/outils';
import type { Outil } from './outil';

/**
 * Démonstration : des pipelines, jobs AWX et jobs Control-M plausibles pour
 * la même officine fictive, déterministes (fonction de l'heure). Un échec
 * récent sur l'export comptable montre le voyant orange ; le relancer le
 * fait repasser au vert.
 */
const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Dernière occurrence ≤ maintenant d'un rendez-vous quotidien à `heure` (UTC+1). */
function derniere(maintenant: number, heure: number, periode = JOUR): number {
  const decalage = HEURE; // Libreville
  const depuisMinuit = (((maintenant + decalage) % periode) + periode) % periode;
  const cible = heure * HEURE;
  return maintenant - depuisMinuit + (depuisMinuit >= cible ? cible : cible - periode);
}

export class OutilDemo implements Outil {
  readonly url = null;
  private lances: Execution[] = [];

  constructor(readonly cle: CleOutil) {}

  private fixes(): Execution[] {
    const t = Date.now();
    const liste: Execution[] = [];
    const ajouter = (nom: string, contexte: string, debut: number, dureeMin: number, echec = false, par = 'planificateur', id?: string) => {
      const fin = debut + dureeMin * MINUTE;
      const enCours = fin > t;
      liste.push({
        outil: this.cle,
        id: id ?? `${nom}-${debut}`,
        nom,
        contexte,
        etat: enCours ? 'en-cours' : echec ? 'echec' : 'succes',
        statutBrut:
          this.cle === 'gitlab'
            ? enCours
              ? 'running'
              : echec
                ? 'failed'
                : 'success'
            : this.cle === 'awx'
              ? enCours
                ? 'running'
                : echec
                  ? 'failed'
                  : 'successful'
              : enCours
                ? 'Executing'
                : echec
                  ? 'Ended Not OK'
                  : 'Ended OK',
        debut,
        fin: enCours ? null : fin,
        par,
        lien: null,
      });
    };
    if (this.cle === 'gitlab') {
      // Un pipeline toutes les 4 h sur main ; celui d'il y a ~8 h a échoué puis a été relancé.
      for (let k = 0; k < 6; k++) {
        const debut = derniere(t, 0.17, 4 * HEURE) - k * 4 * HEURE;
        const iid = 1842 - k;
        if (k === 2) ajouter(`Pipeline #${iid + 100}`, 'main', debut + 9 * MINUTE, 7, false, 'Awa Ndong', String(iid + 100));
        ajouter(`Pipeline #${iid}`, 'main', debut, 7, k === 2, k === 0 ? 'Awa Ndong' : 'planificateur', String(iid));
      }
      ajouter('Pipeline #1830', 'feature/prix-cnamgs', t - 3 * HEURE - 20 * MINUTE, 6, false, 'Jean Mba', '1830');
    } else if (this.cle === 'awx') {
      for (let k = 0; k < 6; k++)
        ajouter('Déployer Officina', 'Déploiement Officina (production)', derniere(t, 0.17, 4 * HEURE) - k * 4 * HEURE + 8 * MINUTE, 4, false, 'gitlab-ci');
      for (let k = 0; k < 3; k++) ajouter('Sauvegarde hors site', 'Sauvegarde (restic)', derniere(t, 2.5) - k * JOUR, 11);
      ajouter('Durcissement serveur', 'Durcissement (CIS)', derniere(t, 5) - 2 * JOUR, 3, false, 'Awa Ndong');
    } else {
      for (let k = 0; k < 3; k++) {
        ajouter('SAUVEGARDE-PG', 'OFFICINA-NUIT', derniere(t, 2.5) - k * JOUR, 9);
        ajouter('EXPORT-COMPTA', 'OFFICINA-NUIT', derniere(t, 3) - k * JOUR, 4, k === 0);
        ajouter('PURGE-LOGS', 'OFFICINA-NUIT', derniere(t, 4) - k * JOUR, 2);
        ajouter('RAPPORT-VENTES', 'OFFICINA-MATIN', derniere(t, 6) - k * JOUR, 3);
      }
    }
    return liste;
  }

  async executions(): Promise<Execution[]> {
    const t = Date.now();
    // Ce qu'on a lancé réussit après 90 s.
    this.lances = this.lances.map((e) =>
      e.etat === 'en-cours' && t - (e.debut ?? t) > 90_000 ? { ...e, etat: 'succes', statutBrut: 'success', fin: (e.debut ?? t) + 90_000 } : e,
    );
    return [...this.lances, ...this.fixes()].sort((a, b) => (b.debut ?? 0) - (a.debut ?? 0)).slice(0, 30);
  }

  async lancables(): Promise<Lancable[]> {
    if (this.cle === 'gitlab')
      return ['main', 'develop'].map((b) => ({ outil: 'gitlab', id: b, nom: `Pipeline sur ${b}`, description: 'Qualité, tests, image Docker, déploiement' }));
    if (this.cle === 'awx')
      return [
        { outil: 'awx', id: 'deploiement', nom: 'Déploiement Officina (production)', description: 'deploy.yml — met à jour les conteneurs sans coupure' },
        { outil: 'awx', id: 'sauvegarde', nom: 'Sauvegarde (restic)', description: 'backup.yml — dumps PostgreSQL et volumes, hors site' },
        { outil: 'awx', id: 'durcissement', nom: 'Durcissement (CIS)', description: 'hardening.yml — SSH, pare-feu, mises à jour' },
      ];
    return [];
  }

  private pousser(e: Execution): Execution {
    this.lances.unshift(e);
    return e;
  }

  async lancer(id: string): Promise<Execution> {
    const modele = (await this.lancables()).find((l) => l.id === id);
    if (!modele) throw new Error(`Rien à lancer sous « ${id} »`);
    const t = Date.now();
    return this.pousser({
      outil: this.cle,
      id: `demo-${t}`,
      nom: this.cle === 'gitlab' ? `Pipeline #${1843 + this.lances.length}` : modele.nom,
      contexte: this.cle === 'gitlab' ? id : modele.nom,
      etat: 'en-cours',
      statutBrut: 'running',
      debut: t,
      fin: null,
      par: 'vous',
      lien: null,
    });
  }

  async relancer(id: string): Promise<Execution> {
    const avant = (await this.executions()).find((e) => e.id === id);
    if (!avant) throw new Error(`Exécution ${id} introuvable`);
    return this.pousser({ ...avant, id: `demo-${Date.now()}`, etat: 'en-cours', statutBrut: 'running', debut: Date.now(), fin: null, par: 'vous' });
  }

  async demandesFusion(): Promise<DemandeFusion[]> {
    if (this.cle !== 'gitlab') return [];
    const t = Date.now();
    return [
      {
        iid: 412,
        titre: 'Prise en charge CNAMGS : nouveaux taux 2026',
        auteur: 'Jean Mba',
        source: 'feature/prix-cnamgs',
        cible: 'main',
        majLe: t - 3 * HEURE,
        lien: '#',
        pipeline: 'succes',
      },
      {
        iid: 409,
        titre: 'Export comptable : colonne TVA manquante',
        auteur: 'Awa Ndong',
        source: 'fix/export-tva',
        cible: 'main',
        majLe: t - 26 * HEURE,
        lien: '#',
        pipeline: 'echec',
      },
    ];
  }
}
