import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BellRing, Download, Pause, Play, Save, ScrollText, Trash2, X } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Erreur, Modale, Squelette, Vide } from '../components/ui';
import { useSupervision } from '../components/Coquille';
import { dateHeure, heure } from '../../../shared/format';
import type { LigneJournal, VolumeJournaux } from '../../../shared/types';

const SERVICES = [
  'gateway',
  'identity',
  'catalog',
  'inventory',
  'syncd',
  'sales',
  'regulatory',
  'purchasing',
  'insurance',
  'billing',
  'ledger',
  'payments',
  'notify',
  'hr',
  'documents',
  'postgres',
  'caddy',
  'redis',
  'nats',
];

interface Filtre {
  service?: string;
  niveau?: string;
  texte?: string;
  sauf?: string;
  minutes: number;
}

interface Recherche {
  id: string;
  nom: string;
  filtre: Filtre;
  par: string;
  alerte: { seuil: number; minutes: number; actif: boolean; derniere: number | null } | null;
}

const LIBELLE_NIVEAU: Record<string, string> = { warn: 'Avertissements et erreurs', error: 'Erreurs' };

/** Les champs d'une ligne JSON (pino…), pour le détail. */
function champsJson(message: string): [string, string][] | null {
  const debut = message.indexOf('{');
  if (debut < 0) return null;
  try {
    const o = JSON.parse(message.slice(debut)) as Record<string, unknown>;
    return Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]);
  } catch {
    return null;
  }
}

