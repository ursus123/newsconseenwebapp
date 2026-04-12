# ==============================================================
# Newsconseen — Apache Superset on Railway
# ==============================================================
# Based on the official apache/superset image.
# Adds superset_config.py with:
#   - EMBEDDED_SUPERSET feature flag enabled
#   - CORS configured for Newsconseen frontend
#   - Row Level Security enabled
#   - SECRET_KEY from Railway env var
#
# Deploy steps:
#   1. Push this directory to a GitHub repo (or sub-path)
#   2. Railway → New Service → Deploy from GitHub Repo
#   3. Set root directory to deploy/superset
#   4. Railway auto-detects this Dockerfile
#   5. Set environment variables listed in railway.env.example
# ==============================================================

FROM apache/superset:3.1.3

# Switch to root to install extras and copy config
USER root

# Install psycopg2 so Superset can connect to PostgreSQL
RUN pip install --no-cache-dir \
    psycopg2-binary \
    redis \
    gevent

# Copy Newsconseen superset config
COPY superset_config.py /app/pythonpath/superset_config.py

# Copy init script that creates admin user on first boot
COPY docker-init.sh /docker-init.sh
RUN chmod +x /docker-init.sh

USER superset

EXPOSE 8088

CMD ["/docker-init.sh"]
