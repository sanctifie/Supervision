import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config';

/**
 * Les canaux d'envoi externes : Telegram (API Bot) et e-mail (SMTP).
 * Un canal non configuré est simplement ignoré ; un échec est remonté à
 * l'appelant (journal du serveur, test depuis le profil) sans bloquer.
 */

export interface Canaux {
  telegramActif(): boolean;
  emailActif(): boolean;
  telegram(chatId: string, texte: string): Promise<void>;
  email(destinataire: string, sujet: string, texte: string): Promise<void>;
}

/** Échappe le texte pour le mode HTML de Telegram. */
export function echapperHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function canauxReels(): Canaux {
  let transport: Transporter | null = null;
  const smtp = () => {
    if (!transport) {
      const [hote, port] = config.smtpHote.split(':');
      const p = Number(port) || 587;
      transport = nodemailer.createTransport({
        host: hote,
        port: p,
        secure: p === 465,
        auth: config.smtpUtilisateur ? { user: config.smtpUtilisateur, pass: config.smtpMotDePasse } : undefined,
        connectionTimeout: 10_000,
      });
    }
    return transport;
  };

  return {
    telegramActif: () => !!config.telegramJeton,
    emailActif: () => !!config.smtpHote && !!config.smtpExpediteur,

    async telegram(chatId, texte) {
      const controle = new AbortController();
      const minuterie = setTimeout(() => controle.abort(), 10_000);
      try {
        const r = await fetch(`https://api.telegram.org/bot${config.telegramJeton}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: texte, parse_mode: 'HTML', disable_web_page_preview: true }),
          signal: controle.signal,
        });
        if (!r.ok) {
          const corps = (await r.json().catch(() => ({}))) as { description?: string };
          throw new Error(`Telegram : ${corps.description ?? r.statusText}`);
        }
      } finally {
        clearTimeout(minuterie);
      }
    },

    async email(destinataire, sujet, texte) {
      await smtp().sendMail({ from: config.smtpExpediteur, to: destinataire, subject: sujet, text: texte });
    },
  };
}
