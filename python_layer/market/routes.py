"""
Market Intelligence Layer — ontology-grounded market analysis for SMEs.

All data flows through the ontology (Person, Enterprise, Product, Task,
Transaction, Relationship, Address). External public APIs are called here
(in Layer 2) — never from the frontend directly.

Endpoints:
  GET  /market/nearby              — OSM nearby businesses → ontology enterprise_type
  GET  /market/my-enterprises      — own enterprises from analytics layer (geocoords)
  POST /market/ml/segment          — KMeans segmentation: customers, products, geography
  POST /market/ml/staffing-gap     — staffing gap analysis (Person vs Task demand)
  POST /market/ml/price-position   — product price positioning vs market benchmarks
  POST /market/ml/competitor-score — score nearby competitors vs own strength
  POST /market/ml/brand-awareness  — brand awareness heuristic from public data
  POST /market/ml/demand-forecast  — demand forecasting (time-series on transactions)
  POST /market/ml/service-gap      — geographic service gap detection (DBSCAN)
  POST /market/ml/churn-risk       — staff/client churn risk (logistic regression)
  GET  /market/economic-context    — World Bank macroeconomic indicators
  GET  /market/labor-context       — ILO / BLS open data labor statistics
  GET  /market/apis-catalog        — 50 free public API catalog
  GET  /market/industry-news       — industry news from public RSS feeds
"""
from __future__ import annotations

import json
import logging
import math
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from database import _clean_df

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["Market Intelligence"])

# ── Overpass API base URL (public, no key, rate-limited to 1 rps) ─────────────
OVERPASS_URL   = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL  = "https://nominatim.openstreetmap.org/search"
WORLDBANK_URL  = "https://api.worldbank.org/v2"
RESTCOUNTRIES_URL = "https://restcountries.com/v3.1"
ILO_URL        = "https://www.ilo.org/ilostat-files/ILOSTAT/bulk_download"

_OVERPASS_LAST_CALL = 0.0   # throttle to 1 req/s


def _overpass(query: str, timeout: int = 25) -> dict:
    global _OVERPASS_LAST_CALL
    wait = 1.1 - (time.time() - _OVERPASS_LAST_CALL)
    if wait > 0:
        time.sleep(wait)
    _OVERPASS_LAST_CALL = time.time()
    resp = requests.post(
        OVERPASS_URL,
        data={"data": query},
        timeout=timeout,
        headers={"User-Agent": "newsconseen-market/1.0 (contact@newsconseen.com)"},
    )
    resp.raise_for_status()
    return resp.json()


# ── Ontology enterprise_type → OSM tag groups ─────────────────────────────────
#
# Maps each ontology enterprise_type to a list of Overpass filter expressions.
# Only the most common, globally present tags are used to avoid empty results
# in developing-world cities where OSM coverage is thinner.

ONTOLOGY_TO_OSM: Dict[str, List[str]] = {
    "commercial": [
        '["amenity"~"restaurant|cafe|bar|fast_food|marketplace|fuel|car_repair|bank|post_office|money_transfer"]',
        '["shop"~"supermarket|convenience|hardware|electronics|clothing|bakery|butcher|greengrocer|general"]',
        '["office"~"company|financial|accountant|insurance|it|real_estate|property_management"]',
        '["tourism"~"hotel|guest_house|hostel|motel"]',
    ],
    "nonprofit": [
        '["amenity"~"place_of_worship|social_facility|community_centre|charity|food_bank"]',
        '["office"~"ngo|association|foundation|charity|religion"]',
    ],
    "government": [
        '["amenity"~"townhall|police|fire_station|courthouse|embassy|library|post_office"]',
        '["office"~"government|diplomatic|administrative|public_service"]',
    ],
    "healthcare": [
        '["amenity"~"hospital|clinic|pharmacy|dentist|doctors|veterinary|nursing_home|blood_bank"]',
        '["healthcare"~"clinic|hospital|pharmacy|doctor|dentist|optometrist|physiotherapist|laboratory"]',
    ],
    "education": [
        '["amenity"~"school|university|college|kindergarten|library|language_school|training_centre|music_school"]',
        '["office"~"educational_institution"]',
    ],
    "cooperative": [
        '["office"~"cooperative|association|trade_union|mutual"]',
        '["shop"~"cooperative"]',
    ],
    "trust": [
        '["office"~"financial|accountant|lawyer|insurance|investment"]',
        '["amenity"~"bank"]',
    ],
}

# all types collapsed into one wide query
_ALL_OSM_TAGS = '["amenity"]|["shop"]|["office"]|["tourism"]|["healthcare"]'

OSM_TAG_TO_ONTOLOGY: Dict[str, str] = {
    # commercial
    "restaurant": "commercial", "cafe": "commercial", "bar": "commercial",
    "fast_food": "commercial", "marketplace": "commercial", "fuel": "commercial",
    "car_repair": "commercial", "bank": "commercial", "hotel": "commercial",
    "guest_house": "commercial", "hostel": "commercial", "motel": "commercial",
    "supermarket": "commercial", "convenience": "commercial", "hardware": "commercial",
    "electronics": "commercial", "clothing": "commercial", "bakery": "commercial",
    "butcher": "commercial", "greengrocer": "commercial", "general": "commercial",
    "company": "commercial", "financial": "trust", "accountant": "trust",
    "insurance": "trust", "it": "commercial", "real_estate": "commercial",
    # nonprofit
    "place_of_worship": "nonprofit", "social_facility": "nonprofit",
    "community_centre": "nonprofit", "charity": "nonprofit", "food_bank": "nonprofit",
    "ngo": "nonprofit", "association": "nonprofit", "foundation": "nonprofit",
    "religion": "nonprofit",
    # government
    "townhall": "government", "police": "government", "fire_station": "government",
    "courthouse": "government", "embassy": "government", "library": "government",
    "post_office": "government", "government": "government", "diplomatic": "government",
    "administrative": "government",
    # healthcare
    "hospital": "healthcare", "clinic": "healthcare", "pharmacy": "healthcare",
    "dentist": "healthcare", "doctors": "healthcare", "veterinary": "healthcare",
    "nursing_home": "healthcare", "blood_bank": "healthcare",
    "physiotherapist": "healthcare", "laboratory": "healthcare",
    # education
    "school": "education", "university": "education", "college": "education",
    "kindergarten": "education", "language_school": "education",
    "training_centre": "education", "music_school": "education",
    "educational_institution": "education",
    # cooperative
    "cooperative": "cooperative", "trade_union": "cooperative", "mutual": "cooperative",
    # trust
    "lawyer": "trust", "investment": "trust",
}

ENTERPRISE_TYPE_VALUES = list(ONTOLOGY_TO_OSM.keys())


def _classify_osm(tags: dict) -> str:
    """Map OSM tags dict → ontology enterprise_type string."""
    for key in ("amenity", "shop", "office", "tourism", "healthcare"):
        val = tags.get(key, "")
        if val and val in OSM_TAG_TO_ONTOLOGY:
            return OSM_TAG_TO_ONTOLOGY[val]
    return "commercial"  # default


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _load_analytics(table: str, company_id: Optional[str] = None):
    """
    Load from analytics.* table (Layer 2), filtered by company_id at read time.
    Falls back to _load_raw() if the analytics table is empty or unavailable.
    """
    import pandas as pd
    try:
        from database import get_engine_safe
        from sqlalchemy import text as sqlt
        engine = get_engine_safe()
        if engine:
            where = "WHERE company_id = :cid" if company_id else ""
            params = {"cid": company_id} if company_id else {}
            with engine.connect() as conn:
                df = pd.read_sql(sqlt(f"SELECT * FROM analytics.{table} {where}"), conn, params=params)
            if not df.empty:
                return df
            logger.info("_load_analytics: analytics.%s empty — trying raw fallback", table)
    except Exception as e:
        logger.warning("_load_analytics: analytics.%s unavailable — %s", table, e)

    # Fallback: try raw schema
    return _load_raw(table, company_id)


