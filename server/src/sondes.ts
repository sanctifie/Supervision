import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { config } from './config';
import { ErreurMetier } from './erreurs';
import type { Stockage } from './stockage';
import { ECHECS_AVANT_PANNE, INTERVALLES_MIN, type Controle, type Sonde } from '../../shared/sondes';

/**
 * Sondes HTTP et TCP lancées par la supervision elle-même. Seul un
 * administrateur choisit les cibles : le serveur s'y connecte depuis son réseau.
 * Seuls le code de réponse et la durée sont gardés, jamais le contenu.
 */

type Resultat = Omit<Controle, 't'>;
export type Verifier = (s: Pick<Sonde, 'type' | 'cible' | 'codeAttendu'>) => Promise<Resultat>;

export interface EffetsSondes {
  /** Ouvre un incident, rend son numéro. */
  panne(s: Sonde, detail: string): string;
  retablie(numero: string, texte: string): void;
}

const HISTORIQUE = 100;

export const verifierReel: Verifier = async (s) => {
  const debut = Date.now();
  const fini = (ok: boolean, detail: string): Resultat => ({ ok, dureeMs: Date.now() - debut, detail });
  if (s.type === 'http') {
    try {
      // Pas de suivi de redirection : on juge la réponse de l'adresse demandée.
      const r = await fetch(s.cible, { redirect: 'manual', signal: AbortSignal.timeout(config.delaiRequeteMs) });
      await r.body?.cancel();
      return fini(s.codeAttendu ? r.status === s.codeAttendu : r.status < 400, `HTTP ${r.status}`);
    } catch (e) {
      return fini(false, (e as Error).name === 'TimeoutError' ? 'Pas de réponse dans le délai' : 'Connexion impossible');
    }
  }
  const [hote, port] = s.cible.split(':');
  return new Promise((resoudre) => {
    const prise = net.connect({ host: hote, port: Number(port), timeout: config.delaiRequeteMs });
    const clore = (ok: boolean, detail: string) => {
      prise.destroy();
      resoudre(fini(ok, detail));
    };
    prise.once('connect', () => clore(true, 'Port ouvert'));
    prise.once('timeout', () => clore(false, 'Pas de réponse dans le délai'));
    prise.once('error', () => clore(false, 'Connexion refusée ou hôte injoignable'));
  });
};

export class Sondes {
  private enCours = new Set<string>();

  constructor(
    private readonly stockage: Stockage,
    private readonly effets: EffetsSondes,
    private readonly verifier: Verifier = verifierReel,
  ) {}

  lister(): Sonde[] {
    return this.stockage.donnees.sondes ?? [];
  }
  private sonde(id: string): Sonde {
    const s = this.lister().find((x) => x.id === id);
    if (!s) throw new ErreurMetier('Sonde introuvable');
    return s;
  }

