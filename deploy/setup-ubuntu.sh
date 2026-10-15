#!/bin/bash
# Run on the Ubuntu server: sudo bash deploy/setup-ubuntu.sh
set -eu

ROOT=/var/www/intranet/soporte
BACKEND="$ROOT/backend"

if [ "$(id -u)" -ne 0 ]; then
  echo "Usa: sudo bash $0"
  exit 1
fi

if [ ! -d "$BACKEND" ]; then
  echo "No esta $BACKEND"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx build-essential ca-certificates curl

if ! command -v node >/dev/null 2>&1; then
  apt-get install -y nodejs npm
fi

echo "node=$(command -v node || true) $(node -v 2>/dev/null || echo none)"

CHROMA_PKGS="fonts-liberation libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils"
if apt-cache show libasound2t64 >/dev/null 2>&1; then
  apt-get install -y $CHROMA_PKGS libasound2t64
else
  apt-get install -y $CHROMA_PKGS libasound2 || apt-get install -y $CHROMA_PKGS
fi

if [ ! -f "$ROOT/.env" ]; then
  echo "Falta $ROOT/.env — crealo antes de continuar"
  exit 2
fi

mkdir -p "$BACKEND/data"
cd "$BACKEND"
npm install --omit=dev

install -m 644 "$ROOT/deploy/diagnostico.service" /etc/systemd/system/diagnostico.service
if [ -x /usr/local/bin/node ] && [ ! -x /usr/bin/node ]; then
  sed -i 's|/usr/bin/node|/usr/local/bin/node|' /etc/systemd/system/diagnostico.service
fi
if command -v node >/dev/null 2>&1; then
  NODEBIN=$(command -v node)
  sed -i "s|ExecStart=.*|ExecStart=${NODEBIN} ${BACKEND}/server.js|" /etc/systemd/system/diagnostico.service
fi

install -m 644 "$ROOT/deploy/nginx-diagnostico.conf" /etc/nginx/sites-available/diagnostico
ln -sf /etc/nginx/sites-available/diagnostico /etc/nginx/sites-enabled/diagnostico
rm -f /etc/nginx/sites-enabled/default

chown -R www-data:www-data "$ROOT"
chmod 600 "$ROOT/.env"

nginx -t
systemctl daemon-reload
systemctl enable --now diagnostico
systemctl reload nginx

echo "OK http://10.53.1.235"
systemctl --no-pager --full status diagnostico || true