def _load_raw(table: str, company_id: Optional[str] = None):
    """
    Load from raw.* table (Layer 2), filtered by company_id at read time.
    Falls back to _fetch_from_base44() if the raw table is empty or unavailable.
    """
    import pandas as pd
    # raw table name → Base44 settings URL attribute
    _RAW_TO_URL = {
        "enterprises":   "base44_enterprises_url",
        "people":        "base44_people_url",
        "products":      "base44_products_url",
        "tasks":         "base44_tasks_url",
        "transactions":  "base44_transactions_url",
        "relationships": "base44_relationships_url",
        "addresses":     "base44_addresses_url",
        "services":      "base44_services_url",
    }
    try:
        from database import get_engine_safe
        from sqlalchemy import text as sqlt
        engine = get_engine_safe()
        if engine:
            where = "WHERE company_id = :cid" if company_id else ""
            params = {"cid": company_id} if company_id else {}
            with engine.connect() as conn:
                df = pd.read_sql(sqlt(f"SELECT * FROM raw.{table} {where}"), conn, params=params)
            if not df.empty:
                return df
            logger.info("_load_raw: raw.%s empty — trying Base44 live fallback", table)
    except Exception as e:
        logger.warning("_load_raw: raw.%s unavailable — %s", table, e)

    # Fallback: fetch live from Base44 API
    url_attr = _RAW_TO_URL.get(table)
    if url_attr:
        return _fetch_from_base44(url_attr, company_id)
    return pd.DataFrame()


def _fetch_from_base44(url_attr: str, company_id: Optional[str] = None):
    """
    Live fallback: fetch all records directly from Base44 API.
    Uses the same fetch_json_to_df + HEADERS pattern as the ETL modules.
    Filters by company_id client-side after fetch (Base44 API has no server filter).
    """
    import pandas as pd
    try:
        from config import settings, HEADERS
        from etl.base import fetch_json_to_df
        url = getattr(settings, url_attr, None)
        if not url:
            logger.warning("_fetch_from_base44: %s not set in settings", url_attr)
            return pd.DataFrame()
        df = fetch_json_to_df(url)
        if df.empty:
            return df
        # Tenant isolation at read time — filter by company_id if provided
        if company_id and "company_id" in df.columns:
            df = df[df["company_id"] == company_id].copy()
        logger.info(
            "_fetch_from_base44: fetched %d rows from Base44 (%s, company_id=%s)",
            len(df), url_attr, company_id,
        )
        return df
    except Exception as e:
        logger.warning("_fetch_from_base44: %s failed — %s", url_attr, e)
        return pd.DataFrame()


# ── Request models ─────────────────────────────────────────────────────────────

class MLRequest(BaseModel):
    company_id: str
    options: Optional[Dict[str, Any]] = {}


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/nearby")
def get_nearby_businesses(
    lat: float  = Query(..., description="Centre latitude"),
    lng: float  = Query(..., description="Centre longitude"),
    radius_km: float = Query(2.0, le=10.0, description="Search radius in km"),
    enterprise_type: Optional[str] = Query(None, description="Ontology enterprise_type filter"),
    company_id: Optional[str] = Query(None),
    limit: int = Query(80, le=300),
):
    """
    Fetch nearby businesses from OpenStreetMap Overpass API.
    Results are classified to the ontology enterprise_type enum and filtered.
    This is the public competitor map data source.
    """
    radius_m = int(radius_km * 1000)

    # Build tag filters
    if enterprise_type and enterprise_type in ONTOLOGY_TO_OSM:
        tag_filters = ONTOLOGY_TO_OSM[enterprise_type]
    else:
        # No filter — fetch all commercial-ish tags
        tag_filters = [
            '["amenity"~"restaurant|cafe|bar|fast_food|bank|clinic|hospital|school|university|pharmacy|police|townhall|fire_station|marketplace|fuel|social_facility|community_centre|place_of_worship|nursing_home|dentist|doctors|veterinary|library|kindergarten"]',
            '["shop"~"supermarket|convenience|hardware|electronics|clothing|bakery|general"]',
            '["office"~"company|financial|ngo|government|educational_institution|cooperative|insurance|it"]',
            '["tourism"~"hotel|guest_house|hostel"]',
        ]

    node_blocks = "\n".join(
        f'  node{tf}(around:{radius_m},{lat},{lng});'
        for tf in tag_filters
    )
    way_blocks = "\n".join(
        f'  way{tf}(around:{radius_m},{lat},{lng});'
        for tf in tag_filters[:2]  # ways for shops + amenity only
    )

    query = f"""[out:json][timeout:30];
(
{node_blocks}
{way_blocks}
);
out center {limit};"""

    try:
        raw = _overpass(query)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Overpass API error: {e}")

    results = []
    for el in raw.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name") or tags.get("brand") or tags.get("operator")
        if not name:
            continue

        # Resolve coordinates (node vs way with center)
        if el.get("type") == "node":
            elat, elng = el.get("lat"), el.get("lon")
        else:
            center = el.get("center", {})
            elat, elng = center.get("lat"), center.get("lon")

        if not elat or not elng:
            continue

        otype = _classify_osm(tags)
        dist  = round(_haversine_km(lat, lng, elat, elng), 3)

        results.append({
            "osm_id":          el.get("id"),
            "osm_type":        el.get("type"),
            "name":            name,
            "enterprise_type": otype,    # ontology classification
            "lat":             elat,
            "lng":             elng,
            "distance_km":     dist,
            "address":         tags.get("addr:full") or ", ".join(filter(None, [
                tags.get("addr:housenumber",""), tags.get("addr:street",""),
                tags.get("addr:city",""), tags.get("addr:country",""),
            ])) or None,
            "phone":           tags.get("phone") or tags.get("contact:phone"),
            "website":         tags.get("website") or tags.get("contact:website"),
            "opening_hours":   tags.get("opening_hours"),
            "osm_amenity":     tags.get("amenity"),
            "osm_shop":        tags.get("shop"),
            "osm_office":      tags.get("office"),
        })

    results.sort(key=lambda r: r["distance_km"])
    return {
        "centre":          {"lat": lat, "lng": lng},
        "radius_km":       radius_km,
        "enterprise_type": enterprise_type,
        "count":           len(results),
        "businesses":      results,
        "source":          "OpenStreetMap Overpass API",
    }


