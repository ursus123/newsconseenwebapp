# ==============================================================
# PostGIS API Routes
# ==============================================================
#
# POST /postgis/setup              — enable extension + add geom column
# GET  /postgis/status             — extension status + row counts
# GET  /postgis/nearby             — records within radius of a point
# GET  /postgis/nearest            — N nearest records to a point
# GET  /postgis/density            — density grid for heatmap
# GET  /postgis/clusters           — DBSCAN cluster summary
# GET  /postgis/coverage           — records inside a boundary polygon
# POST /postgis/boundaries         — upload a boundary polygon (GeoJSON)
# GET  /postgis/boundaries         — list stored boundaries
# ==============================================================

import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from onboarding.auth import verify_tenant_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/postgis", tags=["PostGIS Spatial Intelligence"])


# ── Request models ────────────────────────────────────────────────────────────

class BoundaryRequest(BaseModel):
    company_id:      str
    boundary_name:   str
    boundary_type:   str = Field(
        description="district | region | zone | catchment | territory | other"
    )
    geojson:         dict = Field(
        description=(
            'GeoJSON Polygon geometry: '
            '{"type":"Polygon","coordinates":[[[lng,lat],...]]}'
        )
    )
    properties:      Optional[dict] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/setup")
def postgis_setup():
    """
    Enable the PostGIS extension and prepare analytics tables for spatial queries.

    Run once after Railway deployment. Safe to call multiple times.

    Steps performed:
      1. CREATE EXTENSION IF NOT EXISTS postgis
      2. Add geom geography(Point,4326) column to analytics.geospatial_summary
      3. Backfill geom from existing lat/lng float columns
      4. Create GIST spatial index for fast radius queries
      5. Create analytics.geo_boundaries table for district/region overlays
    """
    from database import get_engine_safe
    from postgis.setup import ensure_postgis

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="DATABASE_URL not configured")

    results = ensure_postgis(engine)
    success = results.get("extension") == "enabled"

    return {
        "success": success,
        "results": results,
        "next_steps": [
            "GET /postgis/nearby?lat=...&lng=...&radius_meters=5000&company_id=...",
            "GET /postgis/density?company_id=... (for heatmap)",
            "GET /postgis/nearest?lat=...&lng=...&company_id=... (closest N records)",
            "POST /postgis/boundaries (upload district/region GeoJSON polygons)",
        ] if success else ["Check Railway logs for errors"],
    }


@router.get("/status")
def postgis_status():
    """
    Check PostGIS installation status and spatial data counts.
    """
    from database import get_engine_safe
    from postgis.setup import postgis_status as _status

    engine = get_engine_safe()
    if not engine:
        return {"status": "no_database", "note": "DATABASE_URL not configured"}

    status = _status(engine)
    return {
        **status,
        "setup_guide": None if status.get("extension_installed") else {
            "step_1": "PostGIS is pre-installed on Railway PostgreSQL — run POST /postgis/setup",
            "step_2": "Run POST /load/geospatial-summary to populate coordinate data",
            "step_3": "Use GET /postgis/nearby, /density, /nearest for spatial queries",
        },
    }


@router.get("/nearby")
def find_nearby(
    lat:           float = Query(..., description="Centre point latitude"),
    lng:           float = Query(..., description="Centre point longitude"),
    radius_meters: float = Query(5000, description="Search radius in metres (default 5km)"),
    company_id:    str   = Query(...),
    entity_type:   Optional[str] = Query(None, description="Filter by enterprise_type"),
    limit:         int   = Query(50, le=500),
    authorization: Optional[str] = Header(None),
):
    """
    Find all records within a radius of a point.

    Accurate metre-based distance using PostGIS geography type.
    Returns results sorted by distance (nearest first).

    Examples:
      /postgis/nearby?lat=-1.286&lng=36.817&radius_meters=2000&company_id=abc
        → all branches within 2km of Nairobi CBD

      /postgis/nearby?lat=0.347&lng=32.582&radius_meters=10000&company_id=abc&entity_type=General+Hospital
        → hospitals within 10km of Kampala centre
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import find_nearby as _find_nearby

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    results = _find_nearby(
        engine=engine,
        lat=lat,
        lng=lng,
        radius_meters=radius_meters,
        company_id=company_id,
        entity_type=entity_type,
        limit=limit,
    )

    return {
        "centre":        {"lat": lat, "lng": lng},
        "radius_meters": radius_meters,
        "company_id":    company_id,
        "entity_type":   entity_type or "all",
        "count":         len(results),
        "results":       results,
    }


@router.get("/nearest")
def find_nearest(
    lat:         float = Query(..., description="Reference latitude"),
    lng:         float = Query(..., description="Reference longitude"),
    company_id:  str   = Query(...),
    entity_type: Optional[str] = Query(None),
    limit:       int   = Query(5, le=50),
    authorization: Optional[str] = Header(None),
):
    """
    Find the N nearest records to a point.

    Uses PostGIS KNN operator (<->) — faster than radius search
    when you just want "nearest N" regardless of distance.

    Use cases:
      - Nearest clinic to a patient's address
      - Nearest branch to a new prospect
      - Closest field agent to an emergency task
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import find_nearest as _find_nearest

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    results = _find_nearest(
        engine=engine,
        lat=lat,
        lng=lng,
        company_id=company_id,
        entity_type=entity_type,
        limit=limit,
    )

    return {
        "reference_point": {"lat": lat, "lng": lng},
        "company_id":      company_id,
        "entity_type":     entity_type or "all",
        "count":           len(results),
        "results":         results,
        "note":            "Sorted by straight-line distance. For routing, use distance_meters as an estimate.",
    }


