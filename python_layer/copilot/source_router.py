"""
Source Registry Router for Idjwi.

This module lets the default Newsconseen brain reason over every source in
docs/source_registry.json before tenant data exists. It can execute only
public-safe read tools; tenant reads/writes remain behind the existing Idjwi
capability gate.
"""

from __future__ import annotations

import re
from typing import Any, Callable, Optional

from .idjwi_brain import INDUSTRY_MEMORY, load_source_registry
from .idjwi_security import authorize_capability
from .llm_registry import capability_for_tool


PUBLIC_DATASET_BY_SOURCE = {
    "world_bank": "world_bank",
    "un_data": "un_data",
    "us_census": "us_census",
    "open_fda": "open_fda",
    "osm_overpass": "osm_count",
    "exchange_rates": "fx_rates",
    "open_meteo": "weather",
    "soilgrids": "soil",
    "faostat": "faostat",
    "cms": "cms_pharmacy",
}


SOURCE_SYNONYMS = {
    "world_bank": [
        "gdp", "gdp per capita", "gdp growth", "inflation", "unemployment",
        "population", "life expectancy", "literacy", "health spending",
        "education spending", "internet users", "mobile subscriptions",
        "world bank", "economic indicator", "macro", "country economy",
    ],
    "un_data": [
        "un data", "hdi", "development", "fertility", "infant mortality",
        "education indicator", "development indicator",
    ],
    "us_census": [
        "census", "demographics", "median income", "household income",
        "population in", "acs", "catchment", "local market",
    ],
    "gdelt": [
        "news", "media", "mentions", "sentiment", "reputation",
        "event risk", "market signals",
    ],
    "osm_overpass": [
        "competitors", "nearby", "points of interest", "poi", "amenities",
        "openstreetmap", "overpass", "business count", "pharmacies near",
        "shops near", "hospitals near",
    ],
    "nominatim": [
        "geocode", "reverse geocode", "coordinates", "latitude",
        "longitude", "address lookup", "map placement",
    ],
    "rest_countries": [
        "country code", "currency", "languages", "region", "subregion",
        "rest countries",
    ],
    "open_meteo": [
        "weather", "forecast", "rain", "temperature", "air quality",
        "evapotranspiration", "humidity", "wind",
    ],
    "soilgrids": [
        "soil", "soil ph", "organic carbon", "clay", "sand", "silt",
        "soil texture", "crop suitability",
    ],
    "faostat": [
        "faostat", "crop production", "yield", "crop price", "commodity",
        "wheat", "maize", "rice", "cassava", "coffee",
    ],
    "nasa_power": [
        "climate", "rainfall history", "solar radiation", "wind history",
        "temperature history", "nasa power",
    ],
    "usda_nass_ams": [
        "usda", "nass", "ams", "crop prices", "market reports",
        "us farm", "us agriculture",
    ],
    "cms": ["cms", "medicare", "medicaid", "provider context", "clinic benchmark"],
    "nppes_npi": ["npi", "nppes", "provider verification", "taxonomy", "doctor lookup"],
    "open_fda": [
        "fda", "openfda", "drug label", "recall", "device recall",
        "food enforcement", "adverse event", "medication safety",
    ],
    "rxnorm": ["rxnorm", "rx cui", "drug normalize", "medication normalize"],
    "open_food_facts": [
        "open food facts", "ingredients", "nutrition", "allergen", "barcode food",
    ],
    "upc_item_db": ["upc", "barcode", "sku lookup", "product barcode"],
    "pubchem": ["pubchem", "chemical", "cas", "compound", "hazard"],
    "nhtsa": ["nhtsa", "vin", "vehicle recall", "fleet safety"],
    "ofac_sanctions": ["ofac", "sanctions", "aml", "screen supplier", "watchlist"],
    "world_governance_indicators": [
        "governance", "rule of law", "corruption", "political stability",
    ],
    "exchange_rates": ["exchange rate", "exchange rates", "currency rate", "fx rate", "forex"],
    "quickbooks_xero_sage": ["quickbooks", "xero", "sage", "accounting connector"],
    "stripe": ["stripe", "payments", "charge", "payout", "refund", "dispute"],
    "canvas_google_classroom": ["canvas", "google classroom", "education connector"],
    "mtn_momo_wave": ["mtn momo", "wave", "mobile money"],
    "npm_pypi": ["npm", "pypi", "package", "dependency", "software supply chain"],
}


