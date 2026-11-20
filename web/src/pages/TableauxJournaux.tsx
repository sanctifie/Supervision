import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { Carte, Charge, Erreur, Squelette, Vide } from '../components/ui';
import { Barres } from '../components/graphiques';
import { useSupervision } from '../components/Coquille';
import { nombre } from '../../../shared/format';
import { Histogramme, parametresFiltre, type Filtre, type Recherche } from './Journaux';
import type { LigneJournal, VolumeJournaux } from '../../../shared/types';

type TypePanneau = 'histogramme' | 'compteur' | 'repartition' | 'lignes';
interface Panneau {
  id?: string;
  titre: string;
  type: TypePanneau;
  recherche: string | null;
  largeur: 1 | 2;
}
interface Tableau {
  id: string;
  nom: string;
  minutes: number;
  panneaux: Panneau[];
  par: string;
  majLe: number;
}

const TYPES: Record<TypePanneau, string> = {
  histogramme: 'Histogramme (volume dans le temps)',
  compteur: 'Compteur (total de lignes)',
  repartition: 'Répartition par service',
  lignes: 'Dernières lignes',
};
const PERIODES: Record<number, string> = { 15: '15 dernières minutes', 60: 'Dernière heure', 360: '6 dernières heures', 1440: '24 dernières heures' };

export default function TableauxJournaux() {
  const tableaux = useDonnees<Tableau[]>('/tableaux', 60_000);
  const recherches = useDonnees<Recherche[]>('/recherches', 60_000);
  const [params, setParams] = useSearchParams();
  const [edition, setEdition] = useState<Omit<Tableau, 'id' | 'par' | 'majLe'> & { id?: string }>();
  const { peut } = useSupervision();
  const choisi = tableaux.donnees?.find((t) => t.id === params.get('id')) ?? tableaux.donnees?.[0];

  return (
    <div className="empile">
      <div className="encadre">
        <strong>Comment ça marche :</strong> un tableau de bord regroupe des <strong>panneaux</strong> sur la même période. Chaque panneau montre une{' '}
        <Link to="/journaux">recherche enregistrée</Link> (ou toutes les lignes) sous forme d’histogramme, de compteur, de répartition par service ou des dernières lignes. Les
        tableaux sont partagés avec toute l’équipe et se mettent à jour toutes les 30 s.
      </div>

      <div className="ligne-flex">
        {!!tableaux.donnees?.length && (
          <div className="onglets">
            {tableaux.donnees.map((t) => (
              <button key={t.id} className={choisi?.id === t.id && !edition ? 'actif' : ''} onClick={() => (setEdition(undefined), setParams({ id: t.id }))}>
                {t.nom}
              </button>
            ))}
          </div>
        )}
        <span className="espace" />
        {peut('agir') && !edition && (
          <>
            {choisi && (
              <button className="bouton" onClick={() => setEdition(structuredClone(choisi))}>
                <Pencil size={14} /> Modifier
              </button>
            )}
            <button
              className="bouton primaire"
              onClick={() => setEdition({ nom: '', minutes: 60, panneaux: [{ titre: 'Volume', type: 'histogramme', recherche: null, largeur: 2 }] })}
            >
              <Plus size={15} /> Nouveau tableau
            </button>
          </>
        )}
      </div>

      {edition ? (
        <Edition
          valeur={edition}
          recherches={recherches.donnees ?? []}
          changer={setEdition}
          fermer={() => setEdition(undefined)}
          fait={(id) => {
            setEdition(undefined);
            void tableaux.recharger();
            setParams(id ? { id } : {});
          }}
        />
      ) : (
        <Charge etat={tableaux}>
          {() =>
            choisi ? (
              <div className="grille g2">
                {choisi.panneaux.map((p, i) => (
                  <div key={p.id ?? i} style={p.largeur === 2 ? { gridColumn: '1 / -1' } : undefined}>
                    <VuePanneau p={p} minutes={choisi.minutes} recherche={recherches.donnees?.find((r) => r.id === p.recherche) ?? null} />
                  </div>
                ))}
              </div>
            ) : (
              <Vide icone={<LayoutGrid size={28} />}>Aucun tableau de bord. {peut('agir') ? 'Créez-en un avec « Nouveau tableau ».' : 'Un agent peut en créer un.'}</Vide>
            )
          }
        </Charge>
      )}
    </div>
  );
}

