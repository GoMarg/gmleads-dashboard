FROM node:24-alpine AS shared-build
WORKDIR /repo/gmleads-shared
COPY gmleads-shared/package*.json ./
RUN npm ci --ignore-scripts
COPY gmleads-shared .
RUN npm run build

FROM node:24-alpine AS builder
WORKDIR /repo/gmleads-dashboard
COPY --from=shared-build /repo/gmleads-shared /repo/gmleads-shared
COPY gmleads-dashboard/package*.json ./
RUN npm ci --ignore-scripts
COPY gmleads-dashboard .
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /repo/gmleads-dashboard
ENV NODE_ENV=production
COPY --from=shared-build --chown=node:node /repo/gmleads-shared /repo/gmleads-shared
COPY --chown=node:node gmleads-dashboard/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder --chown=node:node /repo/gmleads-dashboard/dist ./dist
# M5.1: run as the non-root `node` user (uid 1000) the base image already
# ships, instead of root. --chown on each COPY (not a separate RUN
# chown -R) avoids doubling image size via overlay2 copy-on-write —
# verified: RUN chown -R produced 1.3GB vs a 757MB baseline; --chown on
# COPY is identical to baseline. No directory here needs to stay
# writable — CSV upload (@fastify/multipart) buffers entirely in memory
# via file.toBuffer(), never touching disk; the analytics cron scheduler
# holds no on-disk state either.
USER node
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:${PORT:-3006}/health || exit 1
CMD ["node", "dist/server.js"]
