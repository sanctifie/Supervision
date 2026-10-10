import { useId } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { heure, dateHeure } from '../../../shared/format';
import type { Point } from '../../../shared/types';

/**
 * Courbes : une aire bleue en dégradé (série principale) et, au besoin, une
 * comparaison en pointillés (même heure J-7) et des lignes de seuil.
 */

interface SerieGraphique {
  nom: string;
  points: Point[];
  couleur?: string;
  pointilles?: boolean;
}

function fusionner(series: SerieGraphique[]) {
  const parT = new Map<number, Record<string, number>>();
  series.forEach((s, i) => {
    for (const p of s.points) {
      const ligne = parT.get(p.t) ?? { t: p.t };
      ligne[`s${i}`] = p.v;
      parT.set(p.t, ligne);
    }
  });
  return [...parT.values()].sort((a, b) => a.t - b.t);
}

export function Courbe({
  series,
  hauteur = 260,
  format = (v: number) => String(Math.round(v)),
  seuils = [],
  domaine,
  longue,
}: {
  series: SerieGraphique[];
  hauteur?: number;
  format?: (v: number) => string;
  seuils?: { valeur: number; couleur: string; libelle: string }[];
  domaine?: [number | 'auto', number | 'auto'];
  longue?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const donnees = fusionner(series);
  if (!donnees.length) return <div className="vide" style={{ height: hauteur, display: 'grid', placeItems: 'center' }}>Pas encore de mesures sur cette période</div>;
  return (
    <div style={{ width: '100%', height: hauteur }}>
      <ResponsiveContainer>
        <AreaChart data={donnees} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.couleur ?? '#2f5bea'} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.couleur ?? '#2f5bea'} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#eef2f9" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={(t) => (longue ? new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) : heure(t))}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis tickFormatter={format} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={58} domain={domaine ?? [0, 'auto']} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="info-bulle">
                  <strong>{dateHeure(Number(label))}</strong>
                  {payload.map((p) => {
                    const i = Number(String(p.dataKey).slice(1));
                    return (
                      <div key={String(p.dataKey)} style={{ color: series[i]?.couleur ?? '#2f5bea' }}>
                        {series[i]?.nom} : {format(Number(p.value))}
                      </div>
                    );
                  })}
                </div>
              ) : null
            }
          />
          {seuils.map((s) => (
            <ReferenceLine key={s.libelle} y={s.valeur} stroke={s.couleur} strokeDasharray="4 4" label={{ value: s.libelle, position: 'insideTopRight', fontSize: 10, fill: s.couleur }} />
          ))}
          {series.map((s, i) => (
            <Area
              key={i}
              type="monotone"
              dataKey={`s${i}`}
              stroke={s.couleur ?? '#2f5bea'}
              strokeWidth={s.pointilles ? 1.5 : 2.4}
              strokeDasharray={s.pointilles ? '5 5' : undefined}
              fill={s.pointilles ? 'transparent' : `url(#${id}-${i})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Petite courbe sans axes, pour les indicateurs. */
export function Etincelle({ points, couleur = '#2f5bea' }: { points: Point[]; couleur?: string }) {
  const id = useId().replace(/:/g, '');
  if (points.length < 2) return null;
  return (
    <ResponsiveContainer>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={couleur} stopOpacity={0.25} />
            <stop offset="100%" stopColor={couleur} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Area type="monotone" dataKey="v" stroke={couleur} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Barres horizontales (tailles des bases, consommation des conteneurs…). */
export function Barres({ donnees, format, hauteur }: { donnees: { nom: string; valeur: number; couleur?: string }[]; format: (v: number) => string; hauteur?: number }) {
  return (
    <div style={{ width: '100%', height: hauteur ?? Math.max(160, donnees.length * 30) }}>
      <ResponsiveContainer>
        <BarChart data={donnees} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="nom" width={110} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: '#f4f7ff' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="info-bulle">
                  <strong>{String(payload[0].payload.nom)}</strong>
                  {format(Number(payload[0].value))}
                </div>
              ) : null
            }
          />
          <Bar dataKey="valeur" radius={[0, 6, 6, 0]} barSize={14} isAnimationActive={false}>
            {donnees.map((d) => (
              <Cell key={d.nom} fill={d.couleur ?? '#2f5bea'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bande de disponibilité : un carré par heure, vert / orange / rouge. */
export function BandeDisponibilite({ points }: { points: Point[] }) {
  if (!points.length) return null;
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'stretch', height: 34 }}>
      {points.map((p) => (
        <div
          key={p.t}
          title={`${dateHeure(p.t)} — ${(p.v * 100).toFixed(2)} %`}
          style={{ flex: 1, borderRadius: 3, background: p.v >= 0.999 ? '#22c55e' : p.v >= 0.98 ? '#f6a623' : '#ef4444', opacity: p.v >= 0.999 ? 0.75 : 1 }}
        />
      ))}
    </div>
  );
}
