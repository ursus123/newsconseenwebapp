#!/bin/bash
# ==============================================================
# Superset init script — runs on every container start
# Creates admin user on first boot, then starts the server.
# ==============================================================

set -e

ADMIN_USERNAME="${SUPERSET_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${SUPERSET_ADMIN_PASSWORD:-admin}"
ADMIN_EMAIL="${SUPERSET_ADMIN_EMAIL:-admin@newsconseen.com}"
ADMIN_FIRSTNAME="${SUPERSET_ADMIN_FIRSTNAME:-Newsconseen}"
ADMIN_LASTNAME="${SUPERSET_ADMIN_LASTNAME:-Admin}"

echo "==> Upgrading Superset metadata DB..."
superset db upgrade

echo "==> Creating admin user (idempotent)..."
superset fab create-admin \
    --username  "$ADMIN_USERNAME" \
    --firstname "$ADMIN_FIRSTNAME" \
    --lastname  "$ADMIN_LASTNAME" \
    --email     "$ADMIN_EMAIL" \
    --password  "$ADMIN_PASSWORD" 2>/dev/null || echo "(admin already exists — skipping)"

echo "==> Initialising Superset roles..."
superset init

echo "==> Starting Superset web server..."
exec gunicorn \
    --bind        "0.0.0.0:${PORT:-8088}" \
    --workers     4 \
    --worker-class gevent \
    --timeout     120 \
    --limit-request-line 0 \
    --limit-request-field_size 0 \
    "superset.app:create_app()"
