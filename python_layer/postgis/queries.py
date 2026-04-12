# ==============================================================
# PostGIS Spatial Query Engine
# ==============================================================
# All SQL is parameterised — no string interpolation.
# All functions return plain dicts/lists (JSON-serialisable).
# ==============================================================

import logging
from typing import Optional
from sqlalchemy.engine import Engine
from sqlalchemy import text

logger = logging.getLogger(__name__)


def find_nearby(
    engine: Engine,
    lat: float,
    lng: float,
    radius_meters: float,
    company_id: Optional[str],
    entity_type: Optional[str],   # "enterprise" | "person" | "address" | None
    limit: int = 50,
) -> list[dict]:
    """
    Find all geospatial_summary records within radius_meters of a point.

    Uses ST_DWithin on geography columns — accurate to the metre
    anywhere on Earth without needing a projected CRS.

    Returns list of records with distance_meters added.
    """
    conditions = ["geom IS NOT NULL"]
    params: dict = {
        "lng":    lng,
        "lat":    lat,
        "radius": radius_meters,
        "limit":  limit,
    }

    if company_id:
        conditions.append("company_id = :company_id")
        params["company_id"] = company_id

    if entity_type:
        conditions.append("enterprise_type = :entity_type")
        params["entity_type"] = entity_type

    where = " AND ".join(conditions)

    sql = text(f"""
        SELECT
            enterprise_id,
            company_id,
            name,
            enterprise_type,
            status,
            primary_address,
            latitude,
            longitude,
            cluster_id,
            ROUND(
                ST_Distance(
                    geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                )::numeric,
                1
            ) AS distance_meters
        FROM analytics.geospatial_summary
        WHERE {where}
          AND ST_DWithin(
                geom,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius
              )
        ORDER BY distance_meters ASC
        LIMIT :limit
    """)

    try:
        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error("PostGIS find_nearby failed: %s", e)
        return []


def get_density_grid(
    engine: Engine,
    company_id: Optional[str],
    grid_degrees: float = 0.5,   # ~55km grid cells at equator
    entity_type: Optional[str] = None,
) -> list[dict]:
    """
    Aggregate geospatial points into a density grid.

    Returns one cell per grid tile with:
      - grid_lat, grid_lng  (cell centre)
      - count               (number of records in cell)
      - enterprise_types    (distinct types in cell)

    Frontend uses this for heatmap layers — no client-side clustering needed.
    grid_degrees=0.1 → ~11km cells (city-level)
    grid_degrees=0.5 → ~55km cells (regional)
    grid_degrees=1.0 → ~110km cells (national)
    """
    conditions = ["geom IS NOT NULL"]
    params: dict = {"grid": grid_degrees}

    if company_id:
        conditions.append("company_id = :company_id")
        params["company_id"] = company_id
    if entity_type:
        conditions.append("enterprise_type = :entity_type")
        params["entity_type"] = entity_type

    where = " AND ".join(conditions)

    sql = text(f"""
        SELECT
            ROUND((FLOOR(latitude  / :grid) * :grid + :grid / 2)::numeric, 4) AS grid_lat,
            ROUND((FLOOR(longitude / :grid) * :grid + :grid / 2)::numeric, 4) AS grid_lng,
            COUNT(*)                                     AS count,
            ARRAY_AGG(DISTINCT enterprise_type)          AS enterprise_types
        FROM analytics.geospatial_summary
        WHERE {where}
        GROUP BY
            FLOOR(latitude  / :grid),
            FLOOR(longitude / :grid)
        ORDER BY count DESC
    """)

    try:
        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "grid_lat":        float(r.grid_lat),
                "grid_lng":        float(r.grid_lng),
                "count":           int(r.count),
                "enterprise_types": list(r.enterprise_types),
            }
            for r in rows
        ]
    except Exception as e:
        logger.error("PostGIS get_density_grid failed: %s", e)
        return []


def find_within_boundary(
    engine: Engine,
    boundary_id: int,
    company_id: Optional[str],
    entity_type: Optional[str] = None,
    limit: int = 500,
) -> list[dict]:
    """
    Find all records whose geometry falls inside a stored boundary polygon.

    Use case:
      - "Which clients are in the Northern district?"
      - "Which branches are inside our franchise territory?"
      - "Which farms are in the high-risk flood zone?"
    """
    conditions = ["g.geom IS NOT NULL"]
    params: dict = {"boundary_id": boundary_id, "limit": limit}

    if company_id:
        conditions.append("g.company_id = :company_id")
        params["company_id"] = company_id
    if entity_type:
        conditions.append("g.enterprise_type = :entity_type")
        params["entity_type"] = entity_type

    where = " AND ".join(conditions)

    sql = text(f"""
        SELECT
            g.enterprise_id,
            g.company_id,
            g.name,
            g.enterprise_type,
            g.status,
            g.primary_address,
            g.latitude,
            g.longitude,
            g.cluster_id,
            b.boundary_name,
            b.boundary_type
        FROM analytics.geospatial_summary g
        JOIN analytics.geo_boundaries b ON b.id = :boundary_id
        WHERE {where}
          AND ST_Within(g.geom::geometry, b.geom::geometry)
        LIMIT :limit
    """)

    try:
        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error("PostGIS find_within_boundary failed: %s", e)
        return []


