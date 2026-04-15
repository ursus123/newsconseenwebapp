"""
enrichment/compliance/sanctions.py
------------------------------------
Phase C — OFAC SDN (Specially Designated Nationals) list screening.

Source : US Treasury OFAC — https://www.treasury.gov/ofac/downloads/sdn.xml
         Public domain. No API key required.

Strategy:
  1. Download the SDN XML list once; cache in-process for 24 hours.
  2. Build a normalized name index: {normalized_name: (uid, sdnType, programs)}.
  3. For each query name: normalize → exact lookup → fuzzy fallback via
     difflib.get_close_matches (stdlib, no extra packages).
  4. Return hit=True/False, matched name, sanction list(s), confidence score.

Name normalization:
  - Lowercase, remove punctuation (keep spaces and hyphens)
  - Strip honorifics: mr, mrs, dr, prof, rev, sir, eng, lt, col, gen, maj, capt, sgt
  - Sort tokens alphabetically so "Smith John" == "John Smith"

Fuzzy threshold: 0.85 for a positive hit (conservative — avoids false positives).

Rate: one HTTP download per 24 h regardless of how many entities are screened.
"""

import logging
import re
import time
import difflib
from datetime import datetime, timezone
from typing import Optional
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# In-process cache
# ------------------------------------------------------------------
_cache: dict = {
    "names":       {},   # normalized_name → (uid, sdnType, programs_str)
    "loaded_at":   None,
    "entry_count": 0,
}
_CACHE_TTL_SECONDS = 86_400   # 24 hours
_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml"
_FUZZY_THRESHOLD = 0.85

_HONORIFICS = frozenset([
    "mr", "mrs", "ms", "miss", "dr", "prof", "rev", "sir", "eng",
    "lt", "col", "gen", "maj", "capt", "sgt", "cpl", "pvt", "adm",
    "amb", "hon", "pres", "dir",
])


def _normalize(name: str) -> str:
    """Lowercase, strip punctuation (keep hyphens), remove honorifics, sort tokens."""
    name = name.lower()
    name = re.sub(r"[^\w\s-]", "", name)          # remove punctuation except hyphen
    tokens = [t for t in name.split() if t not in _HONORIFICS and len(t) > 1]
    return " ".join(sorted(tokens))


def _load_sdn() -> None:
    """Download and parse the OFAC SDN XML list into the in-process cache."""
    try:
        import urllib.request
        logger.info("sanctions: downloading OFAC SDN list from treasury.gov …")
        with urllib.request.urlopen(_SDN_URL, timeout=30) as resp:
            xml_bytes = resp.read()

        root = ET.fromstring(xml_bytes)
        ns   = {"o": root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""}
        tag  = lambda t: f"{{{ns['o']}}}{t}" if ns["o"] else t

        names: dict = {}
        for entry in root.iter(tag("sdnEntry")):
            uid      = entry.findtext(tag("uid"), "")
            sdn_type = entry.findtext(tag("sdnType"), "")
            last     = entry.findtext(tag("lastName"), "")
            first    = entry.findtext(tag("firstName"), "")
            programs = [p.text or "" for p in entry.iter(tag("program"))]
            prog_str = "|".join(p for p in programs if p)

            # Primary name
            full = f"{first} {last}".strip() if first else last
            if full:
                norm = _normalize(full)
                if norm:
                    names[norm] = (uid, sdn_type, prog_str)

            # Also index strong aliases
            for aka in entry.iter(tag("aka")):
                cat = aka.findtext(tag("category"), "")
                if cat.lower() != "strong":
                    continue
                aka_last  = aka.findtext(tag("lastName"), "")
                aka_first = aka.findtext(tag("firstName"), "")
                aka_full  = f"{aka_first} {aka_last}".strip() if aka_first else aka_last
                if aka_full:
                    norm = _normalize(aka_full)
                    if norm:
                        names[norm] = (uid, sdn_type, prog_str)

        _cache["names"]       = names
        _cache["loaded_at"]   = time.time()
        _cache["entry_count"] = len(names)
        logger.info("sanctions: SDN index built — %d normalized names", len(names))

    except Exception as exc:
        logger.warning("sanctions: SDN download failed — %s", exc)