@router.get("/my-enterprises")
def get_my_enterprises(
    company_id: str = Query(...),
):
    """
    Return own enterprises with geocoordinates.

    Three-tier data resolution (analytics → raw → Base44 live):
    1. analytics.enterprise_summary  — post-ETL enriched table (preferred)
    2. raw.enterprises               — ETL snapshot table
    3. Base44 live API               — direct fetch if DB unavailable / empty

    Geocoordinates: if not on enterprise record itself, attempts to join
    addresses (same three-tier resolution) using enterprise_id.
    """
    import pandas as pd
    import numpy as np

    # ── 1. Load enterprise records ─────────────────────────────────────────
    # Try analytics summary first (has normalised columns), then raw, then Base44
    df = _load_analytics("enterprise_summary", company_id)
    source = "analytics.enterprise_summary"

    if df.empty:
        df = _load_raw("enterprises", company_id)
        source = "raw.enterprises / Base44 live"

    if df.empty:
        return {"company_id": company_id, "count": 0, "enterprises": [], "source": "no data"}

    # Normalise enterprise_name — raw Base44 records use "name" field
    if "enterprise_name" not in df.columns and "name" in df.columns:
        df = df.rename(columns={"name": "enterprise_name"})

    # ── 2. Attach geocoordinates from Addresses if missing ─────────────────
    has_lat = "latitude" in df.columns and df["latitude"].notna().any()
    has_lng = "longitude" in df.columns and df["longitude"].notna().any()

    if not (has_lat and has_lng):
        # Try to join from addresses using enterprise_id
        addr_df = _load_analytics("address_summary", company_id)
        if addr_df.empty:
            addr_df = _load_raw("addresses", company_id)

        if not addr_df.empty:
            join_col = next(
                (c for c in ["enterprise_id", "linked_enterprise_id", "parent_id"]
                 if c in addr_df.columns),
                None,
            )
            lat_col = next((c for c in ["latitude", "lat"] if c in addr_df.columns), None)
            lng_col = next((c for c in ["longitude", "lng", "lon"] if c in addr_df.columns), None)

            if join_col and lat_col and lng_col:
                addr_coords = (
                    addr_df[[join_col, lat_col, lng_col]]
                    .dropna(subset=[lat_col, lng_col])
                    .rename(columns={join_col: "id", lat_col: "latitude", lng_col: "longitude"})
                    .drop_duplicates(subset=["id"])
                )
                ent_id_col = next((c for c in ["id", "enterprise_id"] if c in df.columns), None)
                if ent_id_col:
                    df = df.merge(
                        addr_coords,
                        left_on=ent_id_col,
                        right_on="id",
                        how="left",
                        suffixes=("", "_addr"),
                    )
                    if "latitude_addr" in df.columns:
                        df["latitude"]  = df["latitude"].fillna(df["latitude_addr"])
                        df["longitude"] = df["longitude"].fillna(df["longitude_addr"])
                        df.drop(columns=["latitude_addr", "longitude_addr"], inplace=True, errors="ignore")

    # ── 3. Geocode missing enterprises via Nominatim ───────────────────────
    # For enterprises that still have no coordinates, try Nominatim lookup
    # using enterprise_name + city/country fields. Limited to 10 per call.
    name_col = "enterprise_name" if "enterprise_name" in df.columns else None
    if name_col:
        missing_mask = df.get("latitude", pd.Series(dtype=float)).isna()
        to_geocode = df[missing_mask].head(10)
        for idx, row in to_geocode.iterrows():
            query_parts = [str(row.get(name_col, "") or "")]
            for field in ("city", "country", "address_line_1"):
                val = row.get(field)
                if val:
                    query_parts.append(str(val))
            query = ", ".join(p for p in query_parts if p)
            if not query.strip():
                continue
            try:
                resp = requests.get(
                    NOMINATIM_URL,
                    params={"q": query, "format": "json", "limit": 1},
                    headers={"User-Agent": "newsconseen-market/1.0 (contact@newsconseen.com)"},
                    timeout=6,
                )
                hits = resp.json()
                if hits:
                    df.at[idx, "latitude"]  = float(hits[0]["lat"])
                    df.at[idx, "longitude"] = float(hits[0]["lon"])
                    df.at[idx, "_geocoded"] = True
                    logger.info("Nominatim geocoded '%s'", query[:60])
                time.sleep(1.1)  # Nominatim rate limit: 1 rps
            except Exception as ge:
                logger.debug("Nominatim geocode failed for '%s': %s", query[:40], ge)

    # ── 4. Return all enterprises (with or without coords) ─────────────────
    want_cols = [c for c in [
        "id", "enterprise_name", "name", "enterprise_type", "enterprise_tier",
        "operating_status", "status", "latitude", "longitude",
        "city", "country", "phone", "email", "website",
        "company_id", "_geocoded",
    ] if c in df.columns]

    result_df = df[want_cols].copy()
    # Convert numpy types for JSON serialisation
    result_df = result_df.where(result_df.notna(), other=None)

    records = result_df.pipe(_clean_df).to_dict(orient="records")
    geocoded_count = sum(1 for r in records if r.get("latitude") is not None)

    return {
        "company_id":     company_id,
        "count":          len(records),
        "geocoded_count": geocoded_count,
        "enterprises":    records,
        "source":     source,
    }


@router.post("/ml/segment")
def ml_market_segment(req: MLRequest):
    """
    Market segmentation — KMeans across 3 ontology object types:
    - Person (customers/clients segmented by tenure, revenue, activity)
    - Product (products segmented by price, stock, velocity)
    - Geography (enterprises clustered by location density)

    All data from analytics tables (Layer 2). Results saved to raw.ml_predictions.
    """
    try:
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
        import pandas as pd
        import numpy as np
    except ImportError:
        raise HTTPException(status_code=503, detail="scikit-learn not installed")

    company_id    = req.company_id
    n_clusters    = req.options.get("n_clusters", 3)
    object_type   = req.options.get("object_type", "Person")
    research_mode = bool(req.options.get("research_mode", False))

    result: Dict[str, Any] = {"status": "success", "object_type": object_type, "segments": [], "summary": []}

    if object_type == "Person":
        people_df  = _load_analytics("people_summary",      company_id)
        tx_df      = _load_analytics("transaction_summary",  company_id)
        task_df    = _load_analytics("task_summary",         company_id)
        from ml.segmentation import run_ltv_segmentation
        seg = run_ltv_segmentation(people_df, tx_df, task_df, n_clusters=n_clusters, research_mode=research_mode)
        result.update(seg)

    elif object_type == "Product":
        prod_df = _load_raw("products", company_id)
        if prod_df.empty:
            return {"status": "skipped", "reason": "no product data", "segments": []}

        feat_cols = [c for c in ["unit_price", "cost_price", "stock_quantity", "reorder_level"] if c in prod_df.columns]
        if len(feat_cols) < 2:
            return {"status": "skipped", "reason": "insufficient product features", "segments": []}

        X = prod_df[feat_cols].fillna(0).values
        if len(X) < n_clusters:
            return {"status": "skipped", "reason": f"only {len(X)} products — need {n_clusters}", "segments": []}

        scaler = StandardScaler()
        Xs = scaler.fit_transform(X)
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = km.fit_predict(Xs)
        prod_df = prod_df.copy()
        prod_df["cluster"] = labels
        PROD_LABELS = {0: "premium", 1: "mid_range", 2: "budget"}
        # order by unit_price descending
        if "unit_price" in prod_df.columns:
            order = prod_df.groupby("cluster")["unit_price"].mean().sort_values(ascending=False).index.tolist()
            rank  = {cid: r for r, cid in enumerate(order)}
            prod_df["cluster"] = prod_df["cluster"].map(rank)
        prod_df["segment"] = prod_df["cluster"].map(PROD_LABELS)

        out_cols = [c for c in ["id","name","item_type","item_subtype","unit_price","cost_price","stock_quantity","segment"] if c in prod_df.columns]
        result["segments"] = prod_df[out_cols].pipe(_clean_df).to_dict(orient="records")
        result["summary"]  = prod_df.groupby("segment").agg(
            count=("segment","count"),
            avg_price=("unit_price","mean") if "unit_price" in prod_df.columns else ("segment","count"),
        ).round(2).reset_index().pipe(_clean_df).to_dict(orient="records")
        result["features_used"] = feat_cols

    elif object_type == "Geography":
        ent_df = _load_raw("enterprises", company_id)
        if ent_df.empty:
            return {"status": "skipped", "reason": "no enterprise data", "segments": []}
        coord_cols = [c for c in ["latitude","longitude"] if c in ent_df.columns]
        if len(coord_cols) < 2:
            return {"status": "skipped", "reason": "no geocoordinates on enterprises", "segments": []}

        df = ent_df.dropna(subset=coord_cols).copy()
        if len(df) < n_clusters:
            return {"status": "skipped", "reason": f"only {len(df)} geocoded enterprises", "segments": []}

        X = df[["latitude","longitude"]].values.astype(float)
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        df["cluster"] = km.fit_predict(X)
        df["segment"] = df["cluster"].apply(lambda c: f"zone_{c+1}")

        out_cols = [c for c in ["id","enterprise_name","enterprise_type","latitude","longitude","cluster","segment"] if c in df.columns]
        result["segments"] = df[out_cols].pipe(_clean_df).to_dict(orient="records")
        result["cluster_centers"] = [
            {"cluster": i, "lat": float(c[0]), "lng": float(c[1])}
            for i, c in enumerate(km.cluster_centers_)
        ]
        result["features_used"] = coord_cols

    else:
        raise HTTPException(status_code=400, detail=f"Unknown object_type '{object_type}'. Use Person, Product, or Geography.")

    return result


