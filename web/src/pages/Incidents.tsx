import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, FileText, Hand, Plus, Siren } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Modale, Pastille, Vide } from '../components/ui';
import { STATUT_PRIORITE } from './Alertes';
import { dateHeure, depuis, duree, nombre } from '../../../shared/format';
import type { Incident, Priorite, VueIncidents } from '../../../shared/types';

const MODELE_POST_MORTEM = `## Résumé
Ce qui s'est passé, en deux phrases.

## Impact
Qui a été touché, combien de temps (ventes, paiements, postes).

## Chronologie
- HH:MM détection
- HH:MM acquittement
- HH:MM mitigation
- HH:MM résolution

## Cause racine
Pourquoi c'est arrivé (sans chercher de coupable).

## Actions correctives
- [ ] Action — responsable — échéance
`;

const LIBELLE_STATUT_INCIDENT = { ouvert: 'Ouvert', acquitte: 'Pris en charge', resolu: 'Résolu' };

function Cycle({ i }: { i: Incident }) {
  const etapes = [
    { nom: 'Détection', t: i.detecteLe },
    { nom: 'Acquittement', t: i.acquitteLe },
    { nom: 'Résolution', t: i.resoluLe },
    { nom: 'Post-mortem', t: i.postMortem.trim() ? (i.resoluLe ?? null) : null },
  ];
  return (
    <div className="ligne-flex" style={{ gap: 0, alignItems: 'flex-start', margin: '6px 0 14px' }}>
      {etapes.map((e, n) => (
        <div key={e.nom} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
          {n > 0 && <div style={{ position: 'absolute', top: 17, right: '50%', width: '100%', height: 2, background: e.t ? '#2f5bea' : '#e7ecf6' }} />}
          <div className={`etape-numero ${e.t ? 'fait' : ''}`} style={{ margin: '0 auto', position: 'relative' }}>
            {e.t ? <CheckCircle2 size={16} /> : n + 1}
          </div>
          <div style={{ fontSize: '0.76rem', fontWeight: 600, marginTop: 6 }}>{e.nom}</div>
          <div className="discret" style={{ fontSize: '0.7rem' }}>
            {e.t ? (n === 0 ? dateHeure(e.t) : `+${duree((e.t - i.detecteLe) / 1000)}`) : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

function Detail({ i, recharger }: { i: Incident; recharger: () => void }) {
  const [note, setNote] = useState('');
  const [pm, setPm] = useState(i.postMortem || '');
  const [enregistre, setEnregistre] = useState(false);
  useEffect(() => {
    setPm(i.postMortem || '');
    setEnregistre(false);
  }, [i.id, i.postMortem]);

  const agir = async (action: string, texte?: string) => {
    await appeler(`/incidents/${i.id}/${action}`, { methode: 'POST', corps: { texte } });
    recharger();
  };

  return (
    <Carte
      titre={i.titre}
      sousTitre={`${i.automatique ? 'Ouvert par une alerte' : 'Déclaré à la main'} · ${dateHeure(i.detecteLe)}`}
      droite={
        <>
          <Pastille statut={STATUT_PRIORITE[i.priorite]}>{i.priorite}</Pastille>
          <Pastille statut={i.statut === 'resolu' ? 'vert' : i.statut === 'acquitte' ? 'orange' : 'rouge'}>{LIBELLE_STATUT_INCIDENT[i.statut]}</Pastille>
        </>
      }
    >
      <Cycle i={i} />
      <div className="ligne-flex mb">
        {i.statut === 'ouvert' && (
          <button className="bouton primaire" onClick={() => agir('acquitter')}>
            <Hand size={15} /> Je prends en charge
          </button>
        )}
        {i.statut !== 'resolu' && (
          <button className="bouton" onClick={() => agir('resoudre')}>
            <CheckCircle2 size={15} /> Marquer résolu
          </button>
        )}
      </div>

      <strong style={{ fontSize: '0.86rem' }}>Journal</strong>
      <ul className="activite" style={{ margin: '6px 0 10px' }}>
        {i.journal.map((n, k) => (
          <li key={k}>
            <span className="tuile" style={{ width: 28, height: 28 }}>
              <Clock size={13} />
            </span>
            <div style={{ minWidth: 0 }}>
              <strong>{n.auteur}</strong>
              <span style={{ whiteSpace: 'pre-wrap' }}>{n.texte}</span>
            </div>
            <time>{dateHeure(n.t)}</time>
          </li>
        ))}
      </ul>
      <form
        className="ligne-flex mb"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) return;
          await agir('note', note);
          setNote('');
        }}
      >
        <input className="champ" style={{ flex: 1 }} placeholder="Ajouter une note (mitigation, communication, rollback…)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="bouton" type="submit">
          Ajouter
        </button>
      </form>

      {i.statut === 'resolu' && (
        <>
          <div className="ligne-flex" style={{ marginBottom: 6 }}>
            <strong style={{ fontSize: '0.86rem' }}>
              <FileText size={14} style={{ verticalAlign: -2 }} /> Post-mortem sans blâme
            </strong>
            <span className="discret">à rédiger sous 5 jours pour les P1 et P2</span>
            <span className="espace" />
            {!pm.trim() && (
              <button className="bouton petit" onClick={() => setPm(MODELE_POST_MORTEM)}>
                Partir du modèle
              </button>
            )}
          </div>
          <textarea className="champ mono" rows={10} value={pm} onChange={(e) => {
            setPm(e.target.value);
            setEnregistre(false);
          }} />
          <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            {enregistre && <span className="discret">Enregistré.</span>}
            <button
              className="bouton primaire"
              onClick={async () => {
                await agir('post-mortem', pm);
                setEnregistre(true);
              }}
            >
              Enregistrer le post-mortem
            </button>
          </div>
        </>
      )}
    </Carte>
  );
}

export default function Incidents() {
  const etat = useDonnees<VueIncidents>('/incidents', 10_000);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [titre, setTitre] = useState('');
  const [priorite, setPriorite] = useState<Priorite>('P2');
  const [note, setNote] = useState('');

  return (
    <Charge etat={etat}>
      {(v) => {
        const actif = v.incidents.find((i) => i.id === choisi) ?? v.incidents.find((i) => i.statut !== 'resolu') ?? v.incidents[0];
        const ind = v.indicateurs;
        return (
          <div className="empile">
            <div className="grille g4">
              <div className="carte kpi">
                <div className="kpi-libelle">En cours</div>
                <div className="kpi-valeur">{ind.ouverts}</div>
                <div className={`kpi-sous ${ind.ouverts ? 'rouge' : 'vert'}`}>{ind.ouverts ? 'à traiter' : 'aucun incident ouvert'}</div>
              </div>
              <div className="carte kpi">
                <div className="kpi-libelle">MTTA (30 j)</div>
                <div className="kpi-valeur">{ind.mttaMinutes === null ? '—' : duree(ind.mttaMinutes * 60)}</div>
                <div className="kpi-sous inconnu">délai moyen d’acquittement</div>
              </div>
              <div className="carte kpi">
                <div className="kpi-libelle">MTTR (30 j)</div>
                <div className="kpi-valeur">{ind.mttrMinutes === null ? '—' : duree(ind.mttrMinutes * 60)}</div>
                <div className="kpi-sous inconnu">délai moyen de résolution</div>
              </div>
              <div className="carte kpi">
                <div className="kpi-libelle">Ce mois-ci</div>
                <div className="kpi-valeur">{nombre(ind.ceMois)}</div>
                <div className={`kpi-sous ${ind.postMortemsEnRetard ? 'orange' : 'vert'}`}>
                  {ind.postMortemsEnRetard ? `${ind.postMortemsEnRetard} post-mortem(s) en retard` : 'post-mortems à jour'}
                </div>
              </div>
            </div>

            <div className="grille g-principal" style={{ alignItems: 'start' }}>
              {actif ? <Detail i={actif} recharger={etat.recharger} /> : (
                <Carte>
                  <Vide icone={<Siren size={28} />}>Aucun incident enregistré. Les alertes P1 et P2 en ouvriront un automatiquement.</Vide>
                </Carte>
              )}
              <Carte
                serree
                titre="Historique"
                droite={
                  <button className="bouton primaire petit" onClick={() => setNouveau(true)}>
                    <Plus size={14} /> Déclarer
                  </button>
                }
              >
                <div style={{ maxHeight: 640, overflowY: 'auto', marginTop: 10 }}>
                  {v.incidents.length ? (
                    v.incidents.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => setChoisi(i.id)}
                        className="case"
                        style={{ width: '100%', border: 0, background: actif?.id === i.id ? '#f4f7ff' : 'transparent', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <Pastille statut={STATUT_PRIORITE[i.priorite]}>{i.priorite}</Pastille>
                        <span className="case-texte">
                          <strong>{i.titre}</strong>
                          <span>
                            {LIBELLE_STATUT_INCIDENT[i.statut]} · {depuis(i.detecteLe)}
                            {i.resoluLe ? ` · durée ${duree((i.resoluLe - i.detecteLe) / 1000)}` : ''}
                          </span>
                        </span>
                      </button>
                    ))
                  ) : (
                    <Vide>Rien pour l’instant.</Vide>
                  )}
                </div>
              </Carte>
            </div>

            {nouveau && (
              <Modale titre="Déclarer un incident" fermer={() => setNouveau(false)}>
                <label className="etiquette">Ce qui se passe</label>
                <input className="champ" value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. : les paiements Airtel Money échouent" autoFocus />
                <label className="etiquette" style={{ marginTop: 14 }}>
                  Priorité
                </label>
                <div className="onglets">
                  {(['P1', 'P2', 'P3'] as Priorite[]).map((p) => (
                    <button key={p} type="button" className={priorite === p ? 'actif' : ''} onClick={() => setPriorite(p)}>
                      {p}
                    </button>
                  ))}
                </div>
                <label className="etiquette" style={{ marginTop: 14 }}>
                  Première note (facultatif)
                </label>
                <textarea className="champ" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                  <button className="bouton" onClick={() => setNouveau(false)}>
                    Annuler
                  </button>
                  <button
                    className="bouton primaire"
                    disabled={!titre.trim()}
                    onClick={async () => {
                      const i = await appeler<Incident>('/incidents', { methode: 'POST', corps: { titre, priorite, note } });
                      setNouveau(false);
                      setTitre('');
                      setNote('');
                      setChoisi(i.id);
                      void etat.recharger();
                    }}
                  >
                    Déclarer
                  </button>
                </div>
              </Modale>
            )}
          </div>
        );
      }}
    </Charge>
  );
}
