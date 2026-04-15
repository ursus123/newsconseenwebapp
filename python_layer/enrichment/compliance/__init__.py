"""
enrichment/compliance/
-----------------------
Phase C — Compliance & Risk Intelligence.

Modules:
  sanctions.py     — OFAC SDN list fuzzy name screening (24h cache)
  country_risk.py  — World Bank Governance Indicators composite score (7-day cache)
  aml_flags.py     — AML pattern detection on transactions (pure Python, batch)
  news_mentions.py — GDELT entity news mention count + sentiment
"""