function VuePanneau({ p, minutes, recherche }: { p: Panneau; minutes: number; recherche: Recherche | null }) {
  const filtre: Partial<Filtre> = recherche?.filtre ?? {};
  const sous = `${recherche ? `« ${recherche.nom} »` : 'Toutes les lignes'} · ${PERIODES[minutes].toLowerCase()}`;
  const volume = p.type === 'histogramme' || p.type === 'compteur';
  const etat = useDonnees<VolumeJournaux[] | LigneJournal[]>(
    volume ? `/journaux/volume?${parametresFiltre(filtre, minutes, 10)}` : `/journaux?${parametresFiltre(filtre, minutes, p.type === 'lignes' ? 15 : 1000)}`,
    30_000,
  );
  const d = etat.donnees;
  let contenu;
  if (etat.erreur) contenu = <Erreur message={etat.erreur} />;
  else if (!d) contenu = <Squelette hauteur={140} />;
  else if (p.type === 'histogramme') contenu = <Histogramme volume={d as VolumeJournaux[]} />;
  else if (p.type === 'compteur') {
    const v = d as VolumeJournaux[];
    const somme = (k: 'total' | 'erreurs' | 'avertissements') => v.reduce((s, x) => s + x[k], 0);
    contenu = (
      <div className="ligne-flex" style={{ gap: 28, alignItems: 'baseline' }}>
        {/* Le volume compte tous les niveaux : le filtre de niveau de la recherche s'applique ici. */}
        <div className="mesure-valeur">
          {nombre(filtre.niveau === 'error' ? somme('erreurs') : filtre.niveau === 'warn' ? somme('erreurs') + somme('avertissements') : somme('total'))}
        </div>
        <span className={somme('erreurs') ? 'texte-rouge' : 'discret'}>{nombre(somme('erreurs'))} erreur(s)</span>
        <span className="discret">{nombre(somme('avertissements'))} avertissement(s)</span>
      </div>
    );
  } else if (p.type === 'repartition') {
    const n = new Map<string, number>();
    for (const l of d as LigneJournal[]) n.set(l.service, (n.get(l.service) ?? 0) + 1);
    const donnees = [...n.entries()]
      .map(([nom, valeur]) => ({ nom, valeur }))
      .sort((a, b) => b.valeur - a.valeur)
      .slice(0, 8);
    contenu = donnees.length ? <Barres donnees={donnees} format={String} hauteur={200} /> : <Vide>Aucune ligne</Vide>;
  } else {
    const lignes = d as LigneJournal[];
    contenu = lignes.length ? (
      <div className="journal" style={{ maxHeight: 300 }}>
        {lignes.map((l, i) => (
          <div className="journal-ligne" key={`${l.t}-${i}`}>
            <time>{new Date(l.t).toLocaleTimeString('fr-FR')}</time>
            <span className="svc">{l.service}</span>
            <span className={`niv niv-${l.niveau}`}>{l.niveau.toUpperCase()}</span>
            <span className="msg">{l.message}</span>
          </div>
        ))}
      </div>
    ) : (
      <Vide>Aucune ligne</Vide>
    );
  }
  return (
    <Carte titre={p.titre} sousTitre={p.type === 'repartition' ? `${sous} · sur 1000 lignes au plus` : sous}>
      {contenu}
    </Carte>
  );
}