  private propre(corps: Record<string, unknown>): Pick<Sonde, 'nom' | 'type' | 'cible' | 'codeAttendu' | 'intervalleMin' | 'actif' | 'incident'> {
    const nom = String(corps.nom ?? '')
      .trim()
      .slice(0, 80);
    if (!nom) throw new ErreurMetier('Nom de la sonde obligatoire');
    const type = corps.type === 'tcp' ? 'tcp' : 'http';
    let cible = String(corps.cible ?? '').trim();
    if (type === 'http') {
      let u: URL;
      try {
        u = new URL(cible);
      } catch {
        throw new ErreurMetier('Adresse invalide (exemple : https://officina.exemple.fr/health)');
      }
      if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) throw new ErreurMetier('L’adresse doit être en http(s), sans identifiants');
      cible = u.href;
    } else {
      const m = /^([a-zA-Z0-9.-]{1,253}):(\d{1,5})$/.exec(cible);
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 65535) throw new ErreurMetier('Cible invalide : « hôte:port », par exemple postgres:5432');
    }
    const code = Math.round(Number(corps.codeAttendu) || 0);
    if (code !== 0 && (code < 100 || code > 599)) throw new ErreurMetier('Code attendu : entre 100 et 599, ou vide');
    const intervalleMin = INTERVALLES_MIN.includes(Number(corps.intervalleMin)) ? Number(corps.intervalleMin) : 5;
    return { nom, type, cible, codeAttendu: type === 'http' ? code : 0, intervalleMin, actif: corps.actif !== false, incident: corps.incident === true };
  }

  creer(corps: Record<string, unknown>, par: string): Sonde {
    if (this.lister().length >= 200) throw new ErreurMetier('200 sondes au plus');
    const s: Sonde = { id: randomUUID(), ...this.propre(corps), statut: 'inconnu', echecs: 0, historique: [], ticket: null };
    this.stockage.modifier((e) => {
      e.sondes = [...(e.sondes ?? []), s];
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Sonde « ${s.nom} » créée`, detail: `${s.cible} · par ${par}`, statut: 'vert' });
    return s;
  }

  /** Changer la cible remet l'état à zéro : l'historique parlait d'une autre adresse. */
  modifier(id: string, corps: Record<string, unknown>, par: string): Sonde {
    const s = this.sonde(id);
    const nouveau = this.propre({ ...s, ...corps });
    const autreCible = nouveau.cible !== s.cible || nouveau.type !== s.type;
    this.stockage.modifier(() => Object.assign(s, nouveau, autreCible ? { statut: 'inconnu', echecs: 0, historique: [], ticket: null } : {}));
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Sonde « ${s.nom} » modifiée`, detail: `${s.cible} · par ${par}`, statut: 'vert' });
    return s;
  }

  supprimer(id: string, par: string): void {
    const s = this.sonde(id);
    this.stockage.modifier((e) => {
      e.sondes = this.lister().filter((x) => x.id !== id);
    });
    this.stockage.ajouterEvenement({ t: Date.now(), type: 'info', titre: `Sonde « ${s.nom} » supprimée`, detail: `Par ${par}`, statut: 'orange' });
  }

  /** Un contrôle, maintenant. Rouge après plusieurs échecs de suite ; vert au premier succès. */
  async controler(id: string, maintenant = Date.now()): Promise<Sonde> {
    const s = this.sonde(id);
    if (this.enCours.has(id)) return s;
    this.enCours.add(id);
    let r: Resultat;
    try {
      r = await this.verifier(s);
    } finally {
      this.enCours.delete(id);
    }
    // Supprimée pendant le contrôle : rien à noter.
    if (!this.lister().includes(s)) return s;
    const avant = s.statut;
    this.stockage.modifier(() => {
      s.historique = [...s.historique, { t: maintenant, ...r }].slice(-HISTORIQUE);
      s.echecs = r.ok ? 0 : s.echecs + 1;
      s.statut = r.ok ? 'vert' : s.echecs >= ECHECS_AVANT_PANNE ? 'rouge' : s.statut === 'rouge' ? 'rouge' : 'orange';
    });
    if (s.statut === 'rouge' && avant !== 'rouge') {
      this.stockage.ajouterEvenement({ t: maintenant, type: 'alerte', titre: `Sonde « ${s.nom} » en panne`, detail: `${s.cible} · ${r.detail}`, statut: 'rouge' });
      if (s.incident) {
        const numero = this.effets.panne(s, r.detail);
        this.stockage.modifier(() => {
          s.ticket = numero;
        });
      }
    }
    if (s.statut === 'vert' && avant === 'rouge') {
      this.stockage.ajouterEvenement({ t: maintenant, type: 'resolution', titre: `Sonde « ${s.nom} » rétablie`, detail: `${s.cible} · ${r.detail}`, statut: 'vert' });
      if (s.ticket) this.effets.retablie(s.ticket, `La sonde « ${s.nom} » répond de nouveau (${r.detail}).`);
      this.stockage.modifier(() => {
        s.ticket = null;
      });
    }
    return s;
  }

  /** Lance les contrôles dont l'intervalle est écoulé. */
  async tic(maintenant = Date.now()): Promise<void> {
    const dues = this.lister().filter((s) => s.actif && maintenant - (s.historique.at(-1)?.t ?? 0) >= s.intervalleMin * 60_000);
    await Promise.all(dues.map((s) => this.controler(s.id, maintenant).catch((e) => console.error('[sondes]', (e as Error).message))));
  }
}
