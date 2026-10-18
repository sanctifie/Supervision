import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Eye, EyeOff, Link2, Lock, MessageSquare, Plus, ShieldCheck, ThumbsDown, ThumbsUp, UserCheck, X, BookOpen } from 'lucide-react';
import { useDonnees } from '../../lib/useDonnees';
import { appeler } from '../../lib/api';
import { useSupervision } from '../../components/Coquille';
import { Carte, Charge, Modale, Pastille } from '../../components/ui';
import { CartePiecesJointes } from './PiecesJointes';
import type { ArticleResume } from '../../../../shared/connaissances';
import {
  BadgeSla,
  BarreEtapes,
  CHEMIN_TYPE,
  IconeType,
  LienTicket,
  PastillePriorite,
  PastilleStatut,
  depuisChampDate,
  texteEcheance,
  useReferentiels,
  versChampDate,
} from '../../components/itsm';
import { dateHeure, depuis } from '../../../../shared/format';
import {
  AIDE_IMPACT,
  AIDE_URGENCE,
  CANAUX,
  CATEGORIES,
  CODES_RESOLUTION,
  CODES_RESOLUTION_PROBLEME,
  MOTIFS_ATTENTE,
  LIBELLE_NIVEAU,
  LIBELLE_TYPE,
  estOuvert,
  libelleStatut,
  type EtatSla,
  type Niveau,
  type Ticket,
  type TicketResume,
} from '../../../../shared/itsm';

interface Detail {
  ticket: Ticket;
  sla: { etat: EtatSla; echeance: number | null; phase: 'reponse' | 'resolution' | null };
  transitions: { statut: string; libelle: string; bloque: string | null }[];
  liens: TicketResume[];
  enfants: TicketResume[];
  avertissements: string[];
  articles: ArticleResume[];
  suggestions: ArticleResume[];
}

const MODELE_POST_MORTEM = `## Résumé
Ce qui s'est passé, en deux phrases.

## Impact
Qui a été touché, combien de temps (ventes, paiements, postes).

## Chronologie
- HH:MM détection
- HH:MM prise en charge
- HH:MM mitigation
- HH:MM résolution

## Cause racine
Pourquoi c'est arrivé (sans chercher de coupable).

## Actions correctives
- [ ] Action — responsable — échéance
`;

/** Zone de texte enregistrée quand on la quitte. */
function ChampTexte({
  label,
  valeur,
  enregistrer,
  lignes = 4,
  lecture,
  aide,
  mono,
}: {
  label: string;
  valeur: string;
  enregistrer: (v: string) => void;
  lignes?: number;
  lecture?: boolean;
  aide?: string;
  mono?: boolean;
}) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return (
    <div className="champ-groupe">
      <label className="etiquette">{label}</label>
      <textarea
        className={`champ ${mono ? 'mono' : ''}`}
        rows={lignes}
        value={v}
        readOnly={lecture}
        placeholder={aide}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== valeur && enregistrer(v)}
      />
    </div>
  );
}

function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fiche-ligne">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

export default function FicheTicket() {
  const { numero = '' } = useParams();
  const etat = useDonnees<Detail>(`/tickets/${encodeURIComponent(numero)}`, 20_000);
  return <Charge etat={etat}>{(d) => <Fiche d={d} remplacer={etat.remplacer} recharger={etat.recharger} />}</Charge>;
}

