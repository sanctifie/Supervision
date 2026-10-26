import { useState } from 'react';
import { AppWindow, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { appeler } from '../lib/api';
import { useSupervision } from '../components/Coquille';
import { Carte, Charge, Erreur, Modale, Vide } from '../components/ui';
import type { VueApplication } from '../../../shared/applications';

const VIDE = { nom: '', description: '', projet: '', services: '' };

/** Les applications supervisées : on déclare ici les éléments (services, serveurs, bases…) de chacune. */
export default function Applications() {
  const etat = useDonnees<VueApplication[]>('/applications', 30_000);
  const { peut } = useSupervision();
  const admin = peut('administrer');
  const [edition, setEdition] = useState<{ id: string | null; champs: typeof VIDE } | null>(null);
  const [aSupprimer, setASupprimer] = useState<VueApplication | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const agir = async (chemin: string, methode: string, corps?: unknown) => {
    setErreur(null);
    try {
      await appeler(chemin, { methode, corps });
      setEdition(null);
      setASupprimer(null);
      await etat.recharger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  };
  const ouvrir = (a?: VueApplication) =>
    setEdition({ id: a?.id ?? null, champs: a ? { nom: a.nom, description: a.description, projet: a.projet ?? '', services: a.services.join('\n') } : VIDE });

  return (
    <div className="empile">
      <div className="ligne-flex">
        <p className="discret" style={{ margin: 0, flex: 1 }}>
          Une application, c’est un ensemble d’éléments (services, serveurs, bases de données…). Tickets, journaux et déploiements s’y rattachent.
        </p>
        {admin && (
          <button className="bouton primaire" onClick={() => ouvrir()}>
            <Plus size={15} /> Nouvelle application
          </button>
        )}
      </div>
      {erreur && !edition && !aSupprimer && <Erreur message={erreur} />}
      <Charge etat={etat}>
        {(apps) =>
          apps.length ? (
            <div className="grille g2" style={{ alignItems: 'start' }}>
              {apps.map((a) => (
                <Carte
                  key={a.id}
                  titre={a.nom}
                  sousTitre={a.description || undefined}
                  droite={
                    admin && (
                      <span className="ligne-flex">
                        <button className="bouton petit" title="Modifier" aria-label={`Modifier ${a.nom}`} onClick={() => ouvrir(a)}>
                          <Pencil size={12} />
                        </button>
                        <button className="bouton petit" title="Supprimer" aria-label={`Supprimer ${a.nom}`} onClick={() => setASupprimer(a)}>
                          <Trash2 size={12} />
                        </button>
                      </span>
                    )
                  }
                >
                  <div className="ligne-flex" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className="discret">{a.ouverts} ticket(s) ouvert(s)</span>
                    {a.projet && <span className="mono discret">· projet Compose « {a.projet} »</span>}
                  </div>
                  <div className="ligne-flex" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {a.services.length ? (
                      a.services.map((s) => (
                        <span key={s} className="pastille inconnu mono">
                          {s}
                        </span>
                      ))
                    ) : (
                      <span className="discret">Aucun élément déclaré.</span>
                    )}
                  </div>
                </Carte>
              ))}
            </div>
          ) : (
            <Carte>
              <Vide icone={<AppWindow size={28} />}>Aucune application déclarée.{admin ? ' Créez la première avec « Nouvelle application ».' : ''}</Vide>
            </Carte>
          )
        }
      </Charge>

      {edition && (
        <Modale titre={edition.id ? 'Modifier l’application' : 'Nouvelle application'} fermer={() => setEdition(null)}>
          <div className="champ-groupe">
            <label className="etiquette">Nom</label>
            <input className="champ" autoFocus value={edition.champs.nom} onChange={(e) => setEdition({ ...edition, champs: { ...edition.champs, nom: e.target.value } })} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Description</label>
            <input className="champ" value={edition.champs.description} onChange={(e) => setEdition({ ...edition, champs: { ...edition.champs, description: e.target.value } })} />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Projet Docker Compose (facultatif)</label>
            <input
              className="champ mono"
              placeholder="officina"
              value={edition.champs.projet}
              onChange={(e) => setEdition({ ...edition, champs: { ...edition.champs, projet: e.target.value } })}
            />
          </div>
          <div className="champ-groupe">
            <label className="etiquette">Éléments (un par ligne ou séparés par des virgules)</label>
            <textarea
              className="champ mono"
              rows={7}
              placeholder={'web\napi\nbase-de-donnees\nserveur-1'}
              value={edition.champs.services}
              onChange={(e) => setEdition({ ...edition, champs: { ...edition.champs, services: e.target.value } })}
            />
            <div className="discret">Pour les journaux et les déploiements, le nom doit être celui du service Docker Compose.</div>
          </div>
          {erreur && <div className="erreur">{erreur}</div>}
          <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="bouton" onClick={() => setEdition(null)}>
              Annuler
            </button>
            <button className="bouton primaire" onClick={() => agir(edition.id ? `/applications/${edition.id}` : '/applications', edition.id ? 'PATCH' : 'POST', edition.champs)}>
              Enregistrer
            </button>
          </div>
        </Modale>
      )}

      {aSupprimer && (
        <Modale titre={`Supprimer « ${aSupprimer.nom} » ?`} fermer={() => setASupprimer(null)}>
          <p>
            Ses {aSupprimer.ouverts} ticket(s) ouvert(s) et son historique sont conservés, mais ne seront plus rattachés à une application. Les éléments pourront être déclarés
            ailleurs.
          </p>
          {erreur && <div className="erreur">{erreur}</div>}
          <div className="ligne-flex" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="bouton" onClick={() => setASupprimer(null)}>
              Annuler
            </button>
            <button className="bouton primaire" onClick={() => agir(`/applications/${aSupprimer.id}`, 'DELETE')}>
              Supprimer
            </button>
          </div>
        </Modale>
      )}
    </div>
  );
}
