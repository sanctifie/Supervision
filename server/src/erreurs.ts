/** Une règle métier refusée (→ HTTP 422, ou 404 si « introuvable »). */
export class ErreurMetier extends Error {}

/** Action interdite pour ce compte (→ HTTP 403). */
export class ErreurDroits extends Error {}
