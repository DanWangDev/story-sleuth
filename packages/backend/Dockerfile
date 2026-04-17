# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS builder

WORKDIR /app

COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY package.json package-lock.json .npmrc ./

# NODE_AUTH_TOKEN is consumed via a BuildKit secret mount rather than a
# build-arg so the token never lands in image layers or build metadata.
# The mount exposes the value at /run/secrets/node_auth_token for the
# duration of this RUN only.
RUN --mount=type=secret,id=node_auth_token \
    NODE_AUTH_TOKEN=$(cat /run/secrets/node_auth_token 2>/dev/null || echo "") \
    npm ci --workspace=packages/backend --workspace=packages/shared --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/

RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

FROM node:22-alpine

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/package.json ./
COPY --from=builder /app/node_modules ./node_modules
# Passage manifests travel with the image so the admin ingest pipeline
# can load them at runtime. CONTENT_PATH defaults to this location.
COPY content/passages/ ./content/passages/

ENV NODE_ENV=production
ENV PORT=5060
ENV CONTENT_PATH=/app/content/passages

USER app
EXPOSE 5060

CMD ["node", "dist/index.js"]
