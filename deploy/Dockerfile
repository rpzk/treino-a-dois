# Treino a Dois — Hostinger VPS (Node 22 + standalone Next.js + SQLite)
FROM node:22.23-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
# Docker workspace (allowBuilds + dangerouslyAllowAllBuilds); not the Sites storeDir policy file.
COPY package.json pnpm-lock.yaml .npmrc ./
COPY deploy/pnpm-workspace.docker.yaml ./pnpm-workspace.yaml
RUN pnpm install --frozen-lockfile --prod=false

FROM node:22.23-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure builder also sees Docker workspace if any install/rebuild runs
COPY deploy/pnpm-workspace.docker.yaml ./pnpm-workspace.yaml
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

FROM node:22.23-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SQLITE_PATH=/app/data/training.sqlite

RUN mkdir -p /app/data && chown -R node:node /app
USER node

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]
