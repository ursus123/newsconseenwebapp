"""
enrichment/product_domain/food.py
-----------------------------------
Enrich food products and ingredients via USDA FoodData Central.
Uses DEMO_KEY — no registration required, moderate rate limit.

Returns: food_description, food_category, food_brand, fdc_id,
         calories_per_100g, protein_g, carbs_g, fat_g,
         sodium_mg, fiber_g, domain_status, _source
"""

import time
import logging
import httpx

logger = logging.getLogger(__name__)

_BASE = "https://api.nal.usda.gov/fdc/v1"
_KEY  = "DEMO_KEY"   # Works without registration; 30 req/hr per IP
_LAST_CALL = 0.0
_MIN_INTERVAL = 2.0   # conservative for DEMO_KEY tier


# Nutrient display names → result keys
_NUTRIENT_MAP = {
    "Energy":                          "calories_per_100g",
    "Protein":                         "protein_g",
    "Carbohydrate, by difference":     "carbs_g",
    "Total lipid (fat)":               "fat_g",
    "Sodium, Na":                      "sodium_mg",
    "Fiber, total dietary":            "fiber_g",
    "Sugars, total including NLEA":    "sugars_g",
}


def enrich_food(name: str, row: dict) -> dict:
    """Look up food item in USDA FoodData Central."""
    global _LAST_CALL
    result: dict = {"_source": "usda_fooddata"}
    if not name:
        result["domain_status"] = "no_name"
        return result

    elapsed = time.time() - _LAST_CALL
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _LAST_CALL = time.time()

    try:
        r = httpx.get(
            f"{_BASE}/foods/search",
            params={
                "query":    name,
                "api_key":  _KEY,
                "pageSize": 1,
                "dataType": "Foundation,SR Legacy,Branded",
            },
            timeout=15,
        )
        _LAST_CALL = time.time()

        if r.status_code == 429:
            result["domain_status"] = "rate_limited"
            return result

        foods = r.json().get("foods", [])
        if not foods:
            result["domain_status"] = "not_found"
            return result

        food = foods[0]
        result["food_description"] = food.get("description", "")
        result["food_category"]    = food.get("foodCategory", "")
        result["food_brand"]       = food.get("brandOwner", "")
        result["fdc_id"]           = str(food.get("fdcId", ""))

        # Nutrients (per 100g)
        for nutrient in food.get("foodNutrients", []):
            key = _NUTRIENT_MAP.get(nutrient.get("nutrientName"))
            if key and "value" in nutrient:
                result[key] = round(float(nutrient["value"]), 2)

        result["domain_status"] = "enriched"

    except Exception as exc:
        logger.warning("food.enrich: %s — %s", name, exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]

    return result
