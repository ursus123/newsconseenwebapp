"""
enrichment/scoring/
---------------------
Phase D — Entity Scoring & Synthesis.

Reads completed enrichment rows (Phase A + B + C) for each entity
and synthesises three composite scores:

  risk_score      0–100  higher = more risk flags present
  quality_score   0–100  higher = more enrichment fields populated
  intelligence_score  0–100  combination of depth and freshness

Results land in analytics.entity_scores — one row per entity per company.
This is the single table copilot tools and agents query for prioritisation,
instead of joining across all 5 enrichment tables.

Modules:
  person_score.py      Score a person_enrichment row
  enterprise_score.py  Score an enterprise_enrichment row
  product_score.py     Score a product_enrichment row
  transaction_score.py Score a transaction_enrichment row
  address_score.py     Score an address_enrichment row
  engine.py            Orchestrate: read enrichment tables → score → write entity_scores
"""