COUNTRY_ALIASES = {
    "usa": "USA",
    "u.s.a": "USA",
    "u.s.": "USA",
    "united states": "USA",
    "america": "USA",
    "uk": "GBR",
    "united kingdom": "GBR",
    "great britain": "GBR",
}


def _norm(value: Any) -> str:
    return str(value or "").lower().replace("_", " ").strip()


def _tokens(value: str) -> set[str]:
    stop = {
        "the", "a", "an", "of", "for", "in", "on", "to", "and", "or", "me",
        "give", "show", "tell", "what", "how", "can", "you", "with", "from",
        "data", "api", "source", "sources", "public", "enrich", "enrichment",
    }
    return {t for t in re.findall(r"[a-z0-9]+", _norm(value)) if len(t) > 2 and t not in stop}


def _extract_location(question: str) -> str:
    q = question.strip()
    lower = q.lower()
    latlon = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", q)
    if latlon:
        return f"{latlon.group(1)},{latlon.group(2)}"
    for key, code in COUNTRY_ALIASES.items():
        if key in lower:
            return code
    match = re.search(
        r"\b(?:of|for|in|near|around|at)\s+([a-z][a-z\s,.-]{1,60}?)(?:\?|$|\.|,|\s+for\s+|\s+about\s+)",
        lower,
    )
    if match:
        return match.group(1).strip(" ,.-")
    return ""


def _extract_currency(question: str) -> str:
    match = re.search(r"\b([A-Z]{3})\b", question)
    return match.group(1).upper() if match else "USD"


def _extract_commodity(question: str) -> str:
    for item in ("wheat", "maize", "corn", "rice", "cassava", "coffee", "cocoa", "beans", "soybean"):
        if item in question.lower():
            return item.title()
    return question


def _extract_query_for_dataset(dataset: str, question: str) -> str:
    if dataset == "fx_rates":
        return _extract_currency(question)
    if dataset == "faostat":
        return _extract_commodity(question)
    if dataset == "open_fda":
        cleaned = re.sub(r"\b(openfda|fda|drug label|recall|device|food enforcement)\b", "", question, flags=re.I)
        return cleaned.strip(" ?.,") or question
    if dataset in ("weather", "soil", "osm_count"):
        return question
    return question


def _can_fill_requirement(requirement: str, question: str, dataset: str = "") -> bool:
    req = _norm(requirement)
    location = _extract_location(question)
    if req in {"country", "country code", "country name or code"}:
        return bool(location)
    if req in {"indicator", "variable"}:
        return bool(_tokens(question))
    if req in {"latitude", "longitude"}:
        return bool(re.search(r"-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?", question) or location)
    if req in {"address text", "state", "county or place", "state or market"}:
        return bool(location)
    if req in {"base currency", "target currency"}:
        return bool(_extract_currency(question))
    if req in {"commodity", "product name", "drug name or device name", "medication name", "barcode", "barcode or product name", "compound name or cas", "vin or vehicle model", "package name", "provider name or npi", "name"}:
        return len(_tokens(question)) > 0
    if "connector auth" in req or "tenant" in req or "mapping" in req:
        return False
    if dataset in ("weather", "soil") and req in {"latitude", "longitude"}:
        return bool(location)
    return False