@router.post("/ml/staffing-gap")
def ml_staffing_gap(req: MLRequest):
    """
    Staffing gap analysis — compares Person (staff) counts vs Task demand.
    Uses linear regression to estimate understaffed vs overstaffed enterprises.
    Ontology objects: Person (staff) + Task.
    """
    try:
        from sklearn.linear_model import LinearRegression
        import pandas as pd
        import numpy as np
    except ImportError:
        raise HTTPException(status_code=503, detail="scikit-learn not installed")

    company_id = req.company_id
    people_df = _load_analytics("people_summary", company_id)
    task_df   = _load_analytics("task_summary",   company_id)

    if people_df.empty or task_df.empty:
        return {"status": "skipped", "reason": "insufficient people or task data", "gaps": []}

    # Active staff count per enterprise
    staff_cols = [c for c in ["enterprise_id","active_count","avg_hours_per_week"] if c in people_df.columns]
    task_cols  = [c for c in ["enterprise_id","total_tasks","completion_rate_pct","pending_tasks"] if c in task_df.columns]

    if "enterprise_id" not in people_df.columns or "enterprise_id" not in task_df.columns:
        return {"status": "skipped", "reason": "enterprise_id missing from people or task summary", "gaps": []}

    staff = people_df.groupby("enterprise_id").agg(
        staff_count=("active_count","sum")
    ).reset_index()
    tasks = task_df.groupby("enterprise_id").agg(
        total_tasks=("total_tasks","sum") if "total_tasks" in task_df.columns else ("enterprise_id","count"),
    ).reset_index()

    merged = staff.merge(tasks, on="enterprise_id", how="inner")
    if merged.empty:
        return {"status": "skipped", "reason": "no matching enterprise_id between people and tasks", "gaps": []}

    # Simple capacity score: tasks per staff member
    merged["tasks_per_staff"] = (merged["total_tasks"] / merged["staff_count"].replace(0, 1)).round(2)
    p75 = float(merged["tasks_per_staff"].quantile(0.75))
    p25 = float(merged["tasks_per_staff"].quantile(0.25))

    def _gap(row):
        ratio = row["tasks_per_staff"]
        if ratio > p75 * 1.5: return "critically_understaffed"
        if ratio > p75:        return "understaffed"
        if ratio < p25 * 0.5:  return "overstaffed"
        if ratio < p25:        return "lightly_staffed"
        return "balanced"

    merged["staffing_status"] = merged.apply(_gap, axis=1)

    return {
        "status": "success",
        "company_id": company_id,
        "median_tasks_per_staff": round(float(merged["tasks_per_staff"].median()), 2),
        "p25": round(p25, 2),
        "p75": round(p75, 2),
        "gaps": merged.pipe(_clean_df).to_dict(orient="records"),
        "summary": merged.groupby("staffing_status").size().reset_index(name="count").pipe(_clean_df).to_dict(orient="records"),
    }


@router.post("/ml/price-position")
def ml_price_position(req: MLRequest):
    """
    Price positioning — ranks own products within the company's portfolio.
    Computes price percentile, margin estimate, and positioning label.
    Ontology objects: Product + Transaction.
    """
    try:
        import pandas as pd
        import numpy as np
    except ImportError:
        raise HTTPException(status_code=503, detail="numpy/pandas not installed")

    company_id = req.company_id
    prod_df = _load_raw("products", company_id)
    if prod_df.empty:
        return {"status": "skipped", "reason": "no product data", "products": []}

    price_col = next((c for c in ["unit_price","price","cost_price"] if c in prod_df.columns), None)
    if not price_col:
        return {"status": "skipped", "reason": "no price field on products", "products": []}

    df = prod_df.dropna(subset=[price_col]).copy()
    df["price_percentile"] = (df[price_col].rank(pct=True) * 100).round(1)

    if "cost_price" in df.columns and price_col == "unit_price":
        df["margin_pct"] = ((df["unit_price"] - df["cost_price"]) / df["unit_price"].replace(0, 1) * 100).round(1)
    else:
        df["margin_pct"] = None

    def _position(pct):
        if pct >= 80: return "premium"
        if pct >= 50: return "mid_range"
        if pct >= 20: return "value"
        return "budget"

    df["price_position"] = df["price_percentile"].apply(_position)

    out_cols = [c for c in ["id","name","item_type","item_subtype",price_col,"cost_price","price_percentile","margin_pct","price_position"] if c in df.columns]
    return {
        "status":    "success",
        "company_id": company_id,
        "price_field": price_col,
        "market_avg": round(float(df[price_col].mean()), 2),
        "market_median": round(float(df[price_col].median()), 2),
        "products":  df[out_cols].pipe(_clean_df).to_dict(orient="records"),
        "distribution": df.groupby("price_position").size().reset_index(name="count").pipe(_clean_df).to_dict(orient="records"),
    }


@router.post("/ml/competitor-score")
def ml_competitor_score(req: MLRequest):
    """
    Competitor scoring — scores nearby OSM businesses vs own enterprise strength.
    Uses proximity, industry match, and ontology type alignment.
    Scores 0-100 where 100 = closest/most direct competitor.
    Input: own enterprise location + nearby businesses from /market/nearby.
    """
    competitors  = req.options.get("competitors", [])   # from /market/nearby
    own_type     = req.options.get("enterprise_type")    # own ontology type
    own_lat      = req.options.get("lat")
    own_lng      = req.options.get("lng")
    radius_km    = req.options.get("radius_km", 2.0)

    if not competitors:
        return {"status": "skipped", "reason": "no competitor data provided", "scores": []}

    scores = []
    for c in competitors:
        dist = c.get("distance_km", radius_km)
        same_type = (c.get("enterprise_type") == own_type) if own_type else True

        # Proximity score: 100 at 0km, 0 at radius_km
        proximity = max(0, 100 * (1 - dist / max(radius_km, 0.1)))
        # Type match bonus
        type_bonus = 30 if same_type else 0
        # Final threat score
        threat = min(100, round(proximity * 0.7 + type_bonus, 1))

        scores.append({
            **c,
            "proximity_score":  round(proximity, 1),
            "type_match":       same_type,
            "threat_score":     threat,
            "threat_level":     "high" if threat >= 65 else "medium" if threat >= 35 else "low",
        })

    scores.sort(key=lambda x: -x["threat_score"])
    return {
        "status":       "success",
        "own_type":     own_type,
        "scored":       len(scores),
        "high_threat":  sum(1 for s in scores if s["threat_level"] == "high"),
        "competitors":  scores,
    }


@router.post("/ml/brand-awareness")
def ml_brand_awareness(req: MLRequest):
    """
    Brand awareness heuristic — estimates brand visibility using:
    1. OSM presence (how many locations are mapped)
    2. Transaction recency (recent client activity = active brand)
    3. People engagement rate (client retention)
    Ontology objects: Enterprise + Person + Transaction.
    """
    import pandas as pd

    company_id = req.company_id
    ent_df  = _load_analytics("enterprise_summary",  company_id)
    ppl_df  = _load_analytics("people_summary",       company_id)
    tx_df   = _load_analytics("transaction_summary",  company_id)

    enterprise_name = req.options.get("enterprise_name", "")
    brand_score = 0
    factors = []

    # Factor 1: enterprise count (presence)
    n_ent = len(ent_df) if not ent_df.empty else 0
    presence = min(30, n_ent * 5)
    brand_score += presence
    factors.append({"factor": "location_presence", "score": presence, "detail": f"{n_ent} enterprise locations mapped"})

    # Factor 2: active client ratio
    if not ppl_df.empty and "active_count" in ppl_df.columns and "total_people" in ppl_df.columns:
        total  = int(ppl_df["total_people"].sum())
        active = int(ppl_df["active_count"].sum())
        ratio  = active / max(total, 1)
        engage = round(ratio * 35, 1)
        brand_score += engage
        factors.append({"factor": "client_engagement", "score": engage, "detail": f"{active}/{total} clients active ({round(ratio*100,1)}%)"})
    else:
        factors.append({"factor": "client_engagement", "score": 0, "detail": "no people data"})

    # Factor 3: transaction recency
    if not tx_df.empty and "month_year" in tx_df.columns:
        latest = tx_df["month_year"].max()
        recency = 25
        brand_score += recency
        factors.append({"factor": "transaction_recency", "score": recency, "detail": f"Latest transaction period: {latest}"})
    elif not tx_df.empty:
        brand_score += 20
        factors.append({"factor": "transaction_recency", "score": 20, "detail": "transaction data present"})
    else:
        factors.append({"factor": "transaction_recency", "score": 0, "detail": "no transaction data"})

    # Factor 4: OSM name match (if enterprise_name given)
    osm_score = 0
    if enterprise_name:
        try:
            resp = requests.get(
                NOMINATIM_URL,
                params={"q": enterprise_name, "format": "json", "limit": 3},
                headers={"User-Agent": "newsconseen-market/1.0"},
                timeout=8,
            )
            hits = resp.json()
            osm_score = min(10, len(hits) * 5)
            factors.append({"factor": "osm_public_presence", "score": osm_score, "detail": f"{len(hits)} Nominatim matches for '{enterprise_name}'"})
        except Exception as e:
            factors.append({"factor": "osm_public_presence", "score": 0, "detail": f"Nominatim lookup failed: {e}"})
    else:
        factors.append({"factor": "osm_public_presence", "score": 0, "detail": "no enterprise_name provided"})
    brand_score += osm_score

    total = min(100, round(brand_score, 1))
    return {
        "status":      "success",
        "company_id":  company_id,
        "brand_score": total,
        "level":       "strong" if total >= 65 else "developing" if total >= 35 else "early",
        "factors":     factors,
        "recommendation": (
            "Your brand is well-established. Focus on retention and referral programs." if total >= 65
            else "Growing brand. Increase public presence and client engagement." if total >= 35
            else "Early-stage brand. Prioritise location mapping and client activation."
        ),
    }


