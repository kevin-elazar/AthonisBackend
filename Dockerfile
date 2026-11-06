# syntax=docker/dockerfile:1.7
# Imagem da API do Athonis (NestJS). Build em duas etapas: a primeira compila
# o TypeScript, a segunda leva só o JavaScript e as dependências de produção.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    UPLOADS_DIR=/app/importacoes
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY scripts ./scripts
RUN mkdir -p /app/importacoes && chown -R node:node /app
USER node

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
LABEL org.opencontainers.image.source="https://github.com/kevin-elazar/AthonisBackend" \
      org.opencontainers.image.description="Athonis API (NestJS)" \
      org.opencontainers.image.licenses="MIT"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# As migrations rodam no boot (migrationsRun), antes de a API aceitar conexões.
CMD ["node", "dist/main.js"]