function exporterCsv(lignes: LigneJournal[]) {
  const echapper = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = ['horodatage;service;niveau;message', ...lignes.map((l) => [new Date(l.t).toISOString(), l.service, l.niveau, echapper(l.message)].join(';'))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  a.download = `journaux-${new Date().toISOString().slice(0, 16).replace(':', 'h')}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Journaux() {
  const [params, setParams] = useSearchParams();
  const [filtre, setFiltre] = useState<Filtre>({ minutes: 60 });
  const [saisie, setSaisie] = useState({ texte: '', sauf: '' });
  const [direct, setDirect] = useState(true);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [enregistrer, setEnregistrer] = useState(false);
  const recherches = useDonnees<Recherche[]>('/recherches', 60_000);
  const { peut } = useSupervision();

  // Lien direct vers une recherche enregistrée (notification d'alerte).
  const idRecherche = params.get('recherche');
  useEffect(() => {
    const r = recherches.donnees?.find((x) => x.id === idRecherche);
    if (r) {
      setFiltre(r.filtre);
      setSaisie({ texte: r.filtre.texte ?? '', sauf: r.filtre.sauf ?? '' });
    }
  }, [idRecherche, recherches.donnees]);

  const q = new URLSearchParams({ minutes: String(filtre.minutes), limite: '500' });
  for (const k of ['service', 'niveau', 'texte', 'sauf'] as const) if (filtre[k]) q.set(k, filtre[k] as string);
  const etat = useDonnees<LigneJournal[]>(`/journaux?${q}`, direct ? 10_000 : 0);
  const volume = useDonnees<VolumeJournaux[]>(`/journaux/volume?${q}`, direct ? 30_000 : 0);

  const champs = useMemo(() => {
    const compter = (cle: 'service' | 'niveau') => {
      const n = new Map<string, number>();
      for (const l of etat.donnees ?? []) n.set(l[cle], (n.get(l[cle]) ?? 0) + 1);
      return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    };
    return { service: compter('service'), niveau: compter('niveau') };
  }, [etat.donnees]);
  const total = etat.donnees?.length ?? 0;

  const poser = (f: Partial<Filtre>) => {
    setFiltre({ ...filtre, ...f });
    if (idRecherche) setParams({});
  };
  const retirer = (k: keyof Filtre) => {
    const f = { ...filtre };
    delete f[k];
    setFiltre(f);
    if (k === 'texte' || k === 'sauf') setSaisie({ ...saisie, [k]: '' });
  };

  return (
    <div className="empile">
      <div className="encadre">
        <strong>Comment ça marche :</strong> les journaux de tous les conteneurs (Loki). Cherchez un texte, <strong>excluez</strong> le bruit, cliquez sur un service ou un niveau à
        gauche pour filtrer. L’<strong>histogramme</strong> montre quand ça s’est produit. Cliquez sur une ligne pour son détail. <strong>Enregistrez</strong> une recherche pour
        l’équipe, avec en option une <strong>alerte</strong> : « au moins N lignes en M minutes → prévenir les agents ».
      </div>

      <Carte>
        <form
          className="filtres"
          onSubmit={(e) => {
            e.preventDefault();
            poser({ texte: saisie.texte || undefined, sauf: saisie.sauf || undefined });
          }}
        >
          <input
            className="champ"
            style={{ flex: 2, minWidth: 180 }}
            placeholder="Contient : ECONNREFUSED, timeout, 502…"
            value={saisie.texte}
            onChange={(e) => setSaisie({ ...saisie, texte: e.target.value })}
            aria-label="Texte cherché"
          />
          <input
            className="champ"
            style={{ flex: 1, minWidth: 140 }}
            placeholder="Sauf : healthcheck…"
            value={saisie.sauf}
            onChange={(e) => setSaisie({ ...saisie, sauf: e.target.value })}
            aria-label="Texte exclu"
          />
          <select className="champ" value={filtre.service ?? ''} onChange={(e) => poser({ service: e.target.value || undefined })} aria-label="Service">
            <option value="">Tous les services</option>
            {SERVICES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select className="champ" value={filtre.minutes} onChange={(e) => poser({ minutes: Number(e.target.value) })} aria-label="Période">
            <option value={15}>15 dernières minutes</option>
            <option value={60}>Dernière heure</option>
            <option value={360}>6 dernières heures</option>
            <option value={1440}>24 dernières heures</option>
          </select>
          <button className="bouton primaire" type="submit">
            Chercher
          </button>
          <button type="button" className="bouton" onClick={() => setDirect(!direct)} title={direct ? 'Mettre en pause' : 'Reprendre le direct'}>
            {direct ? <Pause size={14} /> : <Play size={14} />} {direct ? 'En direct' : 'En pause'}
          </button>
        </form>
        <div className="ligne-flex" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          {filtre.service && <Puce texte={`service : ${filtre.service}`} retirer={() => retirer('service')} />}
          {filtre.niveau && <Puce texte={LIBELLE_NIVEAU[filtre.niveau] ?? filtre.niveau} retirer={() => retirer('niveau')} />}
          {filtre.texte && <Puce texte={`contient « ${filtre.texte} »`} retirer={() => retirer('texte')} />}
          {filtre.sauf && <Puce texte={`sauf « ${filtre.sauf} »`} retirer={() => retirer('sauf')} exclusion />}
          <span className="espace" />
          {!!recherches.donnees?.length && (
            <select
              className="champ"
              value={idRecherche ?? ''}
              onChange={(e) => setParams(e.target.value ? { recherche: e.target.value } : {})}
              aria-label="Recherches enregistrées"
            >
              <option value="">Recherches enregistrées…</option>
              {recherches.donnees.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nom}
                  {r.alerte?.actif ? ' 🔔' : ''}
                </option>
              ))}
            </select>
          )}
          {peut('agir') && (
            <button className="bouton petit" onClick={() => setEnregistrer(true)}>
              <Save size={13} /> Enregistrer
            </button>
          )}
          <button className="bouton petit" disabled={!total} onClick={() => etat.donnees && exporterCsv(etat.donnees)}>
            <Download size={13} /> CSV
          </button>
        </div>
      </Carte>

      <Carte titre="Volume" sousTitre="Nombre de lignes par intervalle (tous niveaux, pour ce filtre)">
        {volume.erreur ? (
          <Erreur message={volume.erreur} />
        ) : !volume.donnees ? (
          <Squelette hauteur={140} />
        ) : (
          <div style={{ width: '100%', height: 150 }}>
            <ResponsiveContainer>
              <BarChart
                data={volume.donnees.map((v) => ({ t: v.t, erreurs: v.erreurs, avertissements: v.avertissements, autres: Math.max(0, v.total - v.erreurs - v.avertissements) }))}
              >
                <CartesianGrid stroke="#eef2f9" vertical={false} />
                <XAxis dataKey="t" tickFormatter={heure} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                <Tooltip labelFormatter={(t) => dateHeure(Number(t))} />
                <Bar dataKey="autres" name="Info" stackId="v" fill="#93b4f5" isAnimationActive={false} />
                <Bar dataKey="avertissements" name="Avertissements" stackId="v" fill="#e5860a" isAnimationActive={false} />
                <Bar dataKey="erreurs" name="Erreurs" stackId="v" fill="#dc2626" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Carte>

      <div className="explorateur">
        <Carte titre="Champs" sousTitre={`Sur les ${total} lignes affichées`}>
          <div className="etiquette">service</div>
          {champs.service.map(([v, n]) => (
            <button key={v} className="champ-valeur" onClick={() => poser({ service: v })} title={`Filtrer service = ${v}`}>
              <span>{v}</span>
              <span className="barre-progres" style={{ flex: 1 }}>
                <div style={{ width: `${(100 * n) / total}%` }} />
              </span>
              <strong>{n}</strong>
            </button>
          ))}
          <div className="etiquette" style={{ marginTop: 12 }}>
            niveau
          </div>
          {champs.niveau.map(([v, n]) => (
            <button
              key={v}
              className="champ-valeur"
              onClick={() => (v === 'error' || v === 'warn') && poser({ niveau: v })}
              title={v === 'error' || v === 'warn' ? `Filtrer ${LIBELLE_NIVEAU[v]}` : undefined}
            >
              <span className={`niv niv-${v}`}>{v.toUpperCase()}</span>
              <span className="barre-progres" style={{ flex: 1 }}>
                <div style={{ width: `${(100 * n) / total}%` }} />
              </span>
              <strong>{n}</strong>
            </button>
          ))}
          {!filtre.niveau && (
            <div className="discret" style={{ fontSize: '0.74rem', marginTop: 8 }}>
              Cliquez sur ERROR ou WARN pour ne garder que ce niveau et au-dessus.
            </div>
          )}
        </Carte>

        <Carte titre="Lignes" sousTitre={etat.donnees ? `${total} lignes (500 au plus) · les plus récentes d’abord` : 'Lecture…'}>
          {etat.erreur ? (
            <Erreur message={etat.erreur} />
          ) : !etat.donnees ? (
            <Squelette hauteur={400} />
          ) : etat.donnees.length ? (
            <div className="journal">
              {etat.donnees.map((l, i) => (
                <div key={`${l.t}-${i}`}>
                  <div className="journal-ligne" style={{ cursor: 'pointer' }} onClick={() => setOuverte(ouverte === i ? null : i)}>
                    <time>{new Date(l.t).toLocaleTimeString('fr-FR')}</time>
                    <span className="svc">{l.service}</span>
                    <span className={`niv niv-${l.niveau}`}>{l.niveau.toUpperCase()}</span>
                    <span className="msg">{l.message}</span>
                  </div>
                  {ouverte === i && (
                    <div className="journal-detail">
                      <table>
                        <tbody>
                          {(
                            [
                              ['@horodatage', new Date(l.t).toISOString()],
                              ['service', l.service],
                              ['niveau', l.niveau],
                              ...(champsJson(l.message) ?? [['message', l.message]]),
                            ] as [string, string][]
                          ).map(([k, v]) => (
                            <tr key={k}>
                              <th>{k}</th>
                              <td>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="ligne-flex" style={{ gap: 6, marginTop: 6 }}>
                        <button className="bouton petit" onClick={() => poser({ service: l.service })}>
                          Ce service seulement
                        </button>
                        <button className="bouton petit" onClick={() => navigator.clipboard?.writeText(`${new Date(l.t).toISOString()} ${l.service} ${l.niveau} ${l.message}`)}>
                          Copier
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Vide icone={<ScrollText size={28} />}>Aucune ligne ne correspond à ces filtres.</Vide>
          )}
        </Carte>
      </div>

      {enregistrer && (
        <EnregistrerRecherche
          filtre={filtre}
          existante={recherches.donnees?.find((r) => r.id === idRecherche) ?? null}
          fermer={() => setEnregistrer(false)}
          fait={(id) => {
            setEnregistrer(false);
            void recherches.recharger();
            setParams(id ? { recherche: id } : {});
          }}
        />
      )}
    </div>
  );
}

function Puce({ texte, retirer, exclusion }: { texte: string; retirer: () => void; exclusion?: boolean }) {
  return (
    <span className={`pastille ${exclusion ? 'rouge' : 'bleu'}`}>
      {texte}
      <button className="puce-retirer" onClick={retirer} aria-label={`Retirer ${texte}`}>
        <X size={12} />
      </button>
    </span>
  );
}

function EnregistrerRecherche({ filtre, existante, fermer, fait }: { filtre: Filtre; existante: Recherche | null; fermer: () => void; fait: (id: string | null) => void }) {
  const [nom, setNom] = useState(existante?.nom ?? '');
  const [alerte, setAlerte] = useState(!!existante?.alerte);
  const [seuil, setSeuil] = useState(existante?.alerte?.seuil ?? 10);
  const [minutes, setMinutes] = useState(existante?.alerte?.minutes ?? 15);
  const [erreur, setErreur] = useState<string | null>(null);
  const corps = { nom, filtre, alerte: alerte ? { seuil, minutes, actif: true } : null };
  return (
    <Modale titre={existante ? `Recherche « ${existante.nom} »` : 'Enregistrer la recherche'} fermer={fermer}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await appeler<Recherche>(existante ? `/recherches/${existante.id}` : '/recherches', { methode: existante ? 'PATCH' : 'POST', corps });
            fait(r.id);
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="champ-groupe">
          <label className="etiquette">Nom</label>
          <input className="champ" value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus placeholder="Notify ne publie plus sur NATS" />
        </div>
        <p className="discret" style={{ fontSize: '0.8rem' }}>
          Filtre enregistré :{' '}
          {[
            filtre.service && `service ${filtre.service}`,
            filtre.niveau && LIBELLE_NIVEAU[filtre.niveau],
            filtre.texte && `contient « ${filtre.texte} »`,
            filtre.sauf && `sauf « ${filtre.sauf} »`,
          ]
            .filter(Boolean)
            .join(' · ') || 'toutes les lignes'}
          {existante && ' (remplace le filtre précédent)'}
        </p>
        <label className="ligne-flex" style={{ marginTop: 12, gap: 8, fontSize: '0.86rem' }}>
          <input type="checkbox" checked={alerte} onChange={(e) => setAlerte(e.target.checked)} />
          <BellRing size={14} /> Prévenir les agents quand ça arrive
        </label>
        {alerte && (
          <div className="grille g2" style={{ gap: 12 }}>
            <div className="champ-groupe">
              <label className="etiquette">Au moins (lignes)</label>
              <input className="champ" type="number" min={1} max={1000} value={seuil} onChange={(e) => setSeuil(Number(e.target.value))} />
            </div>
            <div className="champ-groupe">
              <label className="etiquette">En (minutes)</label>
              <input className="champ" type="number" min={5} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </div>
          </div>
        )}
        {existante?.alerte?.derniere && <p className="discret">Dernière alerte : {dateHeure(existante.alerte.derniere)}</p>}
        {erreur && (
          <div className="erreur" style={{ marginTop: 12 }}>
            {erreur}
          </div>
        )}
        <div className="ligne-flex" style={{ marginTop: 16 }}>
          {existante && (
            <button
              type="button"
              className="bouton danger"
              onClick={async () => {
                await appeler(`/recherches/${existante.id}`, { methode: 'DELETE' });
                fait(null);
              }}
            >
              <Trash2 size={13} /> Supprimer
            </button>
          )}
          <span className="espace" />
          <button type="button" className="bouton" onClick={fermer}>
            Annuler
          </button>
          <button className="bouton primaire" type="submit">
            Enregistrer
          </button>
        </div>
      </form>
    </Modale>
  );
}