@router.get("/density")
def density_grid(
    company_id:   str   = Query(...),
    grid_degrees: float = Query(
        0.5,
        description=(
            "Grid cell size in degrees. "
            "0.1≈11km (city), 0.5≈55km (regional), 1.0≈110km (national)"
        ),
        ge=0.01, le=5.0,
    ),
    entity_type:  Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Density grid for heatmap rendering.

    Groups all records into grid cells and returns count per cell.
    The frontend maps library (Leaflet, Mapbox, Deck.gl) can render
    this directly as a heatmap without client-side clustering.

    Use cases:
      - Client density map by region
      - Branch coverage gaps (low-density areas with many clients)
      - Farmer distribution across districts
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import get_density_grid

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    cells = get_density_grid(
        engine=engine,
        company_id=company_id,
        grid_degrees=grid_degrees,
        entity_type=entity_type,
    )

    total = sum(c["count"] for c in cells)

    return {
        "company_id":   company_id,
        "entity_type":  entity_type or "all",
        "grid_degrees": grid_degrees,
        "grid_cells":   len(cells),
        "total_records": total,
        "cells":        cells,
        "note": (
            f"Each cell is approximately {int(grid_degrees * 111)}km wide. "
            "Use grid_degrees=0.1 for city-level detail."
        ),
    }


@router.get("/clusters")
def cluster_summary(
    company_id: str = Query(...),
    authorization: Optional[str] = Header(None),
):
    """
    Return DBSCAN spatial cluster summaries.

    Clusters are computed during ETL (geospatial pipeline).
    Each cluster represents a geographic concentration of enterprises.

    Returns one entry per cluster with centroid coordinates and member list.
    Useful for map bubble layers where bubble size = member_count.
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import get_cluster_summary

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    clusters = get_cluster_summary(engine=engine, company_id=company_id)

    return {
        "company_id":  company_id,
        "cluster_count": len(clusters),
        "clusters":    clusters,
        "note": "cluster_id=-1 records are isolated (no neighbours within DBSCAN radius).",
    }


@router.get("/coverage")
def coverage_check(
    boundary_id: int   = Query(..., description="ID from GET /postgis/boundaries"),
    company_id:  str   = Query(...),
    entity_type: Optional[str] = Query(None),
    limit:       int   = Query(500, le=2000),
    authorization: Optional[str] = Header(None),
):
    """
    Find all records inside a stored boundary polygon.

    Use cases:
      - Which clients are in the Northern district?
      - Which branches are inside our franchise territory?
      - Which farms are within the irrigation catchment zone?

    Upload boundary polygons first with POST /postgis/boundaries.
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import find_within_boundary

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    results = find_within_boundary(
        engine=engine,
        boundary_id=boundary_id,
        company_id=company_id,
        entity_type=entity_type,
        limit=limit,
    )

    return {
        "boundary_id": boundary_id,
        "company_id":  company_id,
        "entity_type": entity_type or "all",
        "count":       len(results),
        "results":     results,
    }


@router.post("/boundaries")
def upload_boundary(request: BoundaryRequest, authorization: Optional[str] = Header(None)):
    """
    Upload a GeoJSON boundary polygon (district, region, zone, catchment area).

    The polygon is stored in analytics.geo_boundaries and can be queried
    via GET /postgis/coverage?boundary_id=<id>.

    Accepts any GeoJSON Polygon or MultiPolygon geometry.
    Get country/district GeoJSON from: geojson.io, GADM, OpenStreetMap Nominatim.

    Example body:
    {
      "company_id": "abc123",
      "boundary_name": "Northern District",
      "boundary_type": "district",
      "geojson": {
        "type": "Polygon",
        "coordinates": [[[32.0, 2.0], [33.0, 2.0], [33.0, 3.0], [32.0, 3.0], [32.0, 2.0]]]
      },
      "properties": {"population": 450000, "area_km2": 12000}
    }
    """
    verify_tenant_access(authorization, request.company_id)
    from database import get_engine_safe
    from postgis.queries import upsert_boundary

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    if request.geojson.get("type") not in ("Polygon", "MultiPolygon"):
        raise HTTPException(
            status_code=400,
            detail="geojson.type must be 'Polygon' or 'MultiPolygon'",
        )

    try:
        result = upsert_boundary(
            engine=engine,
            company_id=request.company_id,
            boundary_name=request.boundary_name,
            boundary_type=request.boundary_type,
            geojson_polygon=request.geojson,
            properties=request.properties,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        **result,
        "boundary_name": request.boundary_name,
        "boundary_type": request.boundary_type,
        "next_step":     f"GET /postgis/coverage?boundary_id={result['id']}&company_id={request.company_id}",
    }


@router.get("/spatial-pins")
def spatial_pins(
    company_id:     str   = Query(...),
    entity_layers:  str   = Query(
        "enterprises,addresses",
        description="Comma-separated layers: enterprises, addresses, plots",
    ),
    limit:          int   = Query(1000, le=5000),
    authorization: Optional[str] = Header(None),
):
    """
    Unified pin feed across entity layers.

    Sources:
      - enterprises → analytics.geospatial_summary
      - addresses   → analytics.address_summary
      - plots       → raw.plots (when available)

    Returns a flat list of pins each with:
      entity_layer, name, entity_type, status, latitude, longitude, cluster_id
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import get_entity_pins

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    layers = [l.strip() for l in entity_layers.split(",") if l.strip()]
    pins = get_entity_pins(engine=engine, company_id=company_id, entity_layers=layers, limit=limit)

    layer_counts: dict = {}
    for p in pins:
        lyr = p.get("entity_layer", "unknown")
        layer_counts[lyr] = layer_counts.get(lyr, 0) + 1

    return {
        "company_id":    company_id,
        "entity_layers": layers,
        "total":         len(pins),
        "by_layer":      layer_counts,
        "pins":          pins,
    }


@router.get("/spatial-density")
def spatial_density(
    company_id:    str   = Query(...),
    entity_layers: str   = Query(
        "enterprises,addresses",
        description="Comma-separated layers: enterprises, addresses, plots",
    ),
    grid_degrees:  float = Query(
        0.1,
        description="Grid cell size in degrees (0.1≈11km, 0.5≈55km)",
        ge=0.01, le=5.0,
    ),
    authorization: Optional[str] = Header(None),
):
    """
    Multi-layer density grid for heatmap rendering.

    Aggregates all entity layers into a unified grid.
    Each cell includes a dominant_layer and per-layer breakdown.

    Use cases:
      - Show density of clients + enterprises on a combined heatmap
      - Identify coverage gaps where plots exist but no enterprises
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import get_multi_layer_density

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    layers = [l.strip() for l in entity_layers.split(",") if l.strip()]
    cells = get_multi_layer_density(engine=engine, company_id=company_id, entity_layers=layers, grid_degrees=grid_degrees)
    total = sum(c["count"] for c in cells)

    return {
        "company_id":    company_id,
        "entity_layers": layers,
        "grid_degrees":  grid_degrees,
        "grid_cells":    len(cells),
        "total_records": total,
        "cells":         cells,
    }


@router.get("/coverage-analysis")
def coverage_analysis(
    boundary_id:   int   = Query(..., description="ID from GET /postgis/boundaries"),
    company_id:    str   = Query(...),
    entity_layers: str   = Query(
        "enterprises,addresses",
        description="Comma-separated layers: enterprises, addresses, plots",
    ),
    limit:         int   = Query(500, le=2000),
    authorization: Optional[str] = Header(None),
):
    """
    Multi-layer coverage analysis against a stored boundary polygon.

    Returns inside/outside counts per entity layer and coverage_pct.

    Use cases:
      - What % of farms are within the irrigation catchment?
      - How many clients are inside the Northern district?
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from postgis.queries import get_coverage_analysis

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    layers = [l.strip() for l in entity_layers.split(",") if l.strip()]
    result = get_coverage_analysis(engine=engine, boundary_id=boundary_id, company_id=company_id, entity_layers=layers, limit=limit)

    return {
        **result,
        "company_id":    company_id,
        "entity_layers": layers,
    }


@router.get("/boundaries")
def list_boundaries(
    company_id: str = Query(...),
    authorization: Optional[str] = Header(None),
):
    """
    List all stored boundary polygons for a company.
    """
    verify_tenant_access(authorization, company_id)
    from database import get_engine_safe
    from sqlalchemy import text

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT
                    id,
                    boundary_name,
                    boundary_type,
                    properties,
                    ST_AsGeoJSON(geom)::text AS geojson,
                    created_at
                FROM analytics.geo_boundaries
                WHERE company_id = :company_id
                ORDER BY boundary_name
            """), {"company_id": company_id}).fetchall()

        import json
        boundaries = []
        for r in rows:
            boundaries.append({
                "id":            r.id,
                "boundary_name": r.boundary_name,
                "boundary_type": r.boundary_type,
                "properties":    r.properties,
                "geojson":       json.loads(r.geojson) if r.geojson else None,
                "created_at":    r.created_at.isoformat() if r.created_at else None,
            })

        return {
            "company_id": company_id,
            "count":      len(boundaries),
            "boundaries": boundaries,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
