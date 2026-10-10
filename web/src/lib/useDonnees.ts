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
  const enCours = useRef(false);

  const recharger = useCallback(async () => {
    if (!chemin || enCours.current) return;
    enCours.current = true;
    try {
      const r = await appeler<T>(chemin);
      setDonnees(r);
      setErreur(null);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      enCours.current = false;
      setChargement(false);
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
