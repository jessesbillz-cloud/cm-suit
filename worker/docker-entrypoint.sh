#!/bin/sh
# Start clamd, keep signatures fresh, then run the worker as the unprivileged `node` user.
set -eu

mkdir -p /run/clamav
chown clamav:clamav /run/clamav

# Optional scratch volume for large downloads (see fly.toml [mounts]).
if [ -n "${WORKER_TMP_DIR:-}" ]; then
  mkdir -p "$WORKER_TMP_DIR"
  chown node:node "$WORKER_TMP_DIR"
fi

if ! ls /var/lib/clamav/*.cvd /var/lib/clamav/*.cld >/dev/null 2>&1; then
  echo "no ClamAV signatures in the image; running freshclam" >&2
  freshclam --stdout
fi

clamd

tries=0
until [ -S /run/clamav/clamd.ctl ]; do
  tries=$((tries + 1))
  if [ "$tries" -gt 180 ]; then
    echo "clamd did not open its socket within 180s; refusing to start the worker" >&2
    exit 1
  fi
  sleep 1
done
echo "clamd is up"

# Refresh signatures every 6 hours; clamd reloads them on its own SelfCheck.
(
  while true; do
    sleep 21600
    freshclam --stdout --quiet || echo "freshclam update failed; keeping current signatures" >&2
  done
) &

exec setpriv --reuid=node --regid=node --init-groups node /app/dist/index.js
