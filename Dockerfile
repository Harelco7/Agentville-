# One container runs the whole town: the simulation server, which also serves the built 3D client.
FROM node:22-slim
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production \
    PORT=8787 \
    CLIENT_DIST=/app/apps/client/dist \
    DATA_DIR=/data
EXPOSE 8787
WORKDIR /app/apps/server
CMD ["pnpm", "start"]
