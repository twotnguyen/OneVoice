# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: Apache-2.0

FROM node:24.13.0-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm build \
  && pnpm build:worker \
  && find /app/.next/standalone -type f -name '.env*' -delete

FROM node:24.13.0-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV ONEVOICE_MEDIA_ROOT="/app/renders"
ENV FFMPEG_PATH="ffmpeg"
ENV FFPROBE_PATH="ffprobe"
ENV ONEVOICE_FONT_PATH="/usr/share/fonts/dejavu/DejaVuSans.ttf"
WORKDIR /app

RUN apk add --no-cache ffmpeg font-dejavu \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/renders \
  && chown nextjs:nodejs /app/renders

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]

FROM node:24.13.0-alpine AS worker
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV ONEVOICE_MEDIA_ROOT="/app/renders"
ENV ONEVOICE_QUEUE_ROOT="/app/renders/queue"
ENV ONEVOICE_TEMPLATES_ROOT="/app/templates"
ENV ONEVOICE_AUDIO_ROOT="/app/assets/audio"
ENV ONEVOICE_TTS_ENDPOINT="http://tts:8123"
ENV FFMPEG_PATH="ffmpeg"
ENV FFPROBE_PATH="ffprobe"
ENV ONEVOICE_FONT_PATH="/usr/share/fonts/dejavu/DejaVuSans.ttf"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV HYPERFRAMES_BROWSER_PATH="/usr/bin/chromium-browser"
ENV ONEVOICE_HYPERFRAMES_PATH="/usr/local/bin/hyperframes"
ENV HYPERFRAMES_NO_TELEMETRY=1
ENV HYPERFRAMES_NO_UPDATE_CHECK=1
ENV HYPERFRAMES_NO_AUTO_INSTALL=1
WORKDIR /app

RUN apk add --no-cache ffmpeg font-dejavu chromium nss freetype harfbuzz ttf-freefont \
  && npm install -g hyperframes@0.6.94 \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/renders/queue /app/templates /app/assets/audio \
  && chown -R nextjs:nodejs /app/renders

COPY --from=builder /app/dist/worker.js ./dist/worker.js
COPY --chown=nextjs:nodejs src/lib/video/template-pipeline/templates /app/templates
COPY --chown=nextjs:nodejs assets/audio /app/assets/audio

USER nextjs
CMD ["node", "dist/worker.js"]
