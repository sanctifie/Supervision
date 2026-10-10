import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config';
import { Stockage } from './stockage';
import { Supervision } from './supervision';
import { creerApi } from './api';
import { accesActif, purgerSessions } from './acces';

/**
 * Point d'entrée : l'API (/api) et l'interface (fichiers construits par Vite).
 */
const ici = path.dirname(fileURLToPath(import.meta.url));

const stockage = new Stockage(config.dossierDonnees);
const sup = new Supervision(stockage);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(express.json({ limit: '100kb' }));

app.use((_req, res, suivant) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  );
  suivant();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, mode: sup.mode });
});

app.use('/api', creerApi(sup));

// L'interface construite (npm run build). En développement, Vite la sert.
const candidats = [path.resolve(ici, '../web'), path.resolve(process.cwd(), 'dist/web')];
const dossierWeb = candidats.find((d) => fs.existsSync(path.join(d, 'index.html')));
if (dossierWeb) {
  app.use(express.static(dossierWeb, { index: false, maxAge: '1h' }));
  // Application monopage : toute autre adresse renvoie index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dossierWeb, 'index.html'));
  });
}

const serveur = app.listen(config.port, config.hote, () => {
  console.log(`[supervision] http://${config.hote}:${config.port} — mode ${config.mode}${accesActif() ? '' : ' — ATTENTION : aucun mot de passe (SUPERVISION_MOT_DE_PASSE)'}`);
  sup.demarrer();
});
setInterval(purgerSessions, 10 * 60_000).unref();

function arret() {
  sup.arreter();
  serveur.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', arret);
process.on('SIGINT', arret);
