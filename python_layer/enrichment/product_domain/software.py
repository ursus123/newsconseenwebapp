"""
enrichment/product_domain/software.py
---------------------------------------
Enrich digital/software products via npm registry and PyPI.
Both APIs are free, no key required.

Strategy: try npm first, fall back to PyPI.

Returns: pkg_name, pkg_latest_version, pkg_description, pkg_license,
         pkg_registry, pkg_homepage, pkg_keywords, pkg_author,
         domain_status, _source
"""

import time
import logging
import httpx

logger = logging.getLogger(__name__)

_LAST_CALL    = 0.0
_MIN_INTERVAL = 0.3


def enrich_software(name: str, row: dict) -> dict:
    """Look up software package on npm then PyPI."""
    result: dict = {"_source": "npm_pypi"}
    if not name:
        result["domain_status"] = "no_name"
        return result

    # Normalise: lowercase, strip spaces
    slug = name.lower().replace(" ", "-")

    # ── Try npm registry ───────────────────────────────────────────────────
    npm_result = _npm(slug)
    if npm_result.get("domain_status") == "enriched":
        result.update(npm_result)
        return result

    # ── Try PyPI ───────────────────────────────────────────────────────────
    pypi_result = _pypi(slug)
    if pypi_result.get("domain_status") == "enriched":
        result.update(pypi_result)
        return result

    # ── Try original name on PyPI (some packages use spaces → underscores) ─
    slug2 = name.lower().replace(" ", "_")
    if slug2 != slug:
        pypi_result2 = _pypi(slug2)
        if pypi_result2.get("domain_status") == "enriched":
            result.update(pypi_result2)
            return result

    result["domain_status"] = "not_found"
    return result


def _npm(slug: str) -> dict:
    global _LAST_CALL
    result: dict = {"pkg_registry": "npm"}
    _wait()
    try:
        r = httpx.get(
            f"https://registry.npmjs.org/{slug}",
            headers={"Accept": "application/json"},
            timeout=10,
        )
        if r.status_code != 200:
            result["domain_status"] = "not_found"
            return result

        data   = r.json()
        latest = data.get("dist-tags", {}).get("latest", "")
        ver    = data.get("versions", {}).get(latest, {})

        result["pkg_name"]           = data.get("name", "")
        result["pkg_latest_version"] = latest
        result["pkg_description"]    = data.get("description", "")
        result["pkg_license"]        = ver.get("license", data.get("license", ""))
        result["pkg_homepage"]       = data.get("homepage", "")
        result["pkg_keywords"]       = ", ".join((data.get("keywords") or [])[:10])
        # Author can be string or dict
        author = data.get("author")
        if isinstance(author, dict):
            result["pkg_author"] = author.get("name", "")
        elif isinstance(author, str):
            result["pkg_author"] = author
        result["domain_status"] = "enriched"

    except Exception as exc:
        logger.debug("software._npm: %s — %s", slug, exc)
        result["domain_status"] = "error"

    return result


def _pypi(slug: str) -> dict:
    global _LAST_CALL
    result: dict = {"pkg_registry": "pypi"}
    _wait()
    try:
        r = httpx.get(f"https://pypi.org/pypi/{slug}/json", timeout=10)
        if r.status_code != 200:
            result["domain_status"] = "not_found"
            return result

        info = r.json().get("info", {})
        result["pkg_name"]           = info.get("name", "")
        result["pkg_latest_version"] = info.get("version", "")
        result["pkg_description"]    = (info.get("summary") or "")[:250]
        result["pkg_license"]        = info.get("license", "")
        result["pkg_homepage"]       = info.get("home_page") or info.get("project_url", "")
        result["pkg_keywords"]       = (info.get("keywords") or "")[:150]
        result["pkg_author"]         = info.get("author", "")
        result["domain_status"]      = "enriched"

    except Exception as exc:
        logger.debug("software._pypi: %s — %s", slug, exc)
        result["domain_status"] = "error"

    return result


def _wait():
    global _LAST_CALL
    elapsed = time.time() - _LAST_CALL
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _LAST_CALL = time.time()
