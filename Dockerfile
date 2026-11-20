# Supervision Officina — image de production (Node 22, ~150 Mo).
FROM node:22-alpine AS construction
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DOSSIER_DONNEES=/donnees DOSSIER_SCRIPTS=/app/scripts
# Pour les tâches (scripts/) : bash et le client Docker. Sans socket monté, ils ne peuvent rien faire.
RUN apk add --no-cache bash docker-cli
WORKDIR /app
COPY --from=construction /app/node_modules ./node_modules
COPY --from=construction /app/dist ./dist
COPY package.json ./
COPY scripts ./scripts
RUN mkdir -p /donnees && chown node:node /donnees
USER node
EXPOSE 8080
VOLUME /donnees
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "dist/server/index.js"]
