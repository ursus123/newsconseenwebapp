"""
enrichment/product_domain/chemicals.py
----------------------------------------
Enrich chemical products via PubChem REST API.
Free, no API key required. Rate limit: 5 req/sec (we stay under).

Returns: chem_cid, chem_iupac_name, chem_formula, chem_molecular_weight,
         chem_smiles, chem_inchikey, chem_ghs_hazard,
         domain_status, _source
"""

import time
import logging
import httpx

logger = logging.getLogger(__name__)

_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
_LAST_CALL = 0.0
_MIN_INTERVAL = 0.3   # well under 5 req/sec limit

# Properties to fetch in one request
_PROPS = "IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey"


def enrich_chemical(name: str, row: dict) -> dict:
    """Look up compound data from PubChem by name."""
    result: dict = {"_source": "pubchem"}
    if not name:
        result["domain_status"] = "no_name"
        return result

    # ── Step 1: get compound properties ───────────────────────────────────
    _wait()
    try:
        # URL-encode name safely
        encoded = httpx.URL("", params={"name": name}).params["name"]
    except Exception:
        encoded = name.replace(" ", "%20")

    try:
        r = httpx.get(
            f"{_BASE}/compound/name/{encoded}/property/{_PROPS}/JSON",
            timeout=12,
        )

        if r.status_code == 404:
            result["domain_status"] = "not_found"
            return result

        if r.status_code == 429:
            result["domain_status"] = "rate_limited"
            return result

        props = r.json().get("PropertyTable", {}).get("Properties", [{}])[0]
        cid = props.get("CID")
        if not cid:
            result["domain_status"] = "not_found"
            return result

        result["chem_cid"]              = str(cid)
        result["chem_iupac_name"]       = props.get("IUPACName", "")
        result["chem_formula"]          = props.get("MolecularFormula", "")
        result["chem_molecular_weight"] = props.get("MolecularWeight")
        result["chem_smiles"]           = props.get("CanonicalSMILES", "")
        result["chem_inchikey"]         = props.get("InChIKey", "")

        # ── Step 2: GHS hazard from safety data page ───────────────────────
        _wait()
        r2 = httpx.get(
            f"{_BASE}/compound/cid/{cid}/property/IUPACName/JSON",
            timeout=8,
        )
        # Try GHS classification endpoint (section-based)
        _wait()
        r3 = httpx.get(
            f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON"
            "?heading=GHS+Classification",
            timeout=12,
        )
        if r3.status_code == 200:
            try:
                sections = (
                    r3.json()
                    .get("Record", {})
                    .get("Section", [])
                )
                for sec in sections:
                    for subsec in sec.get("Section", []):
                        if "GHS" in str(subsec.get("TOCHeading", "")):
                            for info in subsec.get("Information", []):
                                val = info.get("Value", {})
                                for sv in val.get("StringWithMarkup", []):
                                    txt = sv.get("String", "")
                                    if txt and ("signal" in txt.lower() or "danger" in txt.lower() or "warning" in txt.lower()):
                                        result["chem_ghs_hazard"] = txt[:100]
                                        break
            except Exception:
                pass

        result["domain_status"] = "enriched"

    except Exception as exc:
        logger.warning("chemicals.enrich: %s — %s", name, exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]

    return result


def _wait():
    global _LAST_CALL
    elapsed = time.time() - _LAST_CALL
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _LAST_CALL = time.time()
