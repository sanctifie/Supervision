import { useCallback, useEffect, useRef, useState } from 'react';
import { appeler } from './api';

/**
 * Lit une adresse de l'API et la relit toutes les `intervalleMs` (15 s par
 * défaut), en pause quand l'onglet est caché.
 */
export function useDonnees<T>(chemin: string | null, intervalleMs = 15_000) {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  /** L'adresse en cours de lecture : une réponse d'une ancienne adresse (filtre changé entre-temps) est ignorée. */
  const enCours = useRef<string | null>(null);

  const recharger = useCallback(async () => {
    if (!chemin || enCours.current === chemin) return;
    enCours.current = chemin;
    try {
      const r = await appeler<T>(chemin);
      if (enCours.current !== chemin) return;
      setDonnees(r);
      setErreur(null);
    } catch (e) {
      if (enCours.current === chemin) setErreur((e as Error).message);
    } finally {
      if (enCours.current === chemin) {
        enCours.current = null;
        setChargement(false);
      }
    }
  }, [chemin]);

  useEffect(() => {
    setChargement(true);
    void recharger();
    if (!intervalleMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void recharger();
    }, intervalleMs);
    return () => clearInterval(id);
  }, [recharger, intervalleMs]);

  /** Remplace les données sans relire (réponse d'une action). */
  const remplacer = useCallback((d: T) => setDonnees(d), []);

  return { donnees, erreur, chargement, recharger, remplacer };
}
