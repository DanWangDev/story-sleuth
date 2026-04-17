FROM node:22-alpine AS builder

WORKDIR /app

COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
COPY package.json package-lock.json .npmrc ./

ARG NODE_AUTH_TOKEN
RUN NODE_AUTH_TOKEN=${NODE_AUTH_TOKEN} npm ci --workspace=packages/shared --workspace=packages/frontend --include-workspace-root

COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/

RUN npm run build -w packages/shared

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

ARG VITE_HUB_URL=https://hub.labf.app
ENV VITE_HUB_URL=${VITE_HUB_URL}

RUN npm run build -w packages/frontend

FROM nginx:alpine

COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
