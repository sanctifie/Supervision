import type { ReactNode } from 'react';

/**
 * Un Markdown simple, rendu en éléments React (jamais en HTML brut) :
 * titres (#, ##, ###), listes (- et 1.), blocs de code (```), code en ligne,
 * gras (**…**), liens [texte](https://… ou /…).
 */

function enLigne(texte: string, cle: string): ReactNode[] {
  const morceaux: ReactNode[] = [];
  const motif = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))/g;
  let dernier = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = motif.exec(texte))) {
    if (m.index > dernier) morceaux.push(texte.slice(dernier, m.index));
    const brut = m[0];
    const k = `${cle}-${i++}`;
    if (brut.startsWith('`')) morceaux.push(<code key={k}>{brut.slice(1, -1)}</code>);
    else if (brut.startsWith('**')) morceaux.push(<strong key={k}>{brut.slice(2, -2)}</strong>);
    else {
      const [, libelle, url] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(brut) ?? [];
      const sur = /^(https?:\/\/|\/)/.test(url ?? '');
      morceaux.push(
        sur ? (
          <a key={k} href={url} target={url.startsWith('/') ? undefined : '_blank'} rel="noreferrer">
            {libelle}
          </a>
        ) : (
          libelle
        ),
      );
    }
    dernier = m.index + brut.length;
  }
  if (dernier < texte.length) morceaux.push(texte.slice(dernier));
  return morceaux;
}

export function Markdown({ texte }: { texte: string }) {
  const lignes = texte.replace(/\r/g, '').split('\n');
  const blocs: ReactNode[] = [];
  let i = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (l.startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lignes.length && !lignes[i].startsWith('```')) code.push(lignes[i++]);
      i++;
      blocs.push(<pre key={i}>{code.join('\n')}</pre>);
      continue;
    }
    const titre = /^(#{1,3})\s+(.*)$/.exec(l);
    if (titre) {
      const niveau = titre[1].length;
      const contenu = enLigne(titre[2], `t${i}`);
      blocs.push(niveau === 1 ? <h2 key={i}>{contenu}</h2> : niveau === 2 ? <h3 key={i}>{contenu}</h3> : <h4 key={i}>{contenu}</h4>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      const ordonnee = /^\s*\d+[.)]\s+/.test(l);
      const items: ReactNode[] = [];
      while (i < lignes.length && (ordonnee ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/).test(lignes[i])) {
        const brut = lignes[i].replace(ordonnee ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, '');
        const case_ = /^\[( |x)\]\s+/i.exec(brut);
        items.push(
          <li key={i}>
            {case_ && <input type="checkbox" checked={case_[1].toLowerCase() === 'x'} readOnly />} {enLigne(case_ ? brut.slice(case_[0].length) : brut, `l${i}`)}
          </li>,
        );
        i++;
      }
      blocs.push(ordonnee ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const paragraphe: string[] = [];
    while (i < lignes.length && lignes[i].trim() && !/^(#{1,3}\s|```|\s*[-*]\s+|\s*\d+[.)]\s+)/.test(lignes[i])) paragraphe.push(lignes[i++]);
    blocs.push(<p key={i}>{enLigne(paragraphe.join(' '), `p${i}`)}</p>);
  }
  return <div className="markdown">{blocs}</div>;
}
