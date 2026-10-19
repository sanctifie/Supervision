import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bookmark, Download, Link2, Pause, Play, ScrollText, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { useSupervision } from '../components/Coquille';
import { Carte, Erreur, Pastille, Squelette, Vide } from '../components/ui';
import { versCsv, type AnalyseJournaux, type CategorieJournal, type RechercheJournaux } from '../../../shared/journaux';
import { dateHeure } from '../../../shared/format';
import type { LigneJournal } from '../../../shared/types';

const PERIODES = [15, 60, 360, 1440];
const COULEUR_NIVEAU = { error: 'rouge', warn: 'orange', info: 'vert', debug: 'inconnu' } as const;

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

export default function Journaux() {
  // Les filtres vivent dans l'adresse : une recherche se partage en copiant le lien.
  const [params, setParams] = useSearchParams();
  const minutesUrl = Number(params.get('minutes'));
  const [service, setService] = useState(params.get('service') ?? '');
  const [niveau, setNiveau] = useState(params.get('niveau') ?? '');
  const [texte, setTexte] = useState(params.get('texte') ?? '');
  const [texteApplique, setTexteApplique] = useState(params.get('texte') ?? '');
  const [minutes, setMinutes] = useState(PERIODES.includes(minutesUrl) ? minutesUrl : 60);
  const [direct, setDirect] = useState(true);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [nomRecherche, setNomRecherche] = useState<string | null>(null);
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [lienCopie, setLienCopie] = useState(false);
  const { peut } = useSupervision();

  const q = new URLSearchParams({ minutes: String(minutes), limite: '300' });
  if (service) q.set('service', service);
  if (niveau) q.set('niveau', niveau);
  if (texteApplique) q.set('texte', texteApplique);
  const etat = useDonnees<LigneJournal[]>(`/journaux?${q}`, direct ? 10_000 : 0);
  const filtres = new URLSearchParams({ minutes: String(minutes) });
  if (service) filtres.set('service', service);
  if (niveau) filtres.set('niveau', niveau);
  if (texteApplique) filtres.set('texte', texteApplique);
  const analyse = useDonnees<AnalyseJournaux>(`/journaux/analyse?${filtres}`, direct ? 30_000 : 0);
  const recherches = useDonnees<RechercheJournaux[]>('/journaux/recherches', 0);

  useEffect(() => setParams(filtres, { replace: true }), [filtres.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const appliquer = (r: RechercheJournaux) => {
    setService(r.service);
    setNiveau(r.niveau);
    setTexte(r.texte);
    setTexteApplique(r.texte);
    setMinutes(r.minutes);
  };
  const enregistrer = async () => {
    setErreurAction(null);
    try {
      await appeler('/journaux/recherches', { methode: 'POST', corps: { nom: nomRecherche, service, niveau, texte: texteApplique, minutes } });
      setNomRecherche(null);
      await recherches.recharger();
    } catch (e) {
      setErreurAction((e as Error).message);
    }
  };
  const supprimer = async (id: string) => {
    await appeler(`/journaux/recherches/${id}`, { methode: 'DELETE' }).catch((e) => setErreurAction((e as Error).message));
    await recherches.recharger();
  };
  const copierLien = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLienCopie(true);
      setTimeout(() => setLienCopie(false), 2000);
    } catch {
      setErreurAction('Copie impossible : copiez l’adresse du navigateur.');
    }
  };
  const exporter = () => {
    if (!etat.donnees) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + versCsv(etat.donnees)], { type: 'text/csv;charset=utf-8' }));
    a.download = `journaux-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const compte = (n: string) => etat.donnees?.filter((l) => l.niveau === n).length ?? 0;

  return (
    <div className="empile">
      <Carte>
        <form
          className="filtres"
          onSubmit={(e) => {
            e.preventDefault();
            setTexteApplique(texte);
          }}
        >
          <select className="champ" value={service} onChange={(e) => setService(e.target.value)} aria-label="Service">
            <option value="">Tous les services</option>
            {SERVICES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="onglets" role="tablist">
            {[
              ['', 'Tout'],
              ['warn', 'Avertissements'],
              ['error', 'Erreurs'],
            ].map(([v, l]) => (
              <button type="button" key={v} className={niveau === v ? 'actif' : ''} onClick={() => setNiveau(v)}>
                {l}
              </button>
            ))}
          </div>
          <select className="champ" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Période">
            <option value={15}>15 dernières minutes</option>
            <option value={60}>Dernière heure</option>
            <option value={360}>6 dernières heures</option>
            <option value={1440}>24 dernières heures</option>
          </select>
          <input
            className="champ"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Chercher : ECONNREFUSED, timeout, migration…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
          <button className="bouton primaire" type="submit">
            Chercher
          </button>
          <button type="button" className="bouton" onClick={() => setDirect(!direct)} title={direct ? 'Mettre en pause' : 'Reprendre le direct'}>
            {direct ? <Pause size={14} /> : <Play size={14} />} {direct ? 'En direct' : 'En pause'}
          </button>
        </form>
        <div className="filtres" style={{ marginTop: 12 }}>
          <Bookmark size={14} />
          <select
            className="champ"
            aria-label="Recherches enregistrées"
            value=""
            onChange={(e) => {
              const r = recherches.donnees?.find((x) => x.id === e.target.value);
              if (r) appliquer(r);
            }}
          >
            <option value="">Recherches enregistrées ({recherches.donnees?.length ?? 0})</option>
            {recherches.donnees?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nom} — {r.par}
              </option>
            ))}
          </select>
          {peut('agir') &&
            (nomRecherche === null ? (
              <button type="button" className="bouton petit" onClick={() => setNomRecherche('')}>
                Enregistrer cette recherche
              </button>
            ) : (
              <form
                className="ligne-flex"
                onSubmit={(e) => {
                  e.preventDefault();
                  void enregistrer();
                }}
              >
                <input
                  className="champ"
                  autoFocus
                  placeholder="Nom (ex. Erreurs notify)"
                  value={nomRecherche}
                  onChange={(e) => setNomRecherche(e.target.value)}
                  aria-label="Nom de la recherche"
                />
                <button className="bouton petit primaire" type="submit">
                  OK
                </button>
                <button type="button" className="bouton petit" onClick={() => setNomRecherche(null)}>
                  Annuler
                </button>
              </form>
            ))}
          {peut('agir') &&
            recherches.donnees
              ?.filter((r) => r.service === service && r.niveau === niveau && r.texte === texteApplique && r.minutes === minutes)
              .map((r) => (
                <button key={r.id} type="button" className="bouton petit" title={`Supprimer « ${r.nom} »`} onClick={() => supprimer(r.id)}>
                  <Trash2 size={12} /> Supprimer « {r.nom} »
                </button>
              ))}
          <span className="espace" />
          <button type="button" className="bouton petit" onClick={copierLien}>
            <Link2 size={12} /> {lienCopie ? 'Lien copié' : 'Copier le lien'}
          </button>
          <button type="button" className="bouton petit" onClick={exporter} disabled={!etat.donnees?.length}>
            <Download size={12} /> Exporter en CSV
          </button>
        </div>
        {erreurAction && (
          <div className="erreur" style={{ marginTop: 10 }}>
            {erreurAction}
          </div>
        )}
      </Carte>

      <AnalyseJournal
        analyse={analyse}
        choisirTexte={(t) => {
          setTexte(t);
          setTexteApplique(t);
        }}
        choisirService={setService}
      />

      <Carte titre="Journaux" sousTitre={etat.donnees ? `${etat.donnees.length} lignes · ${compte('error')} erreur(s) · ${compte('warn')} avertissement(s)` : 'Lecture…'}>
        {etat.erreur ? (
          <Erreur message={etat.erreur} />
        ) : !etat.donnees ? (
          <Squelette hauteur={400} />
        ) : etat.donnees.length ? (
          <div className="journal">
            {etat.donnees.map((l, i) => {
              const cle = `${l.t}-${i}`;
              return (
                <div className="journal-ligne" key={cle} onClick={() => setOuverte(ouverte === cle ? null : cle)} style={{ cursor: 'pointer' }}>
                  <time>{new Date(l.t).toLocaleTimeString('fr-FR')}</time>
                  <span className="svc">{l.service}</span>
                  <span className={`niv niv-${l.niveau}`}>{l.niveau.toUpperCase()}</span>
                  <span className="msg">{ouverte === cle ? detailLigne(l) : l.message}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <Vide icone={<ScrollText size={28} />}>Aucune ligne ne correspond à ces filtres.</Vide>
        )}
      </Carte>
    </div>
  );
}

/** Une ligne JSON se lit mieux indentée ; le reste s'affiche tel quel. */
function detailLigne(l: LigneJournal): string {
  try {
    return `${new Date(l.t).toLocaleString('fr-FR')}\n${JSON.stringify(JSON.parse(l.message), null, 2)}`;
  } catch {
    return `${new Date(l.t).toLocaleString('fr-FR')}\n${l.message}`;
  }
}

function AnalyseJournal({
  analyse,
  choisirTexte,
  choisirService,
}: {
  analyse: { donnees: AnalyseJournaux | null; erreur: string | null };
  choisirTexte: (t: string) => void;
  choisirService: (s: string) => void;
}) {
  const a = analyse.donnees;
  if (analyse.erreur) return <Erreur message={analyse.erreur} />;
  if (!a) return <Squelette hauteur={160} />;
  if (!a.lignes) return null;
  const max = Math.max(1, ...a.seaux.map((x) => x.debug + x.info + x.warn + x.error));
  return (
    <div className="empile">
      <div className="grille g-principal" style={{ alignItems: 'start' }}>
        <Carte titre="Volume dans le temps" sousTitre={`${a.lignes} lignes analysées${a.tronque ? ` (les plus récentes, depuis ${dateHeure(a.debut)})` : ''} · par niveau`}>
          <div className="histo" role="img" aria-label={`Histogramme : ${a.lignes} lignes, ${a.seaux.reduce((s, x) => s + x.error, 0)} erreurs`}>
            {a.seaux.map((x) => {
              const total = x.debug + x.info + x.warn + x.error;
              return (
                <div key={x.t} className="histo-col" title={`${dateHeure(x.t)} : ${total} ligne(s) — ${x.error} erreur(s), ${x.warn} avertissement(s)`}>
                  <div className="histo-pile" style={{ height: `${(100 * total) / max}%` }}>
                    {(['error', 'warn', 'info', 'debug'] as const).map((n) => x[n] > 0 && <div key={n} className={`histo-${n}`} style={{ flex: x[n] }} />)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="histo-axe">
            <span>{dateHeure(a.debut)}</span>
            <span>{dateHeure(a.fin)}</span>
          </div>
        </Carte>
        <Carte titre="Par service" sousTitre="Cliquer pour filtrer">
          <div className="empile" style={{ gap: 6 }}>
            {a.services.slice(0, 8).map((s) => (
              <button key={s.service} className="bouton petit" style={{ justifyContent: 'space-between' }} onClick={() => choisirService(s.service)}>
                <span className="mono">{s.service}</span>
                <span>
                  {s.nombre}
                  {s.erreurs > 0 && <span className="texte-rouge"> · {s.erreurs} erreur(s)</span>}
                </span>
              </button>
            ))}
          </div>
        </Carte>
      </div>
      <Carte serree titre="Catégories de messages" sousTitre="Les lignes semblables regroupées (chiffres et identifiants effacés) : repérer une nouvelle erreur d’un coup d’œil">
        <Categories liste={a.categories} choisir={choisirTexte} />
      </Carte>
    </div>
  );
}

function Categories({ liste, choisir }: { liste: CategorieJournal[]; choisir: (t: string) => void }) {
  return (
    <div className="tableau-conteneur">
      <table className="tableau">
        <thead>
          <tr>
            <th>Niveau</th>
            <th className="num">Lignes</th>
            <th>Message type</th>
            <th>Services</th>
            <th>Dernière</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((c) => (
            <tr key={`${c.niveau}|${c.motif}`} className="ligne-cliquable" title={c.exemple} onClick={() => c.recherche && choisir(c.recherche)}>
              <td>
                <Pastille statut={COULEUR_NIVEAU[c.niveau]}>{c.niveau}</Pastille> {c.nouveau && <Pastille statut="violet">nouveau</Pastille>}
              </td>
              <td className="num">{c.nombre}</td>
              <td className="mono" style={{ maxWidth: 520, wordBreak: 'break-word' }}>
                {c.motif}
              </td>
              <td className="discret">{c.services.join(', ')}</td>
              <td className="discret" style={{ whiteSpace: 'nowrap' }}>
                {dateHeure(c.dernier)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
