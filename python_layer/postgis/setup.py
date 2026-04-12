# ==============================================================
# PostGIS Setup
# ==============================================================
# Enables the PostGIS extension on Railway PostgreSQL and adds
# a geometry column to analytics.geospatial_summary.
#
# Railway PostgreSQL has PostGIS pre-installed — no extra config.
# Run POST /postgis/setup once after first deployment.
# ==============================================================

import logging
from sqlalchemy.engine import Engine
from sqlalchemy import text

logger = logging.getLogger(__name__)


def ensure_postgis(engine: Engine) -> dict:
    """
    Enable PostGIS extension and add geometry column to
    analytics.geospatial_summary.

    Safe to call multiple times — all statements are idempotent.

    Returns dict with status of each step.
    """
    results = {}

    with engine.connect() as conn:
        # ── Step 1: Enable PostGIS extension ──────────────────────
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            conn.commit()
            # Verify it loaded
            ver = conn.execute(text("SELECT PostGIS_Version();")).scalar()
            results["extension"] = "enabled"
            results["postgis_version"] = ver
            logger.info("PostGIS extension enabled — version %s", ver)
        except Exception as e:
            results["extension"] = f"error: {e}"
            logger.error("PostGIS: failed to enable extension — %s", e)
            return results

        # ── Step 2: Ensure analytics schema exists ─────────────────
        try:
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS analytics;"))
            conn.commit()
            results["schema"] = "ready"
        except Exception as e:
            results["schema"] = f"error: {e}"

        # ── Step 3: Add geom column to geospatial_summary ──────────
        # geography(Point, 4326) uses WGS84 (same as GPS/Google Maps).
        # geography type gives accurate metre-based distance calculations
        # anywhere on Earth without needing a local projection.
        try:
            conn.execute(text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'analytics'
                        AND table_name = 'geospatial_summary'
                    ) THEN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'analytics'
                            AND table_name = 'geospatial_summary'
                            AND column_name = 'geom'
                        ) THEN
                            ALTER TABLE analytics.geospatial_summary
                            ADD COLUMN geom geography(Point, 4326);
                        END IF;
                    END IF;
                END $$;
            """))
            conn.commit()
            results["geospatial_summary_geom_column"] = "ready"
            logger.info("PostGIS: geom column ready on analytics.geospatial_summary")
        except Exception as e:
            results["geospatial_summary_geom_column"] = f"error: {e}"
            logger.warning("PostGIS: geom column setup — %s", e)

        # ── Step 4: Backfill geom from existing lat/lng ────────────
        try:
            result = conn.execute(text("""
                UPDATE analytics.geospatial_summary
                SET geom = ST_SetSRID(
                    ST_MakePoint(longitude::float, latitude::float),
                    4326
                )::geography
                WHERE latitude IS NOT NULL
                  AND longitude IS NOT NULL
                  AND geom IS NULL;
            """))
            conn.commit()
            results["backfill_rows"] = result.rowcount
            logger.info("PostGIS: backfilled %d rows with geometry", result.rowcount)
        except Exception as e:
            results["backfill_rows"] = f"error: {e}"
            logger.warning("PostGIS: backfill — %s", e)

        # ── Step 5: Spatial index ──────────────────────────────────
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_geospatial_summary_geom
                ON analytics.geospatial_summary
                USING GIST (geom);
            """))
            conn.commit()
            results["spatial_index"] = "ready"
            logger.info("PostGIS: spatial index created")
        except Exception as e:
            results["spatial_index"] = f"error: {e}"
            logger.warning("PostGIS: spatial index — %s", e)

        # ── Step 6: Create geo_boundaries table for district overlays ─
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS analytics.geo_boundaries (
                    id              SERIAL PRIMARY KEY,
                    company_id      TEXT,
                    boundary_name   TEXT NOT NULL,
                    boundary_type   TEXT NOT NULL,  -- district | region | zone | catchment
                    properties      JSONB,
                    geom            geography(Polygon, 4326),
                    created_at      TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_geo_boundaries_geom
                ON analytics.geo_boundaries USING GIST (geom);
            """))
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_geo_boundaries_company
                ON analytics.geo_boundaries (company_id);
            """))
            conn.commit()
            results["geo_boundaries_table"] = "ready"
            logger.info("PostGIS: geo_boundaries table ready")
        except Exception as e:
            results["geo_boundaries_table"] = f"error: {e}"
            logger.warning("PostGIS: geo_boundaries table — %s", e)

    return results


def postgis_status(engine: Engine) -> dict:
    """
    Return PostGIS installation status and row counts.
    """
    status = {
        "extension_installed": False,
        "postgis_version":     None,
        "geospatial_rows":     0,
        "rows_with_geometry":  0,
        "boundary_rows":       0,
    }

    try:
        with engine.connect() as conn:
            ver = conn.execute(text("SELECT PostGIS_Version();")).scalar()
            status["extension_installed"] = True
            status["postgis_version"] = ver
    except Exception:
        return status

    try:
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT
                    COUNT(*)                              AS total,
                    COUNT(*) FILTER (WHERE geom IS NOT NULL) AS with_geom
                FROM analytics.geospatial_summary
            """)).fetchone()
            if row:
                status["geospatial_rows"]    = row[0]
                status["rows_with_geometry"] = row[1]
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            count = conn.execute(text(
                "SELECT COUNT(*) FROM analytics.geo_boundaries"
            )).scalar()
            status["boundary_rows"] = count
    except Exception:
        pass

    return status