def _ensure_loaded() -> bool:
    """Refresh cache if stale or empty. Returns True if cache is available."""
    now = time.time()
    loaded_at = _cache.get("loaded_at")
    if loaded_at is None or (now - loaded_at) > _CACHE_TTL_SECONDS:
        _load_sdn()
    return bool(_cache["names"])


def screen_name(name: str) -> dict:
    """
    Screen a person or enterprise name against the OFAC SDN list.

    Returns
    -------
    {
        sanctions_hit          : bool | None   (None if SDN unavailable)
        sanctions_list         : str           "OFAC_SDN" or ""
        sanctions_score        : float         0.0–1.0
        sanctions_checked_at   : str           ISO timestamp
        pep_flag               : bool | None   True if matched entry has PEP programs
        _matched_name          : str           the SDN entry name that matched (debug)
    }
    """
    checked_at = datetime.now(timezone.utc).isoformat()

    if not name or len(name.strip()) < 3:
        return {
            "sanctions_hit":        None,
            "sanctions_list":       "",
            "sanctions_score":      0.0,
            "sanctions_checked_at": checked_at,
            "pep_flag":             None,
            "_matched_name":        "",
        }

    available = _ensure_loaded()
    if not available:
        return {
            "sanctions_hit":        None,
            "sanctions_list":       "",
            "sanctions_score":      0.0,
            "sanctions_checked_at": checked_at,
            "pep_flag":             None,
            "_matched_name":        "",
        }

    query_norm = _normalize(name)
    names_index = _cache["names"]

    # 1 — exact match
    if query_norm in names_index:
        uid, sdn_type, prog_str = names_index[query_norm]
        return _build_hit(1.0, uid, sdn_type, prog_str, checked_at, name)

    # 2 — fuzzy match (difflib over all keys — fast enough for <20k entries)
    matches = difflib.get_close_matches(
        query_norm,
        names_index.keys(),
        n=1,
        cutoff=_FUZZY_THRESHOLD,
    )
    if matches:
        matched_key = matches[0]
        uid, sdn_type, prog_str = names_index[matched_key]
        score = difflib.SequenceMatcher(None, query_norm, matched_key).ratio()
        return _build_hit(score, uid, sdn_type, prog_str, checked_at, matched_key)

    return {
        "sanctions_hit":        False,
        "sanctions_list":       "",
        "sanctions_score":      0.0,
        "sanctions_checked_at": checked_at,
        "pep_flag":             False,
        "_matched_name":        "",
    }


# PEP-related OFAC programs (partial list — government officials, kleptocrats, etc.)
_PEP_PROGRAMS = frozenset([
    "UKRAINE-EO13661", "UKRAINE-EO13685", "RUSSIA-EO14024",
    "BELARUS-EO14038", "VENEZUELA", "NICARAGUA", "ZIMBABWE",
    "BURMA", "IRAN-EO13846", "DPRK4", "SUDAN", "SOUTH-SUDAN",
    "MALI", "CAR", "DRC", "SOMALIA", "YEMEN", "LIBYA2",
])


def _build_hit(score: float, uid: str, sdn_type: str, prog_str: str,
               checked_at: str, matched_name: str) -> dict:
    programs = set(prog_str.split("|"))
    pep_flag = bool(programs & _PEP_PROGRAMS)
    return {
        "sanctions_hit":        True,
        "sanctions_list":       "OFAC_SDN",
        "sanctions_score":      round(score, 4),
        "sanctions_checked_at": checked_at,
        "pep_flag":             pep_flag,
        "_matched_name":        matched_name,
    }


def get_sdn_stats() -> dict:
    """Return cache metadata — useful for /enrichment/status."""
    return {
        "entry_count": _cache["entry_count"],
        "loaded_at":   datetime.fromtimestamp(_cache["loaded_at"], tz=timezone.utc).isoformat()
                       if _cache["loaded_at"] else None,
        "cache_ttl_hours": _CACHE_TTL_SECONDS // 3600,
    }
