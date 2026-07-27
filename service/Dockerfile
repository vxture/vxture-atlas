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
RUN pnpm --filter @vxture/service-model-platform run db:generate
RUN pnpm --filter @vxture/service-model-platform run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/service/dist ./dist
COPY --from=build /app/service/src/generated ./src/generated
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3100
CMD ["node", "dist/main.cjs"]
