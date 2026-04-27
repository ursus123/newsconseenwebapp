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


def get_entity_pins(
    engine: Engine,
    company_id: Optional[str],
    entity_layers: list[str],   # ["enterprises","addresses","plots"]
    limit: int = 1000,
) -> list[dict]:
    """
    Return lat/lon pins from one or more entity layers.

    Sources:
      enterprises  → analytics.geospatial_summary   (geocoded + clustered)
      addresses    → analytics.address_summary       (has lat/lon, address_type)
      plots        → analytics.plot_summary          (aggregated — use raw.plots instead)

    Returns a unified list of dicts with:
      id, entity_layer, name, entity_type, status,
      latitude, longitude, cluster_id (enterprises only)
    """
    parts = []
    params: dict = {}

    if "enterprises" in entity_layers:
        cond = "g.geom IS NOT NULL"
        if company_id:
            cond += " AND g.company_id = :company_id"
            params["company_id"] = company_id
        parts.append(f"""
            SELECT
                g.enterprise_id          AS id,
                'enterprise'::text       AS entity_layer,
                g.name,
                g.enterprise_type        AS entity_type,
                g.status,
                g.primary_address        AS address_label,
                g.latitude,
                g.longitude,
                g.cluster_id
            FROM analytics.geospatial_summary g
            WHERE {cond}
        """)

    if "addresses" in entity_layers:
        cond = "a.latitude IS NOT NULL AND a.longitude IS NOT NULL"
        if company_id:
            cond += " AND a.company_id = :company_id"
            params["company_id"] = company_id
        parts.append(f"""
            SELECT
                a.id,
                'address'::text          AS entity_layer,
                COALESCE(a.label, a.address_line_1, 'Address') AS name,
                a.address_type           AS entity_type,
                a.status,
                a.full_address           AS address_label,
                a.latitude,
                a.longitude,
                NULL::int                AS cluster_id
            FROM analytics.address_summary a
            WHERE {cond}
        """)

    if "plots" in entity_layers:
        # Plots are aggregated — query raw.plots if it exists
        try:
            with engine.connect() as conn:
                exists = conn.execute(text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema='raw' AND table_name='plots' LIMIT 1"
                )).fetchone()
            if exists:
                cond = "p.latitude IS NOT NULL AND p.longitude IS NOT NULL"
                if company_id:
                    cond += " AND p.company_id = :company_id"
                    params["company_id"] = company_id
                parts.append(f"""
                    SELECT
                        p.id,
                        'plot'::text         AS entity_layer,
                        COALESCE(p.name, 'Plot') AS name,
                        p.plot_type          AS entity_type,
                        p.status,
                        p.land_use           AS address_label,
                        p.latitude::double precision,
                        p.longitude::double precision,
                        NULL::int            AS cluster_id
                    FROM raw.plots p
                    WHERE {cond}
                """)
        except Exception as e:
            logger.debug("get_entity_pins: plots layer skipped — %s", e)

    if not parts:
        return []

    union_sql = " UNION ALL ".join(parts)
    sql = text(f"""
        SELECT * FROM (
            {union_sql}
        ) combined
        LIMIT :lim
    """)
    params["lim"] = limit

    try:
        with engine.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        logger.error("get_entity_pins failed: %s", e)
        return []


def get_multi_layer_density(
    engine: Engine,
    company_id: Optional[str],
    entity_layers: list[str],
    grid_degrees: float = 0.1,
) -> list[dict]:
    """
    Density grid for one or more entity layers combined.

    Sources the same union as get_entity_pins, then bins by grid cell.
    Returns cells with count, dominant entity_layer, and breakdown.
    """
    pins = get_entity_pins(engine, company_id, entity_layers, limit=5000)
    if not pins:
        return []

    from collections import defaultdict
    cells: dict = defaultdict(lambda: {"count": 0, "layers": defaultdict(int)})
    for pin in pins:
        lat = pin.get("latitude")
        lng = pin.get("longitude")
        layer = pin.get("entity_layer", "unknown")
        if lat is None or lng is None:
            continue
        cell_lat = round((int(lat / grid_degrees) * grid_degrees + grid_degrees / 2), 4)
        cell_lng = round((int(lng / grid_degrees) * grid_degrees + grid_degrees / 2), 4)
        key = (cell_lat, cell_lng)
        cells[key]["count"] += 1
        cells[key]["layers"][layer] += 1

    result = []
    for (cell_lat, cell_lng), data in cells.items():
        dominant = max(data["layers"], key=data["layers"].get)
        result.append({
            "grid_lat":   cell_lat,
            "grid_lng":   cell_lng,
            "count":      data["count"],
            "dominant_layer": dominant,
            "layer_breakdown": dict(data["layers"]),
        })

    result.sort(key=lambda x: x["count"], reverse=True)
    return result


def get_coverage_analysis(
    engine: Engine,
    boundary_id: int,
    company_id: Optional[str],
    entity_layers: list[str],
    limit: int = 500,
) -> dict:
    """
    Coverage analysis: how many records of each entity type are
    inside vs outside the boundary polygon.

    Returns inside_count, outside_count, and a sample of inside records.
    """
    inside = find_within_boundary(engine, boundary_id, company_id, None, limit)
    all_pins = get_entity_pins(engine, company_id, entity_layers, limit=5000)

    inside_set = {(r.get("latitude"), r.get("longitude")) for r in inside}
    inside_by_layer: dict = {}
    for r in inside:
        lyr = r.get("entity_layer", "enterprise")
        inside_by_layer[lyr] = inside_by_layer.get(lyr, 0) + 1

    total_by_layer: dict = {}
    for p in all_pins:
        lyr = p.get("entity_layer", "enterprise")
        total_by_layer[lyr] = total_by_layer.get(lyr, 0) + 1

    coverage_pct = {}
    for lyr in set(list(inside_by_layer.keys()) + list(total_by_layer.keys())):
        inside_n = inside_by_layer.get(lyr, 0)
        total_n  = total_by_layer.get(lyr, 0)
        coverage_pct[lyr] = round(inside_n / total_n * 100, 1) if total_n else 0.0

    return {
        "boundary_id":    boundary_id,
        "inside_records": inside,
        "inside_count":   len(inside),
        "total_records":  len(all_pins),
        "coverage_pct_by_layer": coverage_pct,
        "inside_by_layer":  inside_by_layer,
        "total_by_layer":   total_by_layer,
    }


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
