"""
python_layer/enrichment/
-------------------------
Phase A — Universal ontology enrichment.

Adds external data to every entity record using free/no-key APIs and
local Python libraries. Enrichment is incremental — only processes
records not yet enriched or enriched > 30 days ago.

Tables written:
    analytics.person_enrichment
    analytics.enterprise_enrichment
    analytics.product_enrichment
    analytics.transaction_enrichment
    analytics.address_enrichment
"""
