"""
enrichment/setup.py
---------------------
DDL for the analytics enrichment tables.
Called at startup — creates tables if they don't exist, then runs column migrations
to add any columns that were added after the initial deployment.

Rule: every new column needs TWO entries here:
  1. Inside the CREATE TABLE IF NOT EXISTS block (for brand-new deployments)
  2. Inside _MIGRATIONS as ALTER TABLE ... ADD COLUMN IF NOT EXISTS (for live deployments)

Phases covered per table:
  person_enrichment      Phase A (phone/email) + B (NPI) + C (sanctions/PEP)
                         + E (spend_trend, churn_probability, CLV, 30d activity)
  enterprise_enrichment  Phase A (OpenCorporates) + B (NPI) + C (sanctions/country risk/news)
                         + E (revenue_trend, payment_behavior, avg_days_to_pay, relationship_count)
  product_enrichment     Phase A (barcode/FX) + B (domain: medication/food/vehicle/chemical/device/software)
                         + E (demand_trend, stockout_risk, velocity_change_pct, days_of_stock, demand_forecast_30d)
  transaction_enrichment Phase A (FX) + C (AML flags/anomaly)
                         + E (is_recurring, recurrence_count, seasonal_flag, days_since_prior_tx)
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
        -- Phase E: predictive & temporal
        spend_trend                 TEXT,
        days_since_last_transaction INTEGER,
        transaction_count_30d       INTEGER,
        transaction_volume_30d_usd  DOUBLE PRECISION,
        churn_probability           DOUBLE PRECISION,
        clv_segment                 TEXT,
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
        -- Phase E: predictive & temporal
        revenue_trend           TEXT,
        payment_behavior        TEXT,
        avg_days_to_pay         DOUBLE PRECISION,
        relationship_count      INTEGER,
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
        -- Phase E: predictive & temporal
        demand_trend            TEXT,
        velocity_change_pct     DOUBLE PRECISION,
        days_of_stock           INTEGER,
        stockout_risk           TEXT,
        demand_forecast_30d     DOUBLE PRECISION,
        last_sold_days          INTEGER,
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
        -- Phase E: predictive & temporal
        is_recurring            BOOLEAN,
        recurrence_count        INTEGER,
        seasonal_flag           TEXT,
        days_since_prior_tx     INTEGER,
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


# ── Column migrations ────────────────────────────────────────────────────────
# Run after every CREATE TABLE IF NOT EXISTS.
# Required for live deployments where the table already exists but is missing
# columns added in later phases. Add one entry here for every new column added
# to any table in _DDL above — otherwise live deployments crash with
# "column does not exist" on the next ETL run.
_MIGRATIONS = [
    # Phase B domain_data columns (added after initial table creation)
    "ALTER TABLE analytics.person_enrichment      ADD COLUMN IF NOT EXISTS domain_data        TEXT",
    "ALTER TABLE analytics.person_enrichment      ADD COLUMN IF NOT EXISTS domain_enriched_by TEXT",
    "ALTER TABLE analytics.enterprise_enrichment  ADD COLUMN IF NOT EXISTS domain_data        TEXT",
    "ALTER TABLE analytics.enterprise_enrichment  ADD COLUMN IF NOT EXISTS domain_enriched_by TEXT",
    "ALTER TABLE analytics.product_enrichment     ADD COLUMN IF NOT EXISTS domain_data        TEXT",
    "ALTER TABLE analytics.product_enrichment     ADD COLUMN IF NOT EXISTS domain_enriched_by TEXT",

    # Phase E columns — person
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS spend_trend                 TEXT",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS days_since_last_transaction INTEGER",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS transaction_count_30d       INTEGER",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS transaction_volume_30d_usd  DOUBLE PRECISION",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS churn_probability           DOUBLE PRECISION",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS clv_segment                 TEXT",

    # Phase E columns — enterprise
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS revenue_trend       TEXT",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS payment_behavior    TEXT",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS avg_days_to_pay     DOUBLE PRECISION",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS relationship_count  INTEGER",

    # Phase E columns — product
    "ALTER TABLE analytics.product_enrichment ADD COLUMN IF NOT EXISTS demand_trend        TEXT",
    "ALTER TABLE analytics.product_enrichment ADD COLUMN IF NOT EXISTS velocity_change_pct DOUBLE PRECISION",
    "ALTER TABLE analytics.product_enrichment ADD COLUMN IF NOT EXISTS days_of_stock       INTEGER",
    "ALTER TABLE analytics.product_enrichment ADD COLUMN IF NOT EXISTS stockout_risk       TEXT",
    "ALTER TABLE analytics.product_enrichment ADD COLUMN IF NOT EXISTS demand_forecast_30d DOUBLE PRECISION",
    "ALTER TABLE analytics.product_enrichment ADD COLUMN IF NOT EXISTS last_sold_days      INTEGER",

    # Phase E columns — transaction
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS is_recurring        BOOLEAN",
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS recurrence_count    INTEGER",
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS seasonal_flag       TEXT",
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS days_since_prior_tx INTEGER",

    # Phase C columns — enterprise
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS news_mention_count    INTEGER",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS news_sentiment        TEXT",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS news_avg_tone         DOUBLE PRECISION",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS country_risk_score    DOUBLE PRECISION",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS country_risk_label    TEXT",
    "ALTER TABLE analytics.enterprise_enrichment ADD COLUMN IF NOT EXISTS country_governance_index DOUBLE PRECISION",

    # Phase C columns — person
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS sanctions_hit        BOOLEAN",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS sanctions_list       TEXT",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS sanctions_score      DOUBLE PRECISION",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS pep_flag             BOOLEAN",
    "ALTER TABLE analytics.person_enrichment ADD COLUMN IF NOT EXISTS sanctions_checked_at TEXT",

    # Phase C columns — address
    "ALTER TABLE analytics.address_enrichment ADD COLUMN IF NOT EXISTS country_risk_score DOUBLE PRECISION",
    "ALTER TABLE analytics.address_enrichment ADD COLUMN IF NOT EXISTS country_risk_label TEXT",

    # Phase C columns — transaction (AML)
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS aml_risk_score  DOUBLE PRECISION",
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS aml_flags       TEXT",
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS anomaly_score   DOUBLE PRECISION",
    "ALTER TABLE analytics.transaction_enrichment ADD COLUMN IF NOT EXISTS anomaly_flag    BOOLEAN",
]


def ensure_enrichment_tables(engine) -> None:
    """
    Create all 8 analytics enrichment tables if they don't exist, then run
    column migrations to add any columns missing from older deployments.
    Safe to call on every startup — all operations are idempotent.
    """
    try:
        with engine.begin() as conn:
            for ddl in _DDL:
                conn.execute(text(ddl))
            for migration in _MIGRATIONS:
                conn.execute(text(migration))
        logger.info("Startup: enrichment tables ready (analytics.*_enrichment, %d migrations applied)", len(_MIGRATIONS))
    except Exception as exc:
        logger.warning("Startup: enrichment table setup failed — %s", exc)