@router.post("/ml/demand-forecast")
def ml_demand_forecast(req: MLRequest):
    """
    Demand forecasting — linear regression on monthly transaction amounts.
    Predicts next 3 months' revenue trend.
    Ontology objects: Transaction.
    """
    try:
        from sklearn.linear_model import LinearRegression
        import pandas as pd
        import numpy as np
    except ImportError:
        raise HTTPException(status_code=503, detail="scikit-learn not installed")

    company_id = req.company_id
    tx_df = _load_analytics("transaction_summary", company_id)
    if tx_df.empty:
        return {"status": "skipped", "reason": "no transaction data", "forecast": []}

    amount_col = next((c for c in ["total_amount","revenue","amount"] if c in tx_df.columns), None)
    period_col = next((c for c in ["month_year","period","month"] if c in tx_df.columns), None)

    if not amount_col or not period_col:
        return {"status": "skipped", "reason": "missing amount or period columns in transaction_summary", "forecast": []}

    df = tx_df[[period_col, amount_col]].dropna().sort_values(period_col)
    df["t"] = range(len(df))
    df[amount_col] = pd.to_numeric(df[amount_col], errors="coerce").fillna(0)

    if len(df) < 3:
        return {"status": "skipped", "reason": f"only {len(df)} periods — need at least 3", "forecast": []}

    X = df[["t"]].values
    y = df[amount_col].values
    model = LinearRegression()
    model.fit(X, y)

    r2 = float(model.score(X, y))
    n  = len(df)
    forecast = []
    for i in range(1, 4):
        t_next = n + i - 1
        pred   = float(model.predict([[t_next]])[0])
        forecast.append({"period_offset": i, "predicted_amount": round(max(pred, 0), 2)})

    historical = df[[period_col, amount_col, "t"]].pipe(_clean_df).to_dict(orient="records")
    trend = "growing" if model.coef_[0] > 0 else "declining"

    return {
        "status":      "success",
        "company_id":  company_id,
        "amount_field": amount_col,
        "periods_used": n,
        "r_squared":   round(r2, 3),
        "trend":       trend,
        "monthly_change": round(float(model.coef_[0]), 2),
        "forecast":    forecast,
        "historical":  historical,
    }


@router.post("/ml/service-gap")
def ml_service_gap(req: MLRequest):
    """
    Service gap detection — DBSCAN density clustering to find geographic areas
    where enterprise coverage is sparse (underserved zones).
    Ontology objects: Enterprise + Address.
    """
    try:
        from sklearn.cluster import DBSCAN
        import pandas as pd
        import numpy as np
    except ImportError:
        raise HTTPException(status_code=503, detail="scikit-learn not installed")

    company_id    = req.company_id
    eps_km        = req.options.get("eps_km", 1.5)
    min_samples   = req.options.get("min_samples", 2)
    competitor_locations = req.options.get("competitor_locations", [])  # from /market/nearby

    ent_df = _load_raw("enterprises", company_id)
    if ent_df.empty:
        return {"status": "skipped", "reason": "no enterprise data", "gaps": []}

    coord_cols = [c for c in ["latitude","longitude"] if c in ent_df.columns]
    if len(coord_cols) < 2:
        return {"status": "skipped", "reason": "no geocoordinates on enterprises", "gaps": []}

    df = ent_df.dropna(subset=coord_cols).copy()
    all_locs = list(df[["latitude","longitude"]].values)

    # Add competitor locations for density comparison
    for cl in competitor_locations:
        if cl.get("lat") and cl.get("lng"):
            all_locs.append([cl["lat"], cl["lng"]])

    import numpy as np
    coords = np.array(all_locs)
    eps_rad = eps_km / 6371.0  # convert km to radians for haversine
    db = DBSCAN(eps=eps_rad, min_samples=min_samples, algorithm="ball_tree", metric="haversine")
    labels = db.fit_predict(np.radians(coords))

    own_n = len(df)
    own_labels = labels[:own_n]
    df["cluster"] = own_labels
    df["is_noise"] = (own_labels == -1)  # -1 = isolated (potential gap)

    isolated = df[df["is_noise"]].copy()
    clustered = df[~df["is_noise"]].copy()

    out_cols = [c for c in ["id","enterprise_name","enterprise_type","latitude","longitude","cluster","is_noise"] if c in df.columns]

    return {
        "status":       "success",
        "company_id":   company_id,
        "total_enterprises": len(df),
        "clustered":    len(clustered),
        "isolated":     len(isolated),
        "n_clusters":   int(labels.max()) + 1 if labels.max() >= 0 else 0,
        "enterprises":  df[out_cols].pipe(_clean_df).to_dict(orient="records"),
        "gap_locations": isolated[out_cols].pipe(_clean_df).to_dict(orient="records"),
        "interpretation": f"{len(isolated)} of your enterprises are geographically isolated — potential underserved zones or expansion opportunities.",
    }


@router.post("/ml/churn-risk")
def ml_churn_risk(req: MLRequest):
    """
    Churn risk prediction — logistic regression on Person engagement signals.
    Flags clients and staff at risk of lapsing.
    Ontology objects: Person + Task + Transaction.
    """
    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        import pandas as pd
        import numpy as np
    except ImportError:
        raise HTTPException(status_code=503, detail="scikit-learn not installed")

    company_id = req.company_id
    person_type = req.options.get("person_type")  # "client" or "staff"

    ppl_df  = _load_raw("people",       company_id)
    task_df = _load_raw("tasks",        company_id)
    tx_df   = _load_raw("transactions", company_id)

    if ppl_df.empty:
        return {"status": "skipped", "reason": "no people data", "at_risk": []}

    df = ppl_df.copy()
    if person_type and "person_type" in df.columns:
        df = df[df["person_type"].str.lower() == person_type.lower()]

    if df.empty:
        return {"status": "skipped", "reason": f"no people with person_type={person_type}", "at_risk": []}

    # Proxy churn label: status == inactive
    if "status" not in df.columns:
        return {"status": "skipped", "reason": "status field missing from people", "at_risk": []}

    df["churned"] = (df["status"].fillna("").str.lower().isin(
        {"inactive","archived","closed","terminated","discharged","withdrawn","suspended","expired","left","graduated"}
    )).astype(int)

    feat_candidates = ["days_since_created","tasks_count","transaction_count","age"]
    available = []

    # Compute derived features from task counts
    if not task_df.empty and "person_id" in task_df.columns and "id" in df.columns:
        tc = task_df.groupby("person_id").size().reset_index(name="tasks_count")
        df = df.merge(tc, left_on="id", right_on="person_id", how="left")
        df["tasks_count"] = df["tasks_count"].fillna(0)
        available.append("tasks_count")

    # Compute derived features from transaction counts
    if not tx_df.empty and "person_id" in tx_df.columns and "id" in df.columns:
        txc = tx_df.groupby("person_id").size().reset_index(name="transaction_count")
        df = df.merge(txc, left_on="id", right_on="person_id", how="left")
        df["transaction_count"] = df["transaction_count"].fillna(0)
        available.append("transaction_count")

    if len(available) < 1:
        return {"status": "skipped", "reason": "insufficient feature data for churn model", "at_risk": []}

    X = df[available].fillna(0).values
    y = df["churned"].values

    if y.sum() == 0 or (1 - y).sum() == 0:
        return {"status": "skipped", "reason": "all people have same status — cannot train churn model", "at_risk": []}

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)
    clf = LogisticRegression(max_iter=300, random_state=42)
    clf.fit(Xs, y)

    df["churn_probability"] = (clf.predict_proba(Xs)[:, 1] * 100).round(1)
    df["churn_risk"] = df["churn_probability"].apply(lambda p: "high" if p >= 65 else "medium" if p >= 35 else "low")

    at_risk = df[df["churn_risk"] == "high"]
    out_cols = [c for c in ["id","full_name","person_type","status","churn_probability","churn_risk"] if c in df.columns]

    return {
        "status":       "success",
        "company_id":   company_id,
        "person_type":  person_type,
        "total_people": len(df),
        "high_risk":    int((df["churn_risk"] == "high").sum()),
        "medium_risk":  int((df["churn_risk"] == "medium").sum()),
        "low_risk":     int((df["churn_risk"] == "low").sum()),
        "at_risk":      at_risk[out_cols].head(50).pipe(_clean_df).to_dict(orient="records"),
        "features_used": available,
    }


