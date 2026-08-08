# ============================================================
# Base Image — slim but with build tools for GeoPandas/Shapely
# ============================================================
FROM python:3.11-slim

# ------------------------------------------------------------
# System dependencies (GeoPandas, Shapely, GDAL, PROJ)
# ------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gdal-bin \
    libgdal-dev \
    libproj-dev \
    proj-data \
    proj-bin \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------
# Set working directory
# ------------------------------------------------------------
WORKDIR /app

# ------------------------------------------------------------
# Copy project files
# ------------------------------------------------------------
COPY . /app

# ------------------------------------------------------------
# Install Python dependencies
# ------------------------------------------------------------
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# ------------------------------------------------------------
# Expose FastAPI port
# ------------------------------------------------------------
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD curl --fail http://127.0.0.1:${PORT:-8000}/health || exit 1

# ------------------------------------------------------------
# Start FastAPI (Uvicorn)
# ------------------------------------------------------------
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