def _scores_for_source(src: dict[str, Any], question: str) -> int:
    q = _norm(question)
    q_tokens = _tokens(question)
    sid = src.get("source_id", "")
    synonyms = SOURCE_SYNONYMS.get(sid, [])
    score = sum(5 for phrase in synonyms if phrase in q)
    if _norm(sid) in q or sid.replace("_", " ") in q:
        score += 8
    if _norm(src.get("provider")) and _norm(src.get("provider")) in q:
        score += 5
    haystack_parts = [
        src.get("category", ""),
        src.get("source_type", ""),
        " ".join(src.get("entities_enriched", [])),
        " ".join(src.get("fields_created", [])),
        " ".join(src.get("used_for", [])),
        " ".join(src.get("risk_effects", [])),
        " ".join(src.get("requires", [])),
        " ".join(src.get("tools", [])),
    ]
    haystack = _tokens(" ".join(haystack_parts))
    score += len(q_tokens & haystack)
    for industry, memory in INDUSTRY_MEMORY.items():
        if industry in q and sid in set(memory.get("priority_sources", [])):
            score += 6
    return score


def _rank_sources(question: str) -> list[dict[str, Any]]:
    scored = []
    for src in load_source_registry():
        score = _scores_for_source(src, question)
        if score > 0:
            scored.append({**src, "match_score": score})
    scored.sort(key=lambda item: (item["match_score"], item.get("confidence") == "high"), reverse=True)
    return scored


def _scope_for_source(src: dict[str, Any], question: str) -> dict[str, Any]:
    q = _norm(question)
    write_terms = [
        "save", "write", "update", "create", "import", "sync", "connect",
        "attach", "stamp", "load into", "add to company", "add this",
    ]
    if any(term in q for term in write_terms):
        return {
            "access_level": "tenant_plus_approval_required",
            "capability": "propose_record_update",
            "reason": "The request would change or stamp tenant data.",
        }
    if src.get("source_type") == "connector_data":
        return {
            "access_level": "tenant_required",
            "capability": "read_company_data",
            "reason": "Connector data belongs to the operator and requires tenant authorization.",
        }
    return {
        "access_level": "public_default_allowed",
        "capability": "read_public_data",
        "reason": "This is a public/default source and does not require tenant records.",
    }


def _answer_for_plan(route: dict[str, Any]) -> str:
    source = route.get("source") or {}
    alternatives = route.get("alternatives") or []
    lines = [
        f"**Source route: {source.get('provider', source.get('source_id', 'Unknown source'))}**",
        f"- Source id: `{source.get('source_id')}`",
        f"- Category: {source.get('category', 'unknown')}",
        f"- Access level: `{route.get('access_level')}`",
        f"- Capability: `{route.get('capability')}`",
    ]
    if route.get("status") == "executed":
        lines.append(f"- Tool executed: `{route.get('tool')}`")
        lines.append(f"- Tool input: `{route.get('tool_input')}`")
    else:
        lines.append(f"- Status: {route.get('status', 'planned')}")
    if route.get("missing_inputs"):
        lines.append("- Missing before execution: " + ", ".join(f"`{item}`" for item in route["missing_inputs"]))
    if source.get("fields_created"):
        lines.append("- Fields/enrichment it can create: " + ", ".join(source["fields_created"][:6]))
    if source.get("used_for"):
        lines.append("- Used for: " + ", ".join(source["used_for"][:4]))
    if source.get("limits"):
        lines.append("- Caveat: " + "; ".join(source["limits"][:2]))
    if alternatives:
        lines.append("- Other relevant sources: " + ", ".join(a.get("source_id", "") for a in alternatives[:4]))
    if route.get("message"):
        lines.append("")
        lines.append(route["message"])
    return "\n".join(lines)


