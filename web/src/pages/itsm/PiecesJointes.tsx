import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as IconeImage, Paperclip, Trash2, Upload } from 'lucide-react';
import { Carte } from '../../components/ui';
import { dateHeure, octets } from '../../../../shared/format';
import type { PieceJointe, Ticket } from '../../../../shared/itsm';

const TAILLE_MAX = 10 * 1024 * 1024;

/** Envoie un fichier ; renvoie la fiche à jour (ou lève l'erreur du serveur). */
async function envoyer<T>(numero: string, fichier: File): Promise<T> {
  const r = await fetch(`/api/tickets/${encodeURIComponent(numero)}/pieces`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': fichier.type || 'application/octet-stream', 'x-nom-fichier': encodeURIComponent(fichier.name) },
    body: fichier,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erreur ?? `Erreur ${r.status}`);
  return d as T;
}

/**
 * Pièces jointes du ticket : glisser-déposer, choix de fichiers, ou coller une
 * capture d'écran (Ctrl+V) n'importe où sur la fiche.
 */
export function CartePiecesJointes<T>({
  t,
  peutJoindre,
  peutRetirer,
  apres,
}: {
  t: Ticket;
  peutJoindre: boolean;
  peutRetirer: (p: PieceJointe) => boolean;
  apres: (d: T) => void;
}) {
  const [survol, setSurvol] = useState(false);
  const [enCours, setEnCours] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const pieces = t.piecesJointes ?? [];

  const joindre = async (fichiers: File[]) => {
    setErreur(null);
    for (const f of fichiers) {
      if (f.size > TAILLE_MAX) {
        setErreur(`${f.name} : trop gros (10 Mo au plus)`);
        continue;
      }
      setEnCours((n) => n + 1);
      try {
        apres(await envoyer<T>(t.numero, f));
      } catch (e) {
        setErreur(`${f.name} : ${(e as Error).message}`);
      } finally {
        setEnCours((n) => n - 1);
      }
    }
  };

  // Coller une capture d'écran.
  useEffect(() => {
    if (!peutJoindre) return;
    const coller = (e: ClipboardEvent) => {
      const fichiers = [...(e.clipboardData?.files ?? [])];
      if (!fichiers.length) return;
      e.preventDefault();
      const horodatage = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      void joindre(fichiers.map((f) => (f.name === 'image.png' ? new File([f], `capture-${horodatage}.png`, { type: f.type }) : f)));
    };
    document.addEventListener('paste', coller);
    return () => document.removeEventListener('paste', coller);
  });

  return (
    <Carte titre={`Pièces jointes (${pieces.length})`}>
      {pieces.map((p) => (
        <div key={p.id} className="ligne-flex lien-ligne">
          {p.type.startsWith('image/') ? <IconeImage size={15} color="#2f5bea" /> : <FileText size={15} color="#2f5bea" />}
          <a className="lien-titre" href={`/api/tickets/${t.numero}/pieces/${p.id}`} target="_blank" rel="noreferrer" title={`${p.nom} — ${p.par}, ${dateHeure(p.le)}`}>
            {p.nom}
          </a>
          <span className="discret" style={{ whiteSpace: 'nowrap' }}>
            {octets(p.taille)}
          </span>
          <a className="bouton petit" href={`/api/tickets/${t.numero}/pieces/${p.id}?telecharger`} title="Télécharger" aria-label={`Télécharger ${p.nom}`}>
            <Download size={12} />
          </a>
          {peutRetirer(p) && (
            <button
              className="bouton petit"
              title="Retirer"
              aria-label={`Retirer ${p.nom}`}
              onClick={async () => {
                if (!confirm(`Retirer ${p.nom} ?`)) return;
                const r = await fetch(`/api/tickets/${t.numero}/pieces/${p.id}`, { method: 'DELETE', credentials: 'same-origin' });
                const d = await r.json();
                if (r.ok) apres(d as T);
                else setErreur(d.erreur);
              }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      {peutJoindre && (
        <div
          className={`depot ${survol ? 'survol' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            void joindre([...e.dataTransfer.files]);
          }}
          onClick={() => champ.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && champ.current?.click()}
        >
          {enCours ? <Upload size={16} /> : <Paperclip size={16} />}
          <span>{enCours ? 'Envoi…' : 'Déposer un fichier, cliquer, ou coller une capture (Ctrl+V)'}</span>
          <small>10 Mo au plus</small>
          <input
            ref={champ}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void joindre([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {erreur && (
        <div className="erreur" style={{ marginTop: 10 }}>
          {erreur}
        </div>
      )}
    </Carte>
  );
}