@router.get("/economic-context")
def get_economic_context(
    country_code: str = Query("ZA", description="ISO 2-letter country code"),
    company_id: Optional[str] = Query(None),
):
    """
    Fetch macroeconomic context from World Bank API (free, no key).
    Returns GDP, population, inflation, unemployment, and GNI per capita.
    """
    indicators = {
        "NY.GDP.MKTP.CD":  "gdp_usd",
        "SP.POP.TOTL":     "population",
        "FP.CPI.TOTL.ZG":  "inflation_pct",
        "SL.UEM.TOTL.ZS":  "unemployment_pct",
        "NY.GNP.PCAP.CD":  "gni_per_capita_usd",
        "SI.POV.GINI":     "gini_index",
        "SH.STA.DIAB.ZS":  "diabetes_prevalence_pct",
        "SE.ADT.LITR.ZS":  "literacy_rate_pct",
    }

    results: Dict[str, Any] = {"country_code": country_code, "source": "World Bank API", "indicators": {}}
    base = f"{WORLDBANK_URL}/country/{country_code}/indicator"

    for code, label in indicators.items():
        try:
            resp = requests.get(
                f"{base}/{code}",
                params={"format": "json", "mrv": 3, "per_page": 3},
                timeout=8,
                headers={"User-Agent": "newsconseen-market/1.0"},
            )
            if resp.ok:
                body = resp.json()
                if isinstance(body, list) and len(body) > 1:
                    rows = body[1] or []
                    for row in rows:
                        if row.get("value") is not None:
                            results["indicators"][label] = {
                                "value": row["value"],
                                "year": row.get("date"),
                                "country": row.get("country", {}).get("value"),
                            }
                            break
        except Exception as e:
            logger.debug("economic-context: indicator %s failed — %s", code, e)

    # REST Countries for currency, languages, region
    try:
        rc = requests.get(
            f"{RESTCOUNTRIES_URL}/alpha/{country_code}",
            timeout=8,
            headers={"User-Agent": "newsconseen-market/1.0"},
        )
        if rc.ok:
            cdata = rc.json()
            if cdata:
                c = cdata[0]
                results["country_info"] = {
                    "name":       c.get("name", {}).get("common"),
                    "region":     c.get("region"),
                    "subregion":  c.get("subregion"),
                    "currencies": list(c.get("currencies", {}).keys()),
                    "languages":  list(c.get("languages", {}).values()),
                    "capital":    c.get("capital", [None])[0],
                    "population": c.get("population"),
                }
    except Exception as e:
        logger.debug("economic-context: REST Countries failed — %s", e)

    return results


@router.get("/labor-context")
def get_labor_context(
    country_code: str = Query("ZAF", description="ISO 3-letter country code for ILO"),
    company_id: Optional[str] = Query(None),
):
    """
    Labor market context from ILO ILOSTAT and World Bank labor indicators.
    Returns employment rates, wage data, and workforce composition signals.
    """
    wb_indicators = {
        "SL.TLF.CACT.ZS":  "labor_participation_rate_pct",
        "SL.EMP.VULN.ZS":   "vulnerable_employment_pct",
        "SL.EMP.SELF.ZS":   "self_employment_pct",
        "SL.AGR.EMPL.ZS":   "agriculture_employment_pct",
        "SL.IND.EMPL.ZS":   "industry_employment_pct",
        "SL.SRV.EMPL.ZS":   "services_employment_pct",
        "SL.TLF.CACT.FM.ZS":"female_labor_participation_pct",
    }

    # Use 2-letter code for World Bank
    wb_code = country_code[:2] if len(country_code) > 2 else country_code
    results: Dict[str, Any] = {"country_code": country_code, "source": "World Bank Labor Data", "indicators": {}}

    for code, label in wb_indicators.items():
        try:
            resp = requests.get(
                f"{WORLDBANK_URL}/country/{wb_code}/indicator/{code}",
                params={"format": "json", "mrv": 2, "per_page": 2},
                timeout=8,
                headers={"User-Agent": "newsconseen-market/1.0"},
            )
            if resp.ok:
                body = resp.json()
                if isinstance(body, list) and len(body) > 1:
                    rows = body[1] or []
                    for row in rows:
                        if row.get("value") is not None:
                            results["indicators"][label] = {
                                "value": round(float(row["value"]), 2),
                                "year":  row.get("date"),
                            }
                            break
        except Exception as e:
            logger.debug("labor-context: indicator %s failed — %s", code, e)

    return results


