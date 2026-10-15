#!/bin/bash
set -eu

SRC="/var/www/intranet/soporte"
DEST="/var/respaldos"
KEEP=14
STAMP="$(date +%Y%m%d-%H%M)"
ENV_FILE="${SRC}/.env"

mkdir -p "${DEST}"
chown root:akper "${DEST}"
chmod 750 "${DEST}"

tar --exclude='node_modules' --exclude='*/node_modules' \
  -czf "${DEST}/soporte-${STAMP}.tgz" \
  -C /var/www/intranet soporte

if [ -f "${ENV_FILE}" ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
    export PGDATABASE=""
    pg_dump --no-owner --no-acl "${DATABASE_URL}" | gzip > "${DEST}/soporte-db-${STAMP}.sql.gz"
  fi
fi

# Conservar exactamente KEEP copias más nuevas de cada tipo (no -mtime).
keep_n() {
  local pattern="$1"
  local extra
  extra="$(ls -1t ${DEST}/${pattern} 2>/dev/null | tail -n +$((KEEP + 1)) || true)"
  if [ -n "${extra}" ]; then
    printf '%s\n' "${extra}" | xargs -r rm -f
  fi
}
keep_n 'soporte-*.tgz'
keep_n 'soporte-db-*.sql.gz'

chown root:akper "${DEST}"
chmod 750 "${DEST}"
find "${DEST}" -maxdepth 1 -type f \( -name 'soporte-*.tgz' -o -name 'soporte-db-*.sql.gz' \) \
  -exec chown root:akper {} \; -exec chmod 640 {} \;

echo "OK ${STAMP}"