function Fiche({ d, remplacer, recharger }: { d: Detail; remplacer: (d: Detail) => void; recharger: () => Promise<void> }) {
  const t = d.ticket;
  const { nom, peut } = useSupervision();
  const agent = peut('agir');
  const ref = useReferentiels();
  const naviguer = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const [cible, setCible] = useState<{ statut: string; libelle: string; bloque: string | null } | null>(null);
  // Un demandeur consulte et commente ; seul un agent modifie.
  const ouvert = estOuvert(t) && agent;

  const action = async (chemin: string, corps: unknown, methode = 'POST') => {
    setErreur(null);
    try {
      remplacer(await appeler<Detail>(`/tickets/${t.numero}${chemin}`, { methode, corps }));
      return true;
    } catch (e) {
      setErreur((e as Error).message);
      return false;
    }
  };
  const patch = (champs: Partial<Ticket> | Record<string, unknown>) => action('', champs, 'PATCH');

  const membres = [...new Set([...ref.equipe.membres, ...(t.assigneA ? [t.assigneA] : []), nom])];
  const cis = [...new Set([...ref.elementsConfiguration, ...(t.ci ? [t.ci] : [])])];
  const groupes = [...new Set([...ref.equipe.groupes, ...(t.groupe ? [t.groupe] : [])])];

  return (
    <div className="empile">
      <Link to={CHEMIN_TYPE[t.type]} className="lien-fleche" style={{ color: 'var(--gris)' }}>
        <ArrowLeft size={14} /> {LIBELLE_TYPE[t.type].des}
      </Link>

      <div className="carte">
        <div className="ligne-flex" style={{ alignItems: 'flex-start' }}>
          <span className={`tuile grande ${t.priorite === 'P1' ? 'rouge' : t.priorite === 'P2' ? 'orange' : ''}`}>
            <IconeType type={t.type} taille={22} />
          </span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="discret mono">
              {t.numero} · {LIBELLE_TYPE[t.type].un}
              {t.automatique ? ' · ouvert par une alerte' : ''} · par {t.demandeur} {depuis(t.creeLe)}
            </div>
            <TitreEditable valeur={t.titre} lecture={!ouvert} enregistrer={(titre) => patch({ titre })} />
          </div>
          <div className="ligne-flex">
            <PastillePriorite p={t.priorite} />
            <PastilleStatut type={t.type} statut={t.statut} />
            <BadgeSla etat={d.sla.etat} echeance={d.sla.echeance} />
          </div>
        </div>
        <BarreEtapes type={t.type} statut={t.statut} />
        <div className="ligne-flex" style={{ marginTop: 14 }}>
          {d.transitions.map((x, i) => (
            <button key={x.statut} className={`bouton ${i === 0 && !x.bloque ? 'primaire' : ''}`} title={x.bloque ?? undefined} onClick={() => setCible(x)}>
              {x.bloque && <Lock size={13} />} {x.libelle}
            </button>
          ))}
          <span className="espace" />
          {(agent || t.demandeur === nom) && (
            <button
              className="bouton"
              title={t.suivi?.length ? `Suivent : ${t.suivi.join(', ')}` : 'Être prévenu des changements et des messages'}
              onClick={() => action('/suivi', { suivre: !t.suivi?.includes(nom) })}
            >
              {t.suivi?.includes(nom) ? <EyeOff size={14} /> : <Eye size={14} />} {t.suivi?.includes(nom) ? 'Ne plus suivre' : 'Suivre'}
              {t.suivi?.length ? ` (${t.suivi.length})` : ''}
            </button>
          )}
          {ouvert && t.assigneA !== nom && (
            <button className="bouton" onClick={() => patch({ assigneA: nom })}>
              <UserCheck size={14} /> M’assigner
            </button>
          )}
        </div>
        {erreur && (
          <div className="erreur" style={{ marginTop: 12 }}>
            {erreur}
          </div>
        )}
      </div>

      {d.avertissements.length > 0 && (
        <div className="encadre orange">
          {d.avertissements.map((a) => (
            <div key={a} className="ligne-flex" style={{ gap: 8 }}>
              <AlertTriangle size={15} color="#e5860a" /> {a}
            </div>
          ))}
        </div>
      )}

      <div className="grille g-principal" style={{ alignItems: 'start' }}>
        <div className="empile">
          {t.variables && t.variables.length > 0 && (
            <Carte titre={`Formulaire : ${t.catalogue?.nom ?? 'catalogue'}`}>
              {t.variables.map((v) => (
                <div className="fiche-ligne" key={v.libelle}>
                  <span>{v.libelle}</span>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{v.valeur}</div>
                </div>
              ))}
            </Carte>
          )}
          <Carte titre="Description">
            <ChampTexte
              label=""
              valeur={t.description}
              lecture={!ouvert}
              lignes={5}
              aide="Ce qui se passe, depuis quand, qui est touché, ce qui a déjà été essayé…"
              enregistrer={(description) => patch({ description })}
            />
          </Carte>

          {t.type === 'changement' && <SectionsChangement t={t} ouvert={ouvert} patch={patch} action={action} peutApprouver={peut('approuver')} />}

          {t.type === 'probleme' && (
            <Carte titre="Analyse" sousTitre="Erreur connue = contournement documenté ; résolu = cause racine corrigée">
              <ChampTexte
                label="Cause racine"
                valeur={t.causeRacine ?? ''}
                lecture={!ouvert}
                aide="Pourquoi c'est arrivé (5 pourquoi)…"
                enregistrer={(causeRacine) => patch({ causeRacine })}
              />
              <ChampTexte
                label="Contournement"
                valeur={t.contournement ?? ''}
                lecture={!ouvert}
                aide="Comment rétablir le service en attendant la correction…"
                enregistrer={(contournement) => patch({ contournement })}
              />
              <div className="champ-groupe">
                <label className="etiquette">Code de résolution</label>
                <select className="champ" value={t.codeResolution ?? ''} disabled={!ouvert} onChange={(e) => patch({ codeResolution: e.target.value })}>
                  <option value="">—</option>
                  {CODES_RESOLUTION_PROBLEME.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </Carte>
          )}

          {(t.type === 'incident' || t.type === 'demande') && t.statut !== 'nouveau' && (
            <Carte titre="Résolution">
              {t.type === 'incident' && (
                <div className="champ-groupe">
                  <label className="etiquette">Code de résolution</label>
                  <select className="champ" value={t.codeResolution ?? ''} disabled={!ouvert} onChange={(e) => patch({ codeResolution: e.target.value })}>
                    <option value="">—</option>
                    {CODES_RESOLUTION.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
              <ChampTexte
                label="Notes de résolution"
                valeur={t.notesResolution ?? ''}
                lecture={!agent}
                aide="Ce qui a été fait pour rétablir le service"
                enregistrer={(notesResolution) => patch({ notesResolution })}
              />
            </Carte>
          )}

          {t.type === 'incident' && (t.priorite === 'P1' || t.priorite === 'P2') && !estOuvert(t) && agent && (
            <Carte
              titre="Post-mortem sans blâme"
              sousTitre="À rédiger sous 5 jours pour un incident P1 ou P2"
              droite={
                !t.postMortem?.trim() && (
                  <button className="bouton petit" onClick={() => patch({ postMortem: MODELE_POST_MORTEM })}>
                    Partir du modèle
                  </button>
                )
              }
            >
              <ChampTexte label="" mono lignes={12} valeur={t.postMortem ?? ''} enregistrer={(postMortem) => patch({ postMortem })} />
            </Carte>
          )}

          <Activite t={t} action={action} agent={agent} peutCommenter={agent || t.demandeur === nom} />
        </div>

        <div className="empile">
          <Carte titre="Informations">
            <Ligne label="Impact">
              <select className="champ" value={t.impact} disabled={!ouvert} onChange={(e) => patch({ impact: Number(e.target.value) as Niveau })} title={AIDE_IMPACT[t.impact]}>
                {([1, 2, 3] as Niveau[]).map((n) => (
                  <option key={n} value={n}>
                    {LIBELLE_NIVEAU[n]}
                  </option>
                ))}
              </select>
            </Ligne>
            <Ligne label="Urgence">
              <select className="champ" value={t.urgence} disabled={!ouvert} onChange={(e) => patch({ urgence: Number(e.target.value) as Niveau })} title={AIDE_URGENCE[t.urgence]}>
                {([1, 2, 3] as Niveau[]).map((n) => (
                  <option key={n} value={n}>
                    {LIBELLE_NIVEAU[n]}
                  </option>
                ))}
              </select>
            </Ligne>
            <Ligne label="Priorité">
              <PastillePriorite p={t.priorite} /> <span className="discret">impact × urgence</span>
            </Ligne>
            <Ligne label="Catégorie">
              <select className="champ" value={t.categorie} disabled={!ouvert} onChange={(e) => patch({ categorie: e.target.value })}>
                {[...new Set([...CATEGORIES[t.type], t.categorie])].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Ligne>
            <Ligne label="Élément (CI)">
              <select className="champ" value={t.ci ?? ''} disabled={!ouvert} onChange={(e) => patch({ ci: e.target.value || null })}>
                <option value="">—</option>
                {cis.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Ligne>
            <Ligne label="Groupe">
              <select className="champ" value={t.groupe ?? ''} disabled={!ouvert} onChange={(e) => patch({ groupe: e.target.value || null })}>
                <option value="">—</option>
                {groupes.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Ligne>
            <Ligne label="Assigné à">
              <select className="champ" value={t.assigneA ?? ''} disabled={!ouvert} onChange={(e) => patch({ assigneA: e.target.value || null })}>
                <option value="">— personne —</option>
                {membres.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Ligne>
            <Ligne label="Demandeur">
              <TexteCourt valeur={t.demandeur} lecture={!ouvert} enregistrer={(demandeur) => patch({ demandeur })} />
            </Ligne>
            {(t.type === 'incident' || t.type === 'demande') && (
              <Ligne label="Canal">
                <select className="champ" value={t.canal ?? ''} disabled={!ouvert} onChange={(e) => patch({ canal: e.target.value })}>
                  <option value="">—</option>
                  {CANAUX.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Ligne>
            )}
            {t.statut === 'en-attente' && (
              <Ligne label="Attend">
                <select className="champ" value={t.motifAttente ?? ''} disabled={!ouvert} onChange={(e) => patch({ motifAttente: e.target.value })}>
                  {MOTIFS_ATTENTE.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Ligne>
            )}
            {t.type === 'incident' && <IncidentParent t={t} ouvert={ouvert && !d.enfants.length} patch={patch} />}
            {!!t.reouvertures && <Ligne label="Rouvert">{t.reouvertures} fois</Ligne>}
            <div className="fiche-dates">
              <span>Ouvert {dateHeure(t.creeLe)}</span>
              {t.prisEnChargeLe && <span>Pris en charge {dateHeure(t.prisEnChargeLe)}</span>}
              {t.resoluLe && <span>Résolu {dateHeure(t.resoluLe)}</span>}
              {t.closLe && <span>Clos {dateHeure(t.closLe)}</span>}
            </div>
          </Carte>

          {(t.type === 'incident' || t.type === 'demande') && t.echeanceResolution && (
            <Carte titre="Engagements (SLA)">
              <Ligne label="Prise en charge">
                <span className={t.prisEnChargeLe ? (t.prisEnChargeLe <= (t.echeanceReponse ?? 0) ? 'texte-vert' : 'texte-rouge') : ''}>
                  {t.prisEnChargeLe ? (t.prisEnChargeLe <= (t.echeanceReponse ?? 0) ? 'tenue' : 'en retard') : texteEcheance(t.echeanceReponse)}
                </span>
                <div className="discret">avant {dateHeure(t.echeanceReponse)}</div>
              </Ligne>
              <Ligne label="Résolution">
                <BadgeSla
                  etat={d.sla.etat === 'non-applicable' ? 'ok' : d.sla.phase === 'reponse' ? (t.echeanceResolution < Date.now() ? 'depasse' : 'ok') : d.sla.etat}
                  echeance={t.echeanceResolution}
                />
                <div className="discret">avant {dateHeure(t.echeanceResolution)}</div>
              </Ligne>
            </Carte>
          )}

          {d.enfants.length > 0 && (
            <Carte titre={`Incidents enfants (${d.enfants.length})`} sousTitre="Résolus en même temps que cet incident">
              {d.enfants.map((l) => (
                <div key={l.numero} className="ligne-flex lien-ligne">
                  <LienTicket t={l} />
                  <span className="lien-titre">{l.titre}</span>
                  <PastilleStatut type={l.type} statut={l.statut} />
                </div>
              ))}
            </Carte>
          )}
          <Liens d={d} action={action} naviguer={naviguer} recharger={recharger} agent={agent} />
          <CarteConnaissances d={d} agent={agent} action={action} />
          <CartePiecesJointes<Detail> t={t} peutJoindre={agent || t.demandeur === nom} peutRetirer={(p) => agent || p.par === nom} apres={remplacer} />
        </div>
      </div>

      {cible && <ModaleTransition t={t} cible={cible} fermer={() => setCible(null)} apres={remplacer} />}
    </div>
  );
}

function TitreEditable({ valeur, enregistrer, lecture }: { valeur: string; enregistrer: (v: string) => void; lecture: boolean }) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return (
    <input
      className="titre-editable"
      value={v}
      readOnly={lecture}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== valeur && enregistrer(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Titre"
    />
  );
}

/** Rattacher l'incident à un incident principal (un seul niveau). */
function IncidentParent({ t, ouvert, patch }: { t: Ticket; ouvert: boolean; patch: (c: Record<string, unknown>) => Promise<boolean> }) {
  const [v, setV] = useState('');
  if (t.parent)
    return (
      <Ligne label="Parent">
        <Link to={`/tickets/${t.parent}`} className="mono">
          {t.parent}
        </Link>{' '}
        {ouvert && (
          <button className="bouton petit" title="Détacher du parent" aria-label="Détacher du parent" onClick={() => patch({ parent: null })}>
            <X size={12} />
          </button>
        )}
      </Ligne>
    );
  if (!ouvert) return null;
  return (
    <Ligne label="Parent">
      <form
        className="ligne-flex"
        onSubmit={async (e) => {
          e.preventDefault();
          if (v.trim() && (await patch({ parent: v.trim() }))) setV('');
        }}
      >
        <input className="champ mono" style={{ flex: 1 }} placeholder="INC… principal" value={v} onChange={(e) => setV(e.target.value)} aria-label="Incident parent" />
        <button className="bouton petit" type="submit">
          Rattacher
        </button>
      </form>
    </Ligne>
  );
}

function TexteCourt({ valeur, enregistrer, lecture }: { valeur: string; enregistrer: (v: string) => void; lecture: boolean }) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return <input className="champ" value={v} readOnly={lecture} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== valeur && enregistrer(v)} />;
}

function SectionsChangement({
  t,
  ouvert,
  patch,
  action,
  peutApprouver,
}: {
  t: Ticket;
  ouvert: boolean;
  patch: (c: Record<string, unknown>) => Promise<boolean>;
  action: (chemin: string, corps: unknown) => Promise<boolean>;
  peutApprouver: boolean;
}) {
  const [commentaire, setCommentaire] = useState('');
  const modifiable = ouvert && ['brouillon', 'evaluation', 'rejete'].includes(t.statut);
  const fenetreModifiable = ouvert && !['en-cours', 'revue'].includes(t.statut);
  return (
    <>
      <Carte titre="Planification" sousTitre="Standard : pré-approuvé, se planifie directement. Normal : approbation (CAB). Urgent : approbation accélérée.">
        <div className="grille g2" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Type de changement</label>
            <select className="champ" value={t.typeChangement} disabled={!modifiable} onChange={(e) => patch({ typeChangement: e.target.value })}>
              <option value="standard">Standard (pré-approuvé)</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Risque</label>
            <select className="champ" value={t.risque} disabled={!modifiable} onChange={(e) => patch({ risque: e.target.value })}>
              <option value="faible">Faible</option>
              <option value="moyen">Moyen</option>
              <option value="eleve">Élevé</option>
            </select>
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Version cible (déploiement)</label>
            <TexteCourt valeur={t.versionCible ?? ''} lecture={!modifiable} enregistrer={(versionCible) => patch({ versionCible })} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Début prévu</label>
            <input
              className="champ"
              type="datetime-local"
              disabled={!fenetreModifiable}
              value={versChampDate(t.debutPrevu)}
              onChange={(e) => patch({ debutPrevu: depuisChampDate(e.target.value) })}
            />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Fin prévue</label>
            <input
              className="champ"
              type="datetime-local"
              disabled={!fenetreModifiable}
              value={versChampDate(t.finPrevue)}
              onChange={(e) => patch({ finPrevue: depuisChampDate(e.target.value) })}
            />
          </div>
        </div>
        <label className="ligne-flex" style={{ marginTop: 12, fontSize: '0.85rem', gap: 8 }}>
          <input type="checkbox" checked={!!t.silencerAlertes} disabled={!fenetreModifiable} onChange={(e) => patch({ silencerAlertes: e.target.checked })} />
          Mettre en silence les alertes de l’élément « {t.ci ?? 'non renseigné'} » pendant la mise en œuvre
          {t.silenceId && <Pastille statut="violet">silence actif</Pastille>}
        </label>
      </Carte>

      <Carte titre="Plans" sousTitre="Obligatoires avant l’évaluation d’un changement normal ou urgent">
        <ChampTexte
          label="Justification"
          valeur={t.justification ?? ''}
          lecture={!modifiable}
          aide="Pourquoi ce changement, quel bénéfice, que se passe-t-il si on ne le fait pas"
          enregistrer={(justification) => patch({ justification })}
          lignes={3}
        />
        <ChampTexte
          label="Plan de mise en œuvre"
          valeur={t.planMiseEnOeuvre ?? ''}
          lecture={!modifiable}
          mono
          aide="1. … 2. … (commandes, ordre, qui fait quoi)"
          enregistrer={(planMiseEnOeuvre) => patch({ planMiseEnOeuvre })}
        />
        <ChampTexte
          label="Plan de retour arrière"
          valeur={t.planRetourArriere ?? ''}
          lecture={!modifiable}
          mono
          aide="Comment revenir à l’état d’avant, et en combien de temps"
          enregistrer={(planRetourArriere) => patch({ planRetourArriere })}
        />
        <ChampTexte
          label="Plan de test"
          valeur={t.planTest ?? ''}
          lecture={!modifiable}
          mono
          aide="Comment vérifier que tout marche après (tests de fumée)"
          enregistrer={(planTest) => patch({ planTest })}
          lignes={3}
        />
      </Carte>

      <Carte
        titre="Approbation (CAB)"
        sousTitre={t.typeChangement === 'standard' ? 'Changement standard : pré-approuvé' : 'Le comité valide le risque, la fenêtre et le retour arrière'}
      >
        {(t.approbations ?? []).length ? (
          <ul className="activite" style={{ marginBottom: 10 }}>
            {(t.approbations ?? []).map((a, i) => (
              <li key={i}>
                <span className={`tuile ${a.decision === 'approuve' ? 'vert' : 'rouge'}`}>{a.decision === 'approuve' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}</span>
                <div>
                  <strong>
                    {a.decision === 'approuve' ? 'Approuvé' : 'Rejeté'} par {a.par}
                  </strong>
                  <span>{a.commentaire || '—'}</span>
                </div>
                <time>{dateHeure(a.le)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="discret" style={{ marginTop: 0 }}>
            Aucune décision pour l’instant.
          </p>
        )}
        {t.statut === 'evaluation' && !peutApprouver && <p className="discret">En attente d’un approbateur du CAB.</p>}
        {t.statut === 'evaluation' && peutApprouver && (
          <>
            <input className="champ" placeholder="Commentaire (obligatoire pour un rejet)" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
            <div className="ligne-flex" style={{ marginTop: 10 }}>
              <button className="bouton primaire" onClick={async () => (await action('/approbation', { decision: 'approuve', commentaire })) && setCommentaire('')}>
                <ShieldCheck size={14} /> Approuver
              </button>
              <button className="bouton danger" onClick={async () => (await action('/approbation', { decision: 'rejete', commentaire })) && setCommentaire('')}>
                <X size={14} /> Rejeter
              </button>
              <span className="discret">Le demandeur du changement ne peut pas l’approuver lui-même.</span>
            </div>
          </>
        )}
      </Carte>

      {['en-cours', 'revue', 'clos'].includes(t.statut) && (
        <Carte titre="Résultat">
          <select className="champ" value={t.resultat ?? ''} disabled={t.statut === 'clos' || !ouvert} onChange={(e) => patch({ resultat: e.target.value || null })}>
            <option value="">— à renseigner —</option>
            <option value="reussi">Réussi</option>
            <option value="echoue">Échoué</option>
            <option value="retour-arriere">Retour arrière effectué</option>
          </select>
          {t.resultat && t.resultat !== 'reussi' && <p className="discret">Un changement échoué mérite souvent un ticket de problème (lien à droite).</p>}
        </Carte>
      )}
    </>
  );
}

function Activite({ t, action, agent, peutCommenter }: { t: Ticket; action: (chemin: string, corps: unknown) => Promise<boolean>; agent: boolean; peutCommenter: boolean }) {
  const [filtre, setFiltre] = useState<'tout' | 'note' | 'commentaire'>('tout');
  const [type, setType] = useState<'note' | 'commentaire'>(agent ? 'note' : 'commentaire');
  const [texte, setTexte] = useState('');
  const entrees = [...t.activite].reverse().filter((a) => filtre === 'tout' || a.type === filtre);
  return (
    <Carte
      titre="Activité"
      droite={
        agent && (
          <div className="onglets">
            {(
              [
                ['tout', 'Tout'],
                ['note', 'Notes de travail'],
                ['commentaire', 'Commentaires'],
              ] as const
            ).map(([c, l]) => (
              <button key={c} className={filtre === c ? 'actif' : ''} onClick={() => setFiltre(c)}>
                {l}
              </button>
            ))}
          </div>
        )
      }
    >
      {peutCommenter && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (texte.trim() && (await action('/activite', { type, texte }))) setTexte('');
          }}
        >
          <textarea
            className={`champ ${type === 'note' ? 'champ-note' : ''}`}
            rows={3}
            placeholder={
              type === 'note'
                ? 'Note de travail (interne à l’équipe) : diagnostic, actions menées…'
                : agent
                  ? 'Commentaire pour le demandeur'
                  : 'Votre message à l’équipe : précision, réponse à une question…'
            }
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
          <div className="ligne-flex" style={{ marginTop: 8 }}>
            {agent && (
              <div className="onglets">
                <button type="button" className={type === 'note' ? 'actif' : ''} onClick={() => setType('note')}>
                  Note de travail
                </button>
                <button type="button" className={type === 'commentaire' ? 'actif' : ''} onClick={() => setType('commentaire')}>
                  Commentaire
                </button>
              </div>
            )}
            <span className="espace" />
            <button className="bouton primaire" type="submit" disabled={!texte.trim()}>
              <MessageSquare size={14} /> Publier
            </button>
          </div>
        </form>
      )}
      <ul className="activite fil-activite" style={{ marginTop: 14 }}>
        {entrees.map((a, i) => (
          <li key={i} className={`entree-${a.type}`}>
            <span className={`tuile ${a.type === 'systeme' ? 'inconnu' : a.type === 'note' ? 'orange' : ''}`}>
              {a.type === 'systeme' ? <Check size={13} /> : <MessageSquare size={13} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <strong>
                {a.auteur}
                <span className="discret" style={{ fontWeight: 400 }}>
                  {' '}
                  · {a.type === 'note' ? 'note de travail' : a.type === 'commentaire' ? 'commentaire' : 'système'}
                </span>
              </strong>
              <span style={{ whiteSpace: 'pre-wrap' }}>{a.texte}</span>
            </div>
            <time>{dateHeure(a.t)}</time>
          </li>
        ))}
      </ul>
    </Carte>
  );
}

function Liens({
  d,
  action,
  naviguer,
  agent,
}: {
  d: Detail;
  action: (chemin: string, corps: unknown, methode?: string) => Promise<boolean>;
  naviguer: (c: string) => void;
  recharger: () => Promise<void>;
  agent: boolean;
}) {
  const t = d.ticket;
  const [cible, setCible] = useState('');
  const creations: { type: 'probleme' | 'changement' | 'incident'; libelle: string }[] =
    t.type === 'incident'
      ? [
          { type: 'probleme', libelle: 'Créer un problème' },
          { type: 'changement', libelle: 'Créer un changement' },
        ]
      : t.type === 'probleme'
        ? [{ type: 'changement', libelle: 'Créer un changement' }]
        : t.type === 'changement'
          ? [{ type: 'probleme', libelle: 'Créer un problème' }]
          : [{ type: 'incident', libelle: 'Créer un incident' }];
  return (
    <Carte titre={`Tickets liés (${d.liens.length})`}>
      {d.liens.map((l) => (
        <div key={l.numero} className="ligne-flex lien-ligne">
          <LienTicket t={l} />
          <span className="lien-titre">{l.titre}</span>
          <PastilleStatut type={l.type} statut={l.statut} />
          {agent && (
            <button className="bouton petit" title="Retirer le lien" aria-label="Retirer le lien" onClick={() => action(`/liens/${l.numero}`, undefined, 'DELETE')}>
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      {agent && (
        <>
          <form
            className="ligne-flex"
            style={{ marginTop: 10 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (cible.trim() && (await action('/liens', { cible: cible.trim().toUpperCase() }))) setCible('');
            }}
          >
            <input className="champ mono" style={{ flex: 1 }} placeholder="INC0001001, PRB…" value={cible} onChange={(e) => setCible(e.target.value)} />
            <button className="bouton" type="submit">
              <Link2 size={14} /> Lier
            </button>
          </form>
          <div className="ligne-flex" style={{ marginTop: 10 }}>
            {creations.map((c) => (
              <button key={c.type} className="bouton petit" onClick={() => naviguer(`/tickets/nouveau?type=${c.type}&lien=${t.numero}`)}>
                <Plus size={13} /> {c.libelle}
              </button>
            ))}
          </div>
        </>
      )}
    </Carte>
  );
}

function ModaleTransition({
  t,
  cible,
  fermer,
  apres,
}: {
  t: Ticket;
  cible: { statut: string; libelle: string; bloque: string | null };
  fermer: () => void;
  apres: (d: Detail) => void;
}) {
  const resolution = (t.type === 'incident' || t.type === 'demande') && cible.statut === 'resolu';
  const attente = cible.statut === 'en-attente';
  const [motif, setMotif] = useState(t.motifAttente || MOTIFS_ATTENTE[0]);
  const [code, setCode] = useState(t.codeResolution ?? '');
  const [notes, setNotes] = useState(t.notesResolution ?? '');
  const [contournement, setContournement] = useState(t.contournement ?? '');
  const [cause, setCause] = useState(t.causeRacine ?? '');
  const [resultat, setResultat] = useState(t.resultat ?? '');
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const valider = async () => {
    setErreur(null);
    const champs: Record<string, unknown> = {};
    if (resolution) {
      if (t.type === 'incident') champs.codeResolution = code;
      champs.notesResolution = notes;
    }
    if (t.type === 'probleme' && cible.statut === 'erreur-connue') champs.contournement = contournement;
    if (t.type === 'probleme' && cible.statut === 'resolu') Object.assign(champs, { causeRacine: cause, codeResolution: code });
    if (attente) champs.motifAttente = motif;
    if (t.type === 'changement' && cible.statut === 'clos') champs.resultat = resultat || null;
    try {
      if (Object.keys(champs).length) apres(await appeler<Detail>(`/tickets/${t.numero}`, { methode: 'PATCH', corps: champs }));
      apres(await appeler<Detail>(`/tickets/${t.numero}/statut`, { methode: 'POST', corps: { statut: cible.statut, commentaire } }));
      fermer();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };

  return (
    <Modale titre={`${t.numero} : ${cible.libelle.toLowerCase()} (→ ${libelleStatut(t.type, cible.statut)})`} fermer={fermer}>
      {cible.bloque && !resolution && !['erreur-connue', 'resolu', 'clos', 'en-attente'].includes(cible.statut) && (
        <div className="encadre orange" style={{ marginBottom: 12 }}>
          <Lock size={13} /> {cible.bloque}
        </div>
      )}
      {resolution && (
        <>
          {t.type === 'incident' && (
            <div className="champ-groupe">
              <label className="etiquette">Code de résolution</label>
              <select className="champ" value={code} onChange={(e) => setCode(e.target.value)}>
                <option value="">— choisir —</option>
                {CODES_RESOLUTION.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          <ChampLibre label="Notes de résolution" valeur={notes} changer={setNotes} />
        </>
      )}
      {t.type === 'probleme' && cible.statut === 'erreur-connue' && <ChampLibre label="Contournement" valeur={contournement} changer={setContournement} />}
      {attente && (
        <div className="champ-groupe">
          <label className="etiquette">Ce que le ticket attend</label>
          <select className="champ" value={motif} onChange={(e) => setMotif(e.target.value)}>
            {MOTIFS_ATTENTE.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
      )}
      {t.type === 'probleme' && cible.statut === 'resolu' && (
        <>
          <div className="champ-groupe">
            <label className="etiquette">Code de résolution</label>
            <select className="champ" value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">— choisir —</option>
              {CODES_RESOLUTION_PROBLEME.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <ChampLibre label="Cause racine" valeur={cause} changer={setCause} />
        </>
      )}
      {t.type === 'changement' && cible.statut === 'clos' && (
        <div className="champ-groupe">
          <label className="etiquette">Résultat</label>
          <select className="champ" value={resultat} onChange={(e) => setResultat(e.target.value as typeof resultat)}>
            <option value="">— choisir —</option>
            <option value="reussi">Réussi</option>
            <option value="echoue">Échoué</option>
            <option value="retour-arriere">Retour arrière effectué</option>
          </select>
        </div>
      )}
      <ChampLibre label="Note de travail (facultatif)" valeur={commentaire} changer={setCommentaire} lignes={2} />
      {erreur && <div className="erreur">{erreur}</div>}
      <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="bouton" onClick={fermer}>
          Annuler
        </button>
        <button className="bouton primaire" onClick={valider}>
          {cible.libelle}
        </button>
      </div>
    </Modale>
  );
}

function ChampLibre({ label, valeur, changer, lignes = 4 }: { label: string; valeur: string; changer: (v: string) => void; lignes?: number }) {
  return (
    <div className="champ-groupe">
      <label className="etiquette">{label}</label>
      <textarea className="champ" rows={lignes} value={valeur} onChange={(e) => changer(e.target.value)} />
    </div>
  );
}

/** Articles liés au ticket, suggestions, et rédaction depuis le ticket. */
function CarteConnaissances({ d, agent, action }: { d: Detail; agent: boolean; action: (chemin: string, corps: unknown, methode?: string) => Promise<boolean> }) {
  const t = d.ticket;
  const naviguer = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const redigeable = agent && ((t.type === 'incident' && t.statut === 'resolu') || t.type === 'probleme' || t.statut === 'clos');
  if (!d.articles.length && !d.suggestions.length && !redigeable) return null;
  const lier = async (numero: string) => {
    setErreur(null);
    try {
      await appeler(`/connaissances/${numero}/liens`, { methode: 'POST', corps: { ticket: t.numero } });
      await action('', {}, 'PATCH');
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  return (
    <Carte titre="Connaissances">
      {d.articles.map((a) => (
        <div key={a.id} className="ligne-flex lien-ligne">
          <BookOpen size={14} color="#2f5bea" />
          <Link className="lien-titre" to={`/connaissances/${a.numero}`}>
            {a.titre}
          </Link>
        </div>
      ))}
      {d.suggestions.length > 0 && (
        <>
          <div className="discret" style={{ fontSize: '0.76rem', margin: '8px 0 4px' }}>
            Peut aider :
          </div>
          {d.suggestions.map((a) => (
            <div key={a.id} className="ligne-flex lien-ligne">
              <BookOpen size={14} color="#94a3b8" />
              <Link className="lien-titre" to={`/connaissances/${a.numero}`}>
                {a.titre}
              </Link>
              {agent && (
                <button className="bouton petit" onClick={() => lier(a.numero)}>
                  Lier
                </button>
              )}
            </div>
          ))}
        </>
      )}
      {redigeable && (
        <button className="bouton petit" style={{ marginTop: 10 }} onClick={() => naviguer(`/connaissances/nouveau?depuis=${t.numero}`)}>
          <Plus size={13} /> Rédiger un article depuis ce ticket
        </button>
      )}
      {erreur && <div className="erreur">{erreur}</div>}
    </Carte>
  );
}