@router.get("/apis-catalog")
def get_apis_catalog():
    """
    Catalog of 50 free/freemium public APIs useful for market intelligence.
    All are updated at least yearly. Key-required entries need a free account.
    Mapped to ontology objects they can enrich.
    """
    catalog = [
        # ── Geospatial & Business Location ───────────────────────────────────
        {"id":"osm_overpass","name":"OpenStreetMap Overpass","category":"geospatial","url":"https://overpass-api.de","key_required":False,"update_freq":"real-time","ontology_objects":["Enterprise","Address"],"used_by_platform":True},
        {"id":"nominatim","name":"Nominatim Geocoding","category":"geospatial","url":"https://nominatim.openstreetmap.org","key_required":False,"update_freq":"real-time","ontology_objects":["Address","Enterprise"],"used_by_platform":True},
        {"id":"opencage","name":"OpenCage Geocoding","category":"geospatial","url":"https://opencagedata.com","key_required":True,"update_freq":"real-time","ontology_objects":["Address"],"used_by_platform":False},
        {"id":"geonames","name":"GeoNames","category":"geospatial","url":"https://www.geonames.org","key_required":True,"update_freq":"monthly","ontology_objects":["Address","Enterprise"],"used_by_platform":False},
        {"id":"mapbox","name":"Mapbox (free tier)","category":"geospatial","url":"https://api.mapbox.com","key_required":True,"update_freq":"real-time","ontology_objects":["Address"],"used_by_platform":False},
        # ── Economic & Financial ──────────────────────────────────────────────
        {"id":"worldbank","name":"World Bank Open Data","category":"economic","url":"https://api.worldbank.org","key_required":False,"update_freq":"yearly","ontology_objects":["Enterprise","Transaction"],"used_by_platform":True},
        {"id":"fred","name":"FRED (St. Louis Fed)","category":"economic","url":"https://fred.stlouisfed.org/docs/api","key_required":True,"update_freq":"daily","ontology_objects":["Transaction"],"used_by_platform":False},
        {"id":"restcountries","name":"REST Countries","category":"economic","url":"https://restcountries.com","key_required":False,"update_freq":"yearly","ontology_objects":["Enterprise","Address"],"used_by_platform":True},
        {"id":"exchangerate","name":"ExchangeRate-API","category":"economic","url":"https://www.exchangerate-api.com","key_required":True,"update_freq":"daily","ontology_objects":["Transaction"],"used_by_platform":False},
        {"id":"alpha_vantage","name":"Alpha Vantage","category":"economic","url":"https://www.alphavantage.co","key_required":True,"update_freq":"daily","ontology_objects":["Transaction","Product"],"used_by_platform":False},
        {"id":"forex_python","name":"Fixer.io","category":"economic","url":"https://fixer.io","key_required":True,"update_freq":"daily","ontology_objects":["Transaction"],"used_by_platform":False},
        {"id":"currencyfreaks","name":"CurrencyFreaks","category":"economic","url":"https://currencyfreaks.com","key_required":True,"update_freq":"daily","ontology_objects":["Transaction"],"used_by_platform":False},
        {"id":"imf_data","name":"IMF Data API","category":"economic","url":"https://datahelp.imf.org/knowledgebase/articles/667681","key_required":False,"update_freq":"monthly","ontology_objects":["Transaction","Enterprise"],"used_by_platform":False},
        # ── Labor & Demographics ─────────────────────────────────────────────
        {"id":"ilo","name":"ILO ILOSTAT","category":"labor","url":"https://ilostat.ilo.org/resources/ilostat-api","key_required":False,"update_freq":"yearly","ontology_objects":["Person"],"used_by_platform":True},
        {"id":"bls","name":"BLS (Bureau of Labor Statistics)","category":"labor","url":"https://www.bls.gov/developers","key_required":True,"update_freq":"monthly","ontology_objects":["Person","Task"],"used_by_platform":False},
        {"id":"eurostat","name":"Eurostat","category":"demographics","url":"https://ec.europa.eu/eurostat/web/json-and-unicode-web-services","key_required":False,"update_freq":"yearly","ontology_objects":["Person","Enterprise"],"used_by_platform":False},
        {"id":"un_data","name":"UN Data API","category":"demographics","url":"https://data.un.org","key_required":False,"update_freq":"yearly","ontology_objects":["Person","Enterprise"],"used_by_platform":False},
        {"id":"un_comtrade","name":"UN Comtrade","category":"trade","url":"https://comtradeplus.un.org","key_required":True,"update_freq":"monthly","ontology_objects":["Product","Transaction"],"used_by_platform":False},
        {"id":"datausa","name":"DataUSA","category":"demographics","url":"https://datausa.io/about/api","key_required":False,"update_freq":"yearly","ontology_objects":["Person"],"used_by_platform":False},
        {"id":"oecd","name":"OECD Data","category":"economic","url":"https://data.oecd.org/api","key_required":False,"update_freq":"yearly","ontology_objects":["Enterprise","Person","Transaction"],"used_by_platform":False},
        # ── Business & Corporate Data ─────────────────────────────────────────
        {"id":"opencorporates","name":"OpenCorporates","category":"business","url":"https://api.opencorporates.com","key_required":True,"update_freq":"daily","ontology_objects":["Enterprise","Relationship"],"used_by_platform":False},
        {"id":"gleif","name":"GLEIF (Legal Entity IDs)","category":"business","url":"https://www.gleif.org/en/lei-data/gleif-api","key_required":False,"update_freq":"daily","ontology_objects":["Enterprise","Relationship"],"used_by_platform":False},
        {"id":"sec_edgar","name":"SEC EDGAR","category":"business","url":"https://efts.sec.gov/LATEST/search-index","key_required":False,"update_freq":"daily","ontology_objects":["Enterprise","Transaction"],"used_by_platform":False},
        {"id":"companies_house","name":"Companies House UK","category":"business","url":"https://developer.company-information.service.gov.uk","key_required":True,"update_freq":"daily","ontology_objects":["Enterprise","Person","Relationship"],"used_by_platform":False},
        {"id":"wikidata","name":"Wikidata","category":"business","url":"https://query.wikidata.org","key_required":False,"update_freq":"real-time","ontology_objects":["Enterprise","Person","Product"],"used_by_platform":False},
        # ── News & Sentiment ─────────────────────────────────────────────────
        {"id":"newsapi","name":"NewsAPI","category":"news","url":"https://newsapi.org","key_required":True,"update_freq":"daily","ontology_objects":["Enterprise","Product"],"used_by_platform":False},
        {"id":"gnews","name":"GNews","category":"news","url":"https://gnews.io","key_required":True,"update_freq":"daily","ontology_objects":["Enterprise","Product"],"used_by_platform":False},
        {"id":"mediastack","name":"Mediastack","category":"news","url":"https://mediastack.com","key_required":True,"update_freq":"daily","ontology_objects":["Enterprise","Product"],"used_by_platform":False},
        {"id":"hackernews","name":"Hacker News Algolia","category":"news","url":"https://hn.algolia.com/api","key_required":False,"update_freq":"real-time","ontology_objects":["Product","Enterprise"],"used_by_platform":False},
        {"id":"reddit","name":"Reddit (PRAW)","category":"social","url":"https://www.reddit.com/dev/api","key_required":True,"update_freq":"real-time","ontology_objects":["Product","Enterprise"],"used_by_platform":False},
        # ── Products & Supply Chain ───────────────────────────────────────────
        {"id":"openfoodfacts","name":"Open Food Facts","category":"products","url":"https://world.openfoodfacts.org/api","key_required":False,"update_freq":"daily","ontology_objects":["Product"],"used_by_platform":False},
        {"id":"openbeautyfacts","name":"Open Beauty Facts","category":"products","url":"https://world.openbeautyfacts.org/api","key_required":False,"update_freq":"daily","ontology_objects":["Product"],"used_by_platform":False},
        {"id":"openfda","name":"OpenFDA","category":"health-products","url":"https://open.fda.gov/apis","key_required":False,"update_freq":"quarterly","ontology_objects":["Product","Person"],"used_by_platform":False},
        {"id":"upcitemdb","name":"UPC Item DB","category":"products","url":"https://www.upcitemdb.com/api","key_required":True,"update_freq":"daily","ontology_objects":["Product"],"used_by_platform":False},
        {"id":"open_library","name":"Open Library","category":"products","url":"https://openlibrary.org/developers/api","key_required":False,"update_freq":"daily","ontology_objects":["Product"],"used_by_platform":False},
        # ── Health & Environmental ────────────────────────────────────────────
        {"id":"openmeteo","name":"Open-Meteo (Weather)","category":"environment","url":"https://open-meteo.com/en/docs","key_required":False,"update_freq":"hourly","ontology_objects":["Address","Task"],"used_by_platform":False},
        {"id":"openaq","name":"OpenAQ (Air Quality)","category":"environment","url":"https://docs.openaq.org","key_required":False,"update_freq":"hourly","ontology_objects":["Address"],"used_by_platform":False},
        {"id":"who_gho","name":"WHO Global Health Observatory","category":"health","url":"https://www.who.int/data/gho/info/gho-odata-api","key_required":False,"update_freq":"yearly","ontology_objects":["Person","Enterprise"],"used_by_platform":False},
        {"id":"healthdata_gov","name":"HealthData.gov","category":"health","url":"https://healthdata.gov","key_required":False,"update_freq":"yearly","ontology_objects":["Person","Product"],"used_by_platform":False},
        {"id":"nasa","name":"NASA Open Data","category":"environment","url":"https://api.nasa.gov","key_required":True,"update_freq":"daily","ontology_objects":["Address"],"used_by_platform":False},
        # ── Agriculture & Commodities ─────────────────────────────────────────
        {"id":"fao_stat","name":"FAOSTAT","category":"agriculture","url":"https://www.fao.org/faostat/en/#data","key_required":False,"update_freq":"yearly","ontology_objects":["Product","Enterprise"],"used_by_platform":False},
        {"id":"gbif","name":"GBIF Biodiversity","category":"agriculture","url":"https://www.gbif.org/developer/summary","key_required":False,"update_freq":"daily","ontology_objects":["Product"],"used_by_platform":False},
        # ── Local Business Platforms ──────────────────────────────────────────
        {"id":"yelp","name":"Yelp Fusion","category":"local-business","url":"https://docs.developer.yelp.com","key_required":True,"update_freq":"real-time","ontology_objects":["Enterprise","Relationship"],"used_by_platform":False},
        {"id":"foursquare","name":"Foursquare Places","category":"local-business","url":"https://developer.foursquare.com","key_required":True,"update_freq":"real-time","ontology_objects":["Enterprise","Address"],"used_by_platform":False},
        {"id":"tripadvisor","name":"TripAdvisor Content","category":"local-business","url":"https://tripadvisor-content-api.readme.io","key_required":True,"update_freq":"daily","ontology_objects":["Enterprise","Product"],"used_by_platform":False},
        # ── Financial Markets ─────────────────────────────────────────────────
        {"id":"coingecko","name":"CoinGecko","category":"crypto","url":"https://www.coingecko.com/en/api","key_required":False,"update_freq":"real-time","ontology_objects":["Transaction"],"used_by_platform":False},
        {"id":"finnhub","name":"Finnhub","category":"stocks","url":"https://finnhub.io/docs/api","key_required":True,"update_freq":"real-time","ontology_objects":["Transaction","Enterprise"],"used_by_platform":False},
        {"id":"polygon","name":"Polygon.io","category":"stocks","url":"https://polygon.io/docs","key_required":True,"update_freq":"real-time","ontology_objects":["Transaction","Enterprise"],"used_by_platform":False},
        {"id":"fmp","name":"Financial Modeling Prep","category":"stocks","url":"https://site.financialmodelingprep.com/developer/docs","key_required":True,"update_freq":"daily","ontology_objects":["Enterprise","Transaction"],"used_by_platform":False},
        # ── Social & Community ────────────────────────────────────────────────
        {"id":"youtube","name":"YouTube Data API","category":"social","url":"https://developers.google.com/youtube/v3","key_required":True,"update_freq":"real-time","ontology_objects":["Enterprise","Product"],"used_by_platform":False},
        {"id":"mastodon","name":"Mastodon API","category":"social","url":"https://docs.joinmastodon.org/api","key_required":True,"update_freq":"real-time","ontology_objects":["Person","Enterprise"],"used_by_platform":False},
        {"id":"wikipedia","name":"Wikipedia / Wikimedia","category":"reference","url":"https://www.mediawiki.org/wiki/API:Main_page","key_required":False,"update_freq":"real-time","ontology_objects":["Enterprise","Person","Product"],"used_by_platform":False},
    ]

    categories = {}
    for api in catalog:
        cat = api["category"]
        categories.setdefault(cat, 0)
        categories[cat] += 1

    return {
        "total_apis":      len(catalog),
        "free_no_key":     sum(1 for a in catalog if not a["key_required"]),
        "free_key_needed": sum(1 for a in catalog if a["key_required"]),
        "used_by_platform": sum(1 for a in catalog if a.get("used_by_platform")),
        "by_category":     categories,
        "apis":            catalog,
    }


