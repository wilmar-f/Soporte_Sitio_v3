#!/bin/bash
set -eu
ROOT=/var/www/intranet/soporte
BACKEND="$ROOT/backend"
sed -i 's/\r$//' "$ROOT/deploy/diagnostico.service" "$ROOT/deploy/nginx-diagnostico.conf"
install -m 644 "$ROOT/deploy/diagnostico.service" /etc/systemd/system/diagnostico.service
NODEBIN="$(command -v node)"
printf '%s\n' "[Unit]" "Description=Diagnostico soporte en sitio" "After=network.target" "" "[Service]" "Type=simple" "User=www-data" "WorkingDirectory=${BACKEND}" "EnvironmentFile=${ROOT}/.env" "ExecStart=${NODEBIN} ${BACKEND}/server.js" "Restart=on-failure" "RestartSec=5" "" "[Install]" "WantedBy=multi-user.target" > /etc/systemd/system/diagnostico.service
install -m 644 "$ROOT/deploy/nginx-diagnostico.conf" /etc/nginx/sites-available/diagnostico
ln -sf /etc/nginx/sites-available/diagnostico /etc/nginx/sites-enabled/diagnostico
rm -f /etc/nginx/sites-enabled/default
chown -R www-data:www-data "$ROOT"
chmod 600 "$ROOT/.env"
nginx -t
systemctl daemon-reload
systemctl enable diagnostico
systemctl restart diagnostico
systemctl reload nginx
systemctl is-active diagnostico
systemctl is-active nginx
curl -sI http://127.0.0.1 | head -20
