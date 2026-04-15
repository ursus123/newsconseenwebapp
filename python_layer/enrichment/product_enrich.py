"""
enrichment/product_enrich.py
-----------------------------
Enrich Product records with:
  - Barcode lookup (Open Food Facts → UPC Item DB)
  - FX price normalisation to USD (open.er-api.com)

Writes to analytics.product_enrichment — one row per product.
"""

import json
import logging
import pandas as pd

from enrichment.barcode        import lookup_barcode
from enrichment.exchange_rates import convert_to_usd

logger = logging.getLogger(__name__)

# Field names where the barcode/EAN/UPC might live
_BARCODE_FIELDS  = ["barcode", "ean", "upc", "gtin", "ean_code", "barcode_number"]
# Field names where the product name might live
_NAME_FIELDS     = ["item_name", "product_name", "name", "title"]
# Field names where the unit price might live
_PRICE_FIELDS    = ["price", "unit_price", "selling_price", "cost_price", "list_price"]
# Field names for currency
_CURRENCY_FIELDS = ["currency", "price_currency", "currency_code"]


def enrich_products(
    products_df: pd.DataFrame,
    company_id: str,
    force: bool = False,
    transactions_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    For each product in company_id:
      - If barcode present: look up Open Food Facts / UPC Item DB
      - If price + currency present: normalise to USD
    Returns DataFrame ready for analytics.product_enrichment.
    """
    if products_df.empty:
        return pd.DataFrame()

    prds = products_df[products_df["company_id"] == company_id].copy() \
           if "company_id" in products_df.columns else products_df.copy()
    if prds.empty:
        return pd.DataFrame()

    rows = []
    for _, p in prds.iterrows():
        name     = _first(p, _NAME_FIELDS)
        barcode  = _first(p, _BARCODE_FIELDS)
        price_s  = _first(p, _PRICE_FIELDS)
        currency = _first(p, _CURRENCY_FIELDS) or "USD"

        row: dict = {
            "company_id":   company_id,
            "product_id":   str(p.get("id", "") or ""),
            "product_name": name,
            "item_type":    str(p.get("item_type", "") or ""),
            "item_class":   str(p.get("item_class", "") or ""),
        }

        # ── Barcode enrichment (Phase A) ───────────────────────────────────────
        if barcode:
            barcode_result = lookup_barcode(barcode)
            row.update(barcode_result)
        else:
            row["enrichment_status"] = "no_barcode"

        # ── Phase B: domain-specific enrichment ────────────────────────────────
        try:
            from enrichment.product_domain.dispatcher import dispatch_product
            domain_result = dispatch_product(name or "", dict(p))
            if domain_result:
                row["domain_data"]       = json.dumps(domain_result)
                row["domain_enriched_by"] = domain_result.get("_source", "")
                # Promote key fields to top-level columns for easy querying
                for key in ("drug_class", "drug_rxnorm_name", "drug_ingredients",
                            "food_category", "food_brand", "calories_per_100g",
                            "vehicle_make", "vehicle_model", "recall_count",
                            "chem_formula", "chem_molecular_weight",
                            "fda_device_class", "fda_medical_specialty",
                            "pkg_name", "pkg_latest_version", "pkg_license"):
                    if key in domain_result:
                        row[key] = domain_result[key]
        except Exception as _de:
            logger.debug("product domain dispatch skipped: %s", _de)

        # ── FX normalisation ───────────────────────────────────────────────────
        if price_s is not None:
            try:
                price_f = float(str(price_s).replace(",", ""))
                amount_usd, fx_rate = convert_to_usd(price_f, currency)
                row["price_original"]  = price_f
                row["price_currency"]  = currency.upper()
                row["price_usd"]       = amount_usd
                row["fx_rate"]         = fx_rate
            except (ValueError, TypeError):
                pass

        # ── Phase E: predictive & temporal signals ─────────────────────────────
        if transactions_df is not None and not transactions_df.empty:
            try:
                from enrichment.temporal.product_temporal import enrich_product_temporal
                temporal = enrich_product_temporal(dict(p), transactions_df)
                row.update(temporal)
            except Exception as _te:
                logger.debug("product Phase E temporal skipped: %s", _te)

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("product_enrich: %d products processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)


def _first(p, fields: list) -> str | None:
    """Return the first non-empty value from a list of field names."""
    for f in fields:
        v = p.get(f)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None
