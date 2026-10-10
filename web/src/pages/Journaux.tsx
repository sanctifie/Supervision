import { useState } from 'react';
import { Pause, Play, ScrollText } from 'lucide-react';
import { useDonnees } from '../lib/useDonnees';
import { Carte, Erreur, Squelette, Vide } from '../components/ui';
import type { LigneJournal } from '../../../shared/types';

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
  const [service, setService] = useState('');
  const [niveau, setNiveau] = useState('');
  const [texte, setTexte] = useState('');
  const [texteApplique, setTexteApplique] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [direct, setDirect] = useState(true);

  const q = new URLSearchParams({ minutes: String(minutes), limite: '300' });
  if (service) q.set('service', service);
  if (niveau) q.set('niveau', niveau);
  if (texteApplique) q.set('texte', texteApplique);
  const etat = useDonnees<LigneJournal[]>(`/journaux?${q}`, direct ? 10_000 : 0);

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
      </Carte>

      <Carte titre="Journaux" sousTitre={etat.donnees ? `${etat.donnees.length} lignes · ${compte('error')} erreur(s) · ${compte('warn')} avertissement(s)` : 'Lecture…'}>
        {etat.erreur ? (
          <Erreur message={etat.erreur} />
        ) : !etat.donnees ? (
          <Squelette hauteur={400} />
        ) : etat.donnees.length ? (
          <div className="journal">
            {etat.donnees.map((l, i) => (
              <div className="journal-ligne" key={`${l.t}-${i}`}>
                <time>{new Date(l.t).toLocaleTimeString('fr-FR')}</time>
                <span className="svc">{l.service}</span>
                <span className={`niv niv-${l.niveau}`}>{l.niveau.toUpperCase()}</span>
                <span className="msg">{l.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <Vide icone={<ScrollText size={28} />}>Aucune ligne ne correspond à ces filtres.</Vide>
        )}
      </Carte>
    </div>
  );
}
