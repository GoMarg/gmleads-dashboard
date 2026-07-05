FROM node:20-alpine AS shared-build
WORKDIR /repo/gmleads-shared
COPY gmleads-shared/package*.json ./
RUN npm ci --ignore-scripts
COPY gmleads-shared .
RUN npm run build

FROM node:20-alpine AS builder
WORKDIR /repo/gmleads-dashboard
COPY --from=shared-build /repo/gmleads-shared /repo/gmleads-shared
COPY gmleads-dashboard/package*.json ./
RUN npm ci --ignore-scripts
COPY gmleads-dashboard .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /repo/gmleads-dashboard
ENV NODE_ENV=production
COPY --from=shared-build /repo/gmleads-shared /repo/gmleads-shared
COPY gmleads-dashboard/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /repo/gmleads-dashboard/dist ./dist
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3006/health || exit 1
CMD ["node", "dist/server.js"]