def _format_execution_result(route: dict[str, Any]) -> str:
    result = route.get("result") or {}
    source = route.get("source") or {}
    dataset = result.get("dataset") or route.get("dataset")
    if result.get("error"):
        route["message"] = result.get("note") or f"I selected `{source.get('source_id')}` but the public API returned: {result.get('error')}"
        return _answer_for_plan(route)
    data = result.get("data") or result.get("results") or []
    lines = [
        f"**{source.get('provider', source.get('source_id'))} result**",
        f"- Source id: `{source.get('source_id')}`",
        f"- Dataset/tool: `{dataset}` via `{route.get('tool')}`",
        f"- Access level: `{route.get('access_level')}`",
    ]
    if result.get("indicator_name"):
        lines.append(f"- Indicator: {result.get('indicator_name')}")
    if result.get("location") or result.get("country"):
        lines.append(f"- Location: {result.get('location') or result.get('country')}")
    if result.get("count") not in (None, ""):
        lines.append(f"- Count: {result.get('count')}")
    if isinstance(data, list) and data:
        lines.append("")
        lines.append("Sample rows:")
        for row in data[:5]:
            if isinstance(row, dict):
                shown = ", ".join(f"{k}: {v}" for k, v in list(row.items())[:5])
                lines.append(f"- {shown}")
            else:
                lines.append(f"- {row}")
    if result.get("rates"):
        lines.append("")
        lines.append("Rates:")
        for code, value in list(result["rates"].items())[:10]:
            lines.append(f"- {code}: {value}")
    if result.get("note"):
        lines.append("")
        lines.append(result["note"])
    return "\n".join(lines)


def route_source_request(
    question: str,
    company_id: str = "",
    principal=None,
    execute_tool_fn: Optional[Callable[..., dict]] = None,
) -> dict[str, Any]:
    """
    Route a source/enrichment/public API question through source_registry.json.

    Returns a dict with answer, status, access_level, selected source, optional
    executed tool/result, and missing inputs.
    """
    ranked = _rank_sources(question)
    if not ranked:
        return {"matched": False, "answer": "", "tools_called": [], "data": {}}

    source = ranked[0]
    scope = _scope_for_source(source, question)
    dataset = PUBLIC_DATASET_BY_SOURCE.get(source.get("source_id"))
    executable = bool(dataset and execute_tool_fn)
    missing = [
        req for req in source.get("requires", [])
        if not _can_fill_requirement(req, question, dataset or "")
    ]

    route = {
        "matched": True,
        "status": "planned",
        "source": source,
        "alternatives": ranked[1:6],
        "access_level": scope["access_level"],
        "capability": scope["capability"],
        "security_reason": scope["reason"],
        "dataset": dataset,
        "missing_inputs": missing,
        "tools_called": [],
        "data": {},
    }

    gate = authorize_capability(scope["capability"], principal=principal, llm_available=False)
    if not gate.get("allowed"):
        route["status"] = "blocked_by_security"
        route["message"] = gate.get("reason", "This source route is not allowed for the current caller.")
        route["answer"] = _answer_for_plan(route)
        return route

    if missing or not executable or scope["access_level"] != "public_default_allowed":
        route["status"] = "needs_inputs" if missing else "advisory_only"
        if not executable:
            route["message"] = (
                "I can choose this source from the registry, but this build does not yet "
                "have a direct executable wrapper for it. I can still explain the source, "
                "required inputs, enrichment fields, and security level."
            )
        route["answer"] = _answer_for_plan(route)
        return route

    tool_input = {
        "company_id": company_id,
        "dataset": dataset,
        "query": _extract_query_for_dataset(dataset, question),
        "location": _extract_location(question),
    }
    result = execute_tool_fn(
        "search_public_data",
        tool_input,
        company_id,
        principal=principal,
        llm_available=False,
    )
    route.update({
        "status": "executed",
        "tool": "search_public_data",
        "tool_input": tool_input,
        "result": result,
        "tools_called": ["source_registry_router", "search_public_data"],
    })
    route["data"] = {
        "source_registry_router": {
            "status": route["status"],
            "source": source,
            "alternatives": ranked[1:6],
            "access_level": route["access_level"],
            "capability": route["capability"],
            "dataset": dataset,
            "tool_input": tool_input,
        },
        "search_public_data": result,
    }
    route["answer"] = _format_execution_result(route)
    return route
