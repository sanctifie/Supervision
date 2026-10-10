/** Appels à l'API de supervision. Une réponse 401 renvoie vers la connexion. */

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message);
  }
}

let surDeconnexion: (() => void) | null = null;
export function quandDeconnecte(f: () => void) {
  surDeconnexion = f;
}

export async function appeler<T>(chemin: string, options: { methode?: string; corps?: unknown } = {}): Promise<T> {
  const reponse = await fetch(`/api${chemin}`, {
    method: options.methode ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(options.corps !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.corps !== undefined ? JSON.stringify(options.corps) : undefined,
  });
  const texte = await reponse.text();
  const donnees = texte ? JSON.parse(texte) : null;
  if (!reponse.ok) {
    if (reponse.status === 401 && !['/connexion', '/installation', '/secours'].includes(chemin)) surDeconnexion?.();
    throw new ErreurApi(donnees?.erreur ?? `Erreur ${reponse.status}`, reponse.status);
  }
  return donnees as T;
}