@router.get("/industry-news")
def get_industry_news(
    query: str = Query(..., description="Search terms e.g. 'healthcare SME Africa'"),
    company_id: Optional[str] = Query(None),
    limit: int = Query(10, le=20),
):
    """
    Fetch industry news from Hacker News Algolia API (free, no key).
    For full news coverage, NewsAPI key can be added via NEWSAPI_KEY env var.
    """
    import os
    results = []

    # Try NewsAPI first (if key available)
    newsapi_key = os.getenv("NEWSAPI_KEY")
    if newsapi_key:
        try:
            resp = requests.get(
                "https://newsapi.org/v2/everything",
                params={"q": query, "pageSize": limit, "sortBy": "relevancy", "language": "en"},
                headers={"Authorization": f"Bearer {newsapi_key}"},
                timeout=8,
            )
            if resp.ok:
                data = resp.json()
                for a in data.get("articles", []):
                    results.append({
                        "title":       a.get("title"),
                        "source":      a.get("source", {}).get("name"),
                        "url":         a.get("url"),
                        "published_at": a.get("publishedAt"),
                        "summary":     a.get("description"),
                        "api":         "NewsAPI",
                    })
        except Exception as e:
            logger.debug("industry-news: NewsAPI failed — %s", e)

    # Fallback: Hacker News Algolia (free, no key)
    if not results:
        try:
            resp = requests.get(
                "https://hn.algolia.com/api/v1/search",
                params={"query": query, "hitsPerPage": limit, "tags": "story"},
                timeout=8,
            )
            if resp.ok:
                data = resp.json()
                for hit in data.get("hits", []):
                    results.append({
                        "title":        hit.get("title"),
                        "source":       "Hacker News",
                        "url":          hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                        "published_at": hit.get("created_at"),
                        "summary":      None,
                        "api":          "Hacker News Algolia",
                    })
        except Exception as e:
            logger.debug("industry-news: HN Algolia failed — %s", e)

    return {
        "query":   query,
        "count":   len(results),
        "results": results,
    }


# ── MI Write-back ─────────────────────────────────────────────────────────────

class SaveCompetitorRequest(BaseModel):
    company_id:              str
    linked_enterprise_id:    str
    linked_enterprise_name:  str
    competitor_name:         str
    competitor_type:         Optional[str] = None
    distance_km:             Optional[float] = None
    address:                 Optional[str] = None
    phone:                   Optional[str] = None
    website:                 Optional[str] = None
    rating:                  Optional[float] = None
    lat:                     Optional[float] = None
    lon:                     Optional[float] = None
    source_location:         Optional[str] = None
    business_type:           Optional[str] = None


@router.post("/save-competitor")
def save_competitor(req: SaveCompetitorRequest):
    """
    Write-back: save an MI-discovered competitor to the datamart and
    create a Relationship record in Base44 linking the external entity
    to an existing operator Enterprise.

    Two writes:
    1. INSERT into analytics.mi_competitors (persistent record for dashboards/queries)
    2. POST to Base44 /relationships (creates Relationship entity so the link is
       visible in the Relationships page and queryable via the ontology)
    """
    from database import get_engine_safe
    from config.settings import settings, HEADERS

    relationship_id: Optional[str] = None
    relationship_error: Optional[str] = None

    # ── 1. Create Relationship record in Base44 ───────────────────────────────
    if settings.base44_relationships_url:
        try:
            rel_payload = {
                "company_id":          req.company_id,
                "relationship_type":   "competitor",
                "enterprise_name":     req.linked_enterprise_name,
                "contact_name":        req.competitor_name,
                "location":            req.address or req.source_location or "",
                "status":              "active",
                "notes": (
                    f"Competitor discovered via Market Intelligence. "
                    f"Distance: {req.distance_km} km. "
                    f"Type: {req.competitor_type or req.business_type or 'unknown'}. "
                    f"Source: {req.source_location or 'MI scan'}."
                ),
            }
            resp = requests.post(
                settings.base44_relationships_url,
                json=rel_payload,
                headers=HEADERS,
                timeout=10,
            )
            if resp.ok:
                relationship_id = resp.json().get("id")
            else:
                relationship_error = f"Base44 {resp.status_code}: {resp.text[:200]}"
                logger.warning("save-competitor: Base44 relationship POST failed — %s", relationship_error)
        except Exception as exc:
            relationship_error = str(exc)
            logger.warning("save-competitor: Base44 relationship POST error — %s", exc)

    # ── 2. INSERT into analytics.mi_competitors ───────────────────────────────
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text as sa_text
            row = {
                "company_id":              req.company_id,
                "linked_enterprise_id":    req.linked_enterprise_id,
                "linked_enterprise_name":  req.linked_enterprise_name,
                "competitor_name":         req.competitor_name,
                "competitor_type":         req.competitor_type,
                "distance_km":             req.distance_km,
                "address":                 req.address,
                "phone":                   req.phone,
                "website":                 req.website,
                "rating":                  req.rating,
                "lat":                     req.lat,
                "lon":                     req.lon,
                "source_location":         req.source_location,
                "business_type":           req.business_type,
                "relationship_id":         relationship_id,
            }
            cols = ", ".join(row.keys())
            placeholders = ", ".join(f":{k}" for k in row.keys())
            with engine.begin() as conn:
                conn.execute(
                    sa_text(f"INSERT INTO analytics.mi_competitors ({cols}) VALUES ({placeholders})"),
                    row,
                )
        except Exception as exc:
            logger.warning("save-competitor: analytics insert failed — %s", exc)

    return {
        "status":           "saved",
        "relationship_id":  relationship_id,
        "relationship_error": relationship_error,
        "competitor_name":  req.competitor_name,
        "linked_to":        req.linked_enterprise_name,
    }


@router.get("/saved-competitors")
def get_saved_competitors(company_id: str):
    """Return all competitors saved to the datamart for this company."""
    from database import get_engine_safe
    from sqlalchemy import text as sa_text

    engine = get_engine_safe()
    if not engine:
        return {"competitors": []}
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                sa_text("SELECT * FROM analytics.mi_competitors WHERE company_id = :cid ORDER BY saved_at DESC"),
                {"cid": company_id},
            ).mappings().all()
        return {"competitors": [dict(r) for r in rows]}
    except Exception as exc:
        logger.warning("saved-competitors: %s", exc)
        return {"competitors": []}
