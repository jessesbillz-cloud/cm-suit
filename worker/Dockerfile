# syntax=docker/dockerfile:1.7
# Worker image (SPEC §3): Node 22 + ClamAV + LibreOffice (headless) + poppler/ghostscript.
# Build context is the REPO ROOT (flyctl deploy --config worker/fly.toml, run from the root), so later phases can
# share code from src/lib/pdf. Paths below are relative to the root.

# ---- build: compile TypeScript ---------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY worker/package.json worker/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY worker/tsconfig.json ./
COPY worker/src ./src
# Unit tests run in CI (root vitest), not in the image.
RUN find src -name '*.test.ts' -delete && npm run build && npm prune --omit=dev

# ---- runtime ---------------------------------------------------------------------------------------------------
FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      clamav clamav-daemon clamav-freshclam \
      libreoffice-core libreoffice-calc libreoffice-writer \
      poppler-utils ghostscript fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
# Inter is nice to have for rendered PDFs; fall back to Liberation if the package is missing.
RUN apt-get update \
 && (apt-get install -y --no-install-recommends fonts-inter || echo "fonts-inter not available; using fonts-liberation only") \
 && rm -rf /var/lib/apt/lists/*

# clamd: limits at ClamAV's maximum, and alert (never pass) when a file exceeds them (SPEC §6.5).
RUN set -eu; conf=/etc/clamav/clamd.conf; test -f "$conf"; \
    for key in MaxFileSize MaxScanSize StreamMaxLength AlertExceedsMax LocalSocket LocalSocketGroup LocalSocketMode \
               FixStaleSocket Foreground ConcurrentDatabaseReload User; do sed -i "/^${key}[[:space:]]/d" "$conf"; done; \
    printf '%s\n' \
      'MaxFileSize 4000M' \
      'MaxScanSize 4000M' \
      'StreamMaxLength 4000M' \
      'AlertExceedsMax yes' \
      'LocalSocket /run/clamav/clamd.ctl' \
      'LocalSocketGroup clamav' \
      'LocalSocketMode 660' \
      'FixStaleSocket yes' \
      'Foreground no' \
      'ConcurrentDatabaseReload no' \
      'User clamav' >> "$conf"; \
    usermod -a -G clamav node

# Signatures at build time so a fresh machine can scan immediately. The entrypoint retries if this was rate-limited,
# and refuses to start without signatures.
RUN freshclam --stdout || echo "freshclam failed at build time; the entrypoint will fetch signatures"

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY worker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

ARG WORKER_VERSION=dev
ENV NODE_ENV=production \
    WORKER_VERSION=${WORKER_VERSION}

# The entrypoint starts as root (clamd, freshclam), then runs node as the unprivileged `node` user.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
