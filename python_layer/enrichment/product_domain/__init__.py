"""
enrichment/product_domain
--------------------------
Domain-specific product enrichment modules.
Each module targets a specific item_type / item_subtype family.

All APIs are free / no-key required:
  medications  → NIH RxNorm  (https://rxnav.nlm.nih.gov/REST)
  food         → USDA FoodData Central  (DEMO_KEY, no registration)
  vehicles     → NHTSA vPIC + Safety API  (no key)
  chemicals    → PubChem REST  (no key)
  devices      → FDA openFDA devices  (no key)
  software     → npm registry + PyPI  (no key)
"""
