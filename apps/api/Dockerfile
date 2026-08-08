FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY prisma ./prisma
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN pnpm --filter @new-project/api prisma:generate
RUN pnpm --filter @new-project/api build

FROM node:22-alpine AS runtime
WORKDIR /app/apps/api
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
# Keep workspace symlinks and runtime packages such as reflect-metadata intact.
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/prisma /app/prisma
EXPOSE 4000
CMD ["sh", "-c", "if [ \"${RUN_MIGRATIONS:-false}\" = \"true\" ]; then /app/node_modules/.bin/prisma migrate deploy --schema /app/prisma/schema.prisma; fi; exec node dist/main.js"]
