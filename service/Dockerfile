# Atlas service image - standalone build context (this repo only).
# Unlike vxture-platform's shared deploy/docker/Dockerfile.nestjs-prisma, this
# Dockerfile does NOT assume a monorepo: build context is this repo's root,
# and the only workspace package is `service` itself (see pnpm-workspace.yaml).

FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY service/package.json ./service/package.json
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token 2>/dev/null || true)" \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY service ./service
RUN pnpm --filter @atlas/service run db:generate
RUN pnpm --filter @atlas/service run build

FROM base AS runtime
ENV NODE_ENV=production

# Build provenance (standard 025 section 4.1). build.yml already passes these
# four as build-args; without the ARG declarations here Docker silently drops
# them and the health identity block falls back to dev/unknown - which is
# exactly the "nobody knows which build is live" failure mode standard 025
# exists to prevent. Defaults stay honest so a plain `docker build` still works.
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG DEPLOY_STAGE=dev
ENV APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA} \
    BUILD_TIME=${BUILD_TIME} \
    DEPLOY_STAGE=${DEPLOY_STAGE}
# docker-compose.yml's healthcheck runs wget against /healthz -
# node:22-slim doesn't ship it, and without it the healthcheck command itself
# fails (exec: wget not found), marking the container unhealthy regardless of
# whether the app is actually up.
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/service/dist ./dist
COPY --from=build /app/service/src/generated ./src/generated
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3100
CMD ["node", "dist/main.cjs"]
