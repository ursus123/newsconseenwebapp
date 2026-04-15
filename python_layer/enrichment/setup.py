"""
enrichment/setup.py
---------------------
DDL for the 5 analytics enrichment tables.
Called at startup — creates tables if they don't exist.
All columns are nullable so partial enrichment rows load cleanly.

Phases covered per table:
  person_enrichment      Phase A (phone/email) + B (NPI) + C (sanctions/PEP)
  enterprise_enrichment  Phase A (OpenCorporates) + B (NPI) + C (sanctions/country risk/news)
  product_enrichment     Phase A (barcode/FX) + B (domain: medication/food/vehicle/chemical/device/software)
  transaction_enrichment Phase A (FX) + C (AML flags/anomaly)
  address_enrichment     Phase A (geocoding/timezone) + C (country risk)
  entity_scores          Phase D synthesis — composite risk/quality/intelligence scores per entity
  relationship_enrichment Phase D — link strength, risk contagion, health (6th entity)
  task_enrichment        Phase D — overdue, SLA risk, completion likelihood (7th entity)
"""

import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

_DDL = [
    # ── Person ────────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.person_enrichment (
        company_id              TEXT,
        person_id               TEXT,
        person_name             TEXT,
        person_type             TEXT,
        -- Phase A: phone
        phone_valid             BOOLEAN,
        phone_e164              TEXT,
        phone_country           TEXT,
        phone_carrier           TEXT,
        phone_line_type         TEXT,
        phone_description       TEXT,
        -- Phase A: email
        email_valid             BOOLEAN,
        email_format_valid      BOOLEAN,
        email_domain            TEXT,
        email_domain_valid      BOOLEAN,
        email_disposable        BOOLEAN,
        -- Phase B: NPI (healthcare providers)
        npi_number              TEXT,
        npi_type                TEXT,
        npi_taxonomy_code       TEXT,
        npi_taxonomy_desc       TEXT,
        npi_taxonomy_license    TEXT,
        npi_state               TEXT,
        npi_city                TEXT,
        npi_country             TEXT,
        npi_enumeration_date    TEXT,
        npi_status              TEXT,
        -- Domain
        domain_data             TEXT,
        domain_enriched_by      TEXT,
        -- Phase C: sanctions (OFAC SDN)
        sanctions_hit           BOOLEAN,
        sanctions_list          TEXT,
        sanctions_score         DOUBLE PRECISION,
        pep_flag                BOOLEAN,
        sanctions_checked_at    TEXT,
        -- Meta
        enrichment_status       TEXT,
        reason                  TEXT,
        enriched_at             TEXT
    )
    """,

    # ── Enterprise ────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.enterprise_enrichment (
        company_id              TEXT,
        enterprise_id           TEXT,
        enterprise_name         TEXT,
        enterprise_type         TEXT,
        country                 TEXT,
        -- Phase A: OpenCorporates
        reg_number              TEXT,
        reg_status              TEXT,
        jurisdiction            TEXT,
        incorporation_date      TEXT,
        company_type            TEXT,
        registered_address      TEXT,
        opencorporates_url      TEXT,
        -- Phase B: NPI (healthcare organisations)
        npi_number              TEXT,
        npi_type                TEXT,
        npi_provider_name       TEXT,
        npi_taxonomy_code       TEXT,
        npi_taxonomy_desc       TEXT,
        npi_taxonomy_license    TEXT,
        npi_state               TEXT,
        npi_city                TEXT,
        npi_country             TEXT,
        npi_enumeration_date    TEXT,
        npi_status              TEXT,
        -- Domain
        domain_data             TEXT,
        domain_enriched_by      TEXT,
        -- Phase C: sanctions (OFAC SDN)
        sanctions_hit           BOOLEAN,
        sanctions_list          TEXT,
        sanctions_score         DOUBLE PRECISION,
        sanctions_checked_at    TEXT,
        -- Phase C: country risk (World Bank WGI)
        country_risk_score      DOUBLE PRECISION,
        country_risk_label      TEXT,
        country_governance_index DOUBLE PRECISION,
        -- Phase C: news mentions (GDELT)
        news_mention_count      INTEGER,
        news_sentiment          TEXT,
        news_avg_tone           DOUBLE PRECISION,
        -- Meta
        enrichment_status       TEXT,
        reason                  TEXT,
        enriched_at             TEXT
    )
    """,

    # ── Product ───────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.product_enrichment (
        company_id              TEXT,
        product_id              TEXT,
        product_name            TEXT,
        item_type               TEXT,
        item_class              TEXT,
        -- Phase A: barcode
        barcode_name            TEXT,
        brand                   TEXT,
        category                TEXT,
        manufacturer            TEXT,
        allergens               TEXT,
        nutriscore              TEXT,
        ecoscore                TEXT,
        -- Phase A: FX
        price_original          DOUBLE PRECISION,
        price_currency          TEXT,
        price_usd               DOUBLE PRECISION,
        fx_rate                 DOUBLE PRECISION,
        -- Phase B: medications (RxNorm)
        drug_class              TEXT,
        drug_rxnorm_name        TEXT,
        drug_term_type          TEXT,
        drug_class_id           TEXT,
        drug_ingredients        TEXT,
        rxcui                   TEXT,
        -- Phase B: food (USDA)
        food_description        TEXT,
        food_category           TEXT,
        food_brand              TEXT,
        fdc_id                  TEXT,
        calories_per_100g       DOUBLE PRECISION,
        protein_g               DOUBLE PRECISION,
        carbs_g                 DOUBLE PRECISION,
        fat_g                   DOUBLE PRECISION,
        sodium_mg               DOUBLE PRECISION,
        fiber_g                 DOUBLE PRECISION,
        sugars_g                DOUBLE PRECISION,
        -- Phase B: vehicles (NHTSA)
        vehicle_make            TEXT,
        vehicle_model           TEXT,
        vehicle_year            TEXT,
        vehicle_type            TEXT,
        vehicle_fuel_type       TEXT,
        vehicle_body_class      TEXT,
        recall_count            INTEGER,
        latest_recall_date      TEXT,
        latest_recall_desc      TEXT,
        latest_recall_component TEXT,
        vin_decoded             BOOLEAN,
        -- Phase B: chemicals (PubChem)
        chem_cid                TEXT,
        chem_iupac_name         TEXT,
        chem_formula            TEXT,
        chem_molecular_weight   DOUBLE PRECISION,
        chem_smiles             TEXT,
        chem_inchikey           TEXT,
        chem_ghs_hazard         TEXT,
        -- Phase B: medical devices (openFDA)
        fda_device_name         TEXT,
        fda_device_class        TEXT,
        fda_regulation_number   TEXT,
        fda_product_code        TEXT,
        fda_medical_specialty   TEXT,
        fda_submission_type     TEXT,
        fda_recall_count        INTEGER,
        fda_recall_status       TEXT,
        -- Phase B: software (npm/PyPI)
        pkg_name                TEXT,
        pkg_latest_version      TEXT,
        pkg_description         TEXT,
        pkg_license             TEXT,
        pkg_registry            TEXT,
        pkg_homepage            TEXT,
        pkg_keywords            TEXT,
        pkg_author              TEXT,
        -- Domain
        domain_data             TEXT,
        domain_enriched_by      TEXT,
        -- Meta
        enrichment_status       TEXT,
        reason                  TEXT,
        enriched_at             TEXT
    )
    """,

    # ── Transaction ───────────────────────────────────────────────────────────
    # (product_enrichment has no Phase C columns — domain dispatch covers it fully)
    """
    CREATE TABLE IF NOT EXISTS analytics.transaction_enrichment (
        company_id              TEXT,
        transaction_id          TEXT,
        transaction_type        TEXT,
        status                  TEXT,
        base_currency           TEXT,
        -- Phase A: FX
        amount_original         DOUBLE PRECISION,
        amount_usd              DOUBLE PRECISION,
        fx_rate                 DOUBLE PRECISION,
        fx_date                 TEXT,
        -- Phase C: AML risk flags
        aml_risk_score          DOUBLE PRECISION,
        aml_flags               TEXT,
        anomaly_score           DOUBLE PRECISION,
        anomaly_flag            BOOLEAN,
        -- Meta
        enrichment_status       TEXT,
        reason                  TEXT,
        enriched_at             TEXT
    )
    """,

    # ── Address ───────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.address_enrichment (
        company_id              TEXT,
        address_id              TEXT,
        entity_type             TEXT,
        entity_name             TEXT,
        -- Phase A: geocoding + timezone
        lat                     DOUBLE PRECISION,
        lon                     DOUBLE PRECISION,
        timezone                TEXT,
        admin_level1            TEXT,
        admin_level2            TEXT,
        admin_level3            TEXT,
        country_code            TEXT,
        postcode                TEXT,
        formatted_address       TEXT,
        -- Phase C: country risk (World Bank WGI)
        country_risk_score      DOUBLE PRECISION,
        country_risk_label      TEXT,
        -- Meta
        enrichment_status       TEXT,
        reason                  TEXT,
        enriched_at             TEXT
    )
    """,

    # ── Phase D: Entity Scores (synthesis) ───────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.entity_scores (
        company_id              TEXT,
        entity_type             TEXT,
        entity_id               TEXT,
        entity_name             TEXT,
        -- Composite scores
        risk_score              DOUBLE PRECISION,
        quality_score           DOUBLE PRECISION,
        intelligence_score      DOUBLE PRECISION,
        -- Flags + reasoning
        top_flags               TEXT,
        score_reasoning         TEXT,
        needs_review            BOOLEAN,
        -- Meta
        score_version           TEXT,
        scored_at               TEXT
    )
    """,

    # ── Phase D: Relationship enrichment (6th entity) ─────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.relationship_enrichment (
        company_id              TEXT,
        relationship_id         TEXT,
        relationship_type       TEXT,
        entity_a_id             TEXT,
        entity_a_type           TEXT,
        entity_b_id             TEXT,
        entity_b_type           TEXT,
        -- Network intelligence
        is_active               BOOLEAN,
        tenure_days             INTEGER,
        link_strength_score     DOUBLE PRECISION,
        transaction_count       INTEGER,
        transaction_volume_usd  DOUBLE PRECISION,
        last_transaction_date   TEXT,
        -- Risk contagion
        risk_contagion_score    DOUBLE PRECISION,
        risk_contagion_source   TEXT,
        relationship_health     TEXT,
        -- Meta
        enriched_at             TEXT
    )
    """,

    # ── Phase D: Task enrichment (7th entity) ────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.task_enrichment (
        company_id              TEXT,
        task_id                 TEXT,
        task_type               TEXT,
        status                  TEXT,
        priority                TEXT,
        assigned_to             TEXT,
        -- Operational intelligence
        overdue_days            INTEGER,
        is_overdue              BOOLEAN,
        completion_likelihood   DOUBLE PRECISION,
        assignee_workload       INTEGER,
        priority_score          DOUBLE PRECISION,
        sla_risk                TEXT,
        -- Meta
        enriched_at             TEXT
    )
    """,
]


def ensure_enrichment_tables(engine) -> None:
    """
    Create all 8 analytics enrichment tables if they don't exist
    (5 Phase A/B/C + 3 Phase D: entity_scores, relationship, task).
    Safe to call on every startup — uses CREATE TABLE IF NOT EXISTS.
    """
    try:
        with engine.begin() as conn:
            for ddl in _DDL:
                conn.execute(text(ddl))
        logger.info("Startup: enrichment tables ready (analytics.*_enrichment)")
    except Exception as exc:
        logger.warning("Startup: enrichment table setup failed — %s", exc)
