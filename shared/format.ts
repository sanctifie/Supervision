/** Mise en forme française des valeurs, côté serveur comme côté interface. */

const nf = (max: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max });

export function nombre(v: number | null | undefined, decimales = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf(decimales).format(v);
}

export function pourcent(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${nf(decimales).format(v)} %`;
}

export function octets(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const unites = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let x = v;
  while (Math.abs(x) >= 1024 && i < unites.length - 1) {
    x /= 1024;
    i++;
  }
  return `${nf(x < 10 && i > 0 ? 1 : 0).format(x)} ${unites[i]}`;
}

export function debitOctets(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${octets(v)}/s`;
}

export function millisecondes(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v >= 1000) return `${nf(2).format(v / 1000)} s`;
  return `${nf(v < 10 ? 1 : 0).format(v)} ms`;
}

/** Durée lisible : « 3 j 4 h », « 12 min », « 40 s ». */
export function duree(secondes: number | null | undefined): string {
  if (secondes === null || secondes === undefined || !Number.isFinite(secondes)) return '—';
  const s = Math.max(0, Math.round(secondes));
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (j > 0) return h ? `${j} j ${h} h` : `${j} j`;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

/** « il y a 5 min » */
export function depuis(t: number | null | undefined, maintenant = Date.now()): string {
  if (!t) return '—';
  const s = (maintenant - t) / 1000;
  if (s < 45) return "à l'instant";
  return `il y a ${duree(s)}`;
}

export function heure(t: number): string {
  return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function dateHeure(t: number | null | undefined): string {
  if (!t) return '—';
  return new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