function Edition({
  valeur: v,
  recherches,
  changer,
  fermer,
  fait,
}: {
  valeur: Omit<Tableau, 'id' | 'par' | 'majLe'> & { id?: string };
  recherches: Recherche[];
  changer: (v: Omit<Tableau, 'id' | 'par' | 'majLe'> & { id?: string }) => void;
  fermer: () => void;
  fait: (id: string | null) => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const panneau = (i: number, p: Partial<Panneau>) => changer({ ...v, panneaux: v.panneaux.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const deplacer = (i: number, d: number) => {
    const ps = [...v.panneaux];
    [ps[i], ps[i + d]] = [ps[i + d], ps[i]];
    changer({ ...v, panneaux: ps });
  };
  return (
    <Carte titre={v.id ? `Modifier « ${v.nom} »` : 'Nouveau tableau de bord'}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const t = await appeler<Tableau>(v.id ? `/tableaux/${v.id}` : '/tableaux', { methode: v.id ? 'PATCH' : 'POST', corps: v });
            fait(t.id);
          } catch (x) {
            setErreur((x as Error).message);
          }
        }}
      >
        <div className="grille g2" style={{ gap: 12 }}>
          <div className="champ-groupe">
            <label className="etiquette">Nom</label>
            <input className="champ" required autoFocus value={v.nom} onChange={(e) => changer({ ...v, nom: e.target.value })} placeholder="Garde du soir" />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Période</label>
            <select className="champ" value={v.minutes} onChange={(e) => changer({ ...v, minutes: Number(e.target.value) })}>
              {Object.entries(PERIODES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="etiquette" style={{ marginTop: 16 }}>
          Panneaux
        </div>
        {v.panneaux.map((p, i) => (
          <div key={p.id ?? i} className="ligne-flex" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input className="champ" style={{ flex: 1, minWidth: 140 }} value={p.titre} onChange={(e) => panneau(i, { titre: e.target.value })} aria-label="Titre du panneau" />
            <select className="champ" value={p.type} onChange={(e) => panneau(i, { type: e.target.value as TypePanneau })} aria-label="Type">
              {Object.entries(TYPES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <select className="champ" value={p.recherche ?? ''} onChange={(e) => panneau(i, { recherche: e.target.value || null })} aria-label="Recherche">
              <option value="">Toutes les lignes</option>
              {recherches.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nom}
                </option>
              ))}
            </select>
            <select className="champ" value={p.largeur} onChange={(e) => panneau(i, { largeur: Number(e.target.value) as 1 | 2 })} aria-label="Largeur">
              <option value={1}>Demi-largeur</option>
              <option value={2}>Pleine largeur</option>
            </select>
            <button type="button" className="icone-bouton" disabled={i === 0} onClick={() => deplacer(i, -1)} aria-label="Monter">
              <ArrowUp size={14} />
            </button>
            <button type="button" className="icone-bouton" disabled={i === v.panneaux.length - 1} onClick={() => deplacer(i, 1)} aria-label="Descendre">
              <ArrowDown size={14} />
            </button>
            <button type="button" className="icone-bouton" onClick={() => changer({ ...v, panneaux: v.panneaux.filter((_, j) => j !== i) })} aria-label="Retirer le panneau">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="bouton petit"
          style={{ marginTop: 10 }}
          disabled={v.panneaux.length >= 20}
          onClick={() => changer({ ...v, panneaux: [...v.panneaux, { titre: 'Panneau', type: 'compteur', recherche: null, largeur: 1 }] })}
        >
          <Plus size={13} /> Ajouter un panneau
        </button>
        {!recherches.length && (
          <p className="discret" style={{ fontSize: '0.8rem' }}>
            Astuce : enregistrez d’abord des recherches dans <Link to="/journaux">Journaux</Link> (ex. « Erreurs paiements ») pour filtrer les panneaux.
          </p>
        )}
        {erreur && (
          <div className="erreur" style={{ marginTop: 12 }}>
            {erreur}
          </div>
        )}
        <div className="ligne-flex" style={{ marginTop: 16 }}>
          {v.id && (
            <button
              type="button"
              className="bouton danger"
              onClick={async () => {
                if (!confirm(`Supprimer le tableau « ${v.nom} » ?`)) return;
                await appeler(`/tableaux/${v.id}`, { methode: 'DELETE' });
                fait(null);
              }}
            >
              Supprimer
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
    </Carte>
  );
}