def find_nearest(
    engine: Engine,
    lat: float,
    lng: float,
    company_id: Optional[str],
    entity_type: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """
    Find the N nearest records to a point using the KNN operator (<->).

    Faster than ST_DWithin for pure "nearest N" queries — uses the
    spatial index directly without a radius filter.

    Use case:
      - "Show the 3 nearest clinics to this patient"
      - "Which field agent is closest to this address?"
      - "Find the nearest branch to a new prospect"
    """
    conditions = ["geom IS NOT NULL"]
    params: dict = {"lng": lng, "lat": lat, "limit": limit}

    if company_id:
        conditions.append("company_id = :company_id")
        params["company_id"] = company_id
    if entity_type:
        conditions.append("enterprise_type = :entity_type")
        params["entity_type"] = entity_type

    where = " AND ".join(conditions)

    sql = text(f"""
        SELECT
            enterprise_id,
            company_id,
            name,
            enterprise_type,
            status,
            primary_address,
            latitude,
            longitude,
            cluster_id,
            ROUND(
                ST_Distance(
                    geom,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                )::numeric,
                1
            ) AS distance_meters
        FROM analytics.geospatial_summary
        WHERE {where}
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
        LIMIT :limit
    """)

    try:
        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error("PostGIS find_nearest failed: %s", e)
        return []


def get_cluster_summary(
    engine: Engine,
    company_id: Optional[str],
) -> list[dict]:
    """
    Summarise DBSCAN clusters from analytics.geospatial_summary.

    Returns one row per cluster with centroid and member count.
    cluster_id = -1 means the enterprise is isolated (no neighbours
    within DBSCAN radius).

    Use case: map layer showing cluster bubbles with counts.
    """
    conditions = ["geom IS NOT NULL", "cluster_id != -1"]
    params: dict = {}

    if company_id:
        conditions.append("company_id = :company_id")
        params["company_id"] = company_id

    where = " AND ".join(conditions)

    sql = text(f"""
        SELECT
            cluster_id,
            COUNT(*)                                            AS member_count,
            ROUND(AVG(latitude)::numeric,  5)                  AS centroid_lat,
            ROUND(AVG(longitude)::numeric, 5)                  AS centroid_lng,
            ARRAY_AGG(name ORDER BY name)                      AS members,
            ARRAY_AGG(DISTINCT enterprise_type)                AS enterprise_types
        FROM analytics.geospatial_summary
        WHERE {where}
        GROUP BY cluster_id
        ORDER BY member_count DESC
    """)

    try:
        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "cluster_id":      int(r.cluster_id),
                "member_count":    int(r.member_count),
                "centroid_lat":    float(r.centroid_lat),
                "centroid_lng":    float(r.centroid_lng),
                "members":         list(r.members),
                "enterprise_types": list(r.enterprise_types),
            }
            for r in rows
        ]
    except Exception as e:
        logger.error("PostGIS get_cluster_summary failed: %s", e)
        return []


def upsert_boundary(
    engine: Engine,
    company_id: str,
    boundary_name: str,
    boundary_type: str,
    geojson_polygon: dict,
    properties: Optional[dict] = None,
) -> dict:
    """
    Insert or replace a boundary polygon in analytics.geo_boundaries.

    geojson_polygon must be a GeoJSON Polygon or MultiPolygon geometry dict:
      { "type": "Polygon", "coordinates": [[[lng, lat], ...]] }

    Returns the new or updated boundary id.
    """
    import json

    geojson_str = json.dumps(geojson_polygon)
    props_str   = json.dumps(properties or {})

    sql_upsert = text("""
        INSERT INTO analytics.geo_boundaries
            (company_id, boundary_name, boundary_type, properties, geom)
        VALUES (
            :company_id,
            :boundary_name,
            :boundary_type,
            :properties::jsonb,
            ST_GeomFromGeoJSON(:geojson)::geography
        )
        ON CONFLICT (company_id, boundary_name)
        DO UPDATE SET
            boundary_type = EXCLUDED.boundary_type,
            properties    = EXCLUDED.properties,
            geom          = EXCLUDED.geom,
            created_at    = NOW()
        RETURNING id;
    """)

    # Add unique constraint if it doesn't exist (idempotent)
    sql_constraint = text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_geo_boundaries_company_name'
            ) THEN
                ALTER TABLE analytics.geo_boundaries
                ADD CONSTRAINT uq_geo_boundaries_company_name
                UNIQUE (company_id, boundary_name);
            END IF;
        END $$;
    """)

    try:
        with engine.connect() as conn:
            try:
                conn.execute(sql_constraint)
                conn.commit()
            except Exception:
                conn.rollback()

            row = conn.execute(sql_upsert, {
                "company_id":    company_id,
                "boundary_name": boundary_name,
                "boundary_type": boundary_type,
                "properties":    props_str,
                "geojson":       geojson_str,
            }).fetchone()
            conn.commit()
            return {"id": row[0], "status": "upserted"}
    except Exception as e:
        logger.error("PostGIS upsert_boundary failed: %s", e)
        raise
