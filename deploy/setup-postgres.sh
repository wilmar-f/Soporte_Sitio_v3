#!/bin/bash
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql

PASS="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 28)"
echo "${PASS}" > /root/diagnostico-db.pass
chmod 600 /root/diagnostico-db.pass

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'diagnostico_app') THEN
    CREATE ROLE diagnostico_app LOGIN PASSWORD '${PASS}';
  ELSE
    ALTER ROLE diagnostico_app PASSWORD '${PASS}';
  END IF;
END
\$\$;
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = 'diagnostico'" | grep -q 1 || \
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE diagnostico OWNER diagnostico_app"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d diagnostico -c "GRANT ALL ON SCHEMA public TO diagnostico_app"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "GRANT ALL PRIVILEGES ON DATABASE diagnostico TO diagnostico_app"

PGCONF="$(sudo -u postgres psql -tAc 'SHOW config_file')"
HBA="$(sudo -u postgres psql -tAc 'SHOW hba_file')"
sed -i "s/^#\\?listen_addresses.*/listen_addresses = '*'/" "${PGCONF}"
if ! grep -q 'diagnostico_app' "${HBA}"; then
  printf '\nhost    diagnostico    diagnostico_app    127.0.0.1/32    scram-sha-256\nhost    diagnostico    diagnostico_app    ::1/128         scram-sha-256\nhost    diagnostico    diagnostico_app    10.53.0.0/16    scram-sha-256\n' >> "${HBA}"
fi
systemctl reload postgresql || systemctl restart postgresql

ENVF="/var/www/intranet/soporte/.env"
URL="postgresql://diagnostico_app:${PASS}@127.0.0.1:5432/diagnostico"
if grep -q '^DATABASE_URL=' "${ENVF}"; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${URL}|" "${ENVF}"
else
  printf '\nDATABASE_URL=%s\n' "${URL}" >> "${ENVF}"
fi
chmod 600 "${ENVF}"
chown www-data:www-data "${ENVF}"

echo PG_SETUP_OK
