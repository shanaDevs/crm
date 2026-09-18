# syntax=docker/dockerfile:1
# Build:
#   docker build -t crmtool-frontend \
#     --build-arg NEXT_PUBLIC_API_URL=https://crm-server.dartcodes.cloud \
#     ./frontend
#
# Run (runtime override, preferred on CapRover):
#   docker run -e NEXT_PUBLIC_API_URL=https://crm-server.dartcodes.cloud -p 3000:3000 crmtool-frontend

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:20-alpine AS build
WORKDIR /app
# Build-time fallback only; CapRover should set NEXT_PUBLIC_API_URL / API_URL at runtime.
ARG NEXT_PUBLIC_API_URL=https://crm-server.dartcodes.cloud
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Default for CapRover if not overridden
ENV NEXT_PUBLIC_API_URL=https://crm-server.dartcodes.cloud
RUN apk add --no-cache wget \
  && addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
