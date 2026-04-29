"""
etl/setup.py
-------------
Pre-creates all analytics.* and raw.* tables at startup.

Problem solved:
  Every ETL table is created by pandas to_sql() on first write.
  Before the first ETL run, GET endpoints fail with "table does not exist"
  instead of returning []. This causes dashboards, copilot, and agents to
  error rather than gracefully showing empty state.

Fix:
  Call ensure_all_analytics_tables(engine) at startup — after
  ensure_analytics_schema() creates the schemas.

  Uses CREATE TABLE IF NOT EXISTS everywhere — safe to call on every deploy.
  to_sql / load_raw / load_dataframe_replace will recreate raw.* and
  replace-mode tables on first ETL with the real schema; this just ensures
  they exist and return [] instead of erroring before ETL runs.
"""

import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Raw tables — minimal schema.
# load_raw() uses if_exists="replace" so these get recreated with full
# Base44 columns on first ETL run. Pre-creation just prevents 404 on reads.
# ─────────────────────────────────────────────────────────────────────────────
_RAW_TABLES = [
    "people", "enterprises", "products", "transactions",
    "tasks", "addresses", "relationships", "services", "geospatial",
    # New canonical entities
    "documents", "schedules", "signals", "channels", "territories",
    # Agricultural / ecological entities
    "animals", "plots", "observations",
]

_RAW_DDL_TEMPLATE = """
CREATE TABLE IF NOT EXISTS raw.{table} (
    company_id  TEXT,
    _loaded_at  TIMESTAMP
)
"""


# ─────────────────────────────────────────────────────────────────────────────
# Core ETL analytics tables — time-series (load_dataframe APPEND mode).
# load_dataframe() adds snapshot_date + loaded_at on every write.
# ─────────────────────────────────────────────────────────────────────────────
_CORE_ANALYTICS_DDL = [

    """
    CREATE TABLE IF NOT EXISTS analytics.people_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        person_type             TEXT,
        status                  TEXT,
        people_count            BIGINT,
        active_count            BIGINT,
        inactive_count          BIGINT,
        retention_rate_pct      DOUBLE PRECISION,
        is_staff                BOOLEAN,
        is_participant          BOOLEAN,
        is_contact              BOOLEAN,
        avg_tenure_days         DOUBLE PRECISION,
        new_last_7d             BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.enterprise_summary (
        id                      TEXT,
        company_id              TEXT,
        name                    TEXT,
        enterprise_type         TEXT,
        status                  TEXT,
        operating_status        TEXT,
        is_active               BOOLEAN,
        is_root                 BOOLEAN,
        parent_id               TEXT,
        primary_address         TEXT,
        phone                   TEXT,
        email                   TEXT,
        website                 TEXT,
        created_date            TEXT,
        days_since_created      DOUBLE PRECISION,
        naics_code              TEXT,
        naics_title             TEXT,
        sic_code                TEXT,
        sic_description         TEXT,
        latitude                DOUBLE PRECISION,
        longitude               DOUBLE PRECISION,
        coord_source            TEXT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.product_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        item_type               TEXT,
        status                  TEXT,
        total_products          BIGINT,
        total_stock             DOUBLE PRECISION,
        avg_price               DOUBLE PRECISION,
        avg_cost_price          DOUBLE PRECISION,
        total_inventory_value   DOUBLE PRECISION,
        avg_gross_margin_pct    DOUBLE PRECISION,
        low_stock_count         BIGINT,
        out_of_stock_count      BIGINT,
        expiring_7d_count       BIGINT,
        expiring_30d_count      BIGINT,
        is_medication           BOOLEAN,
        is_livestock            BOOLEAN,
        is_perishable           BOOLEAN,
        is_digital              BOOLEAN,
        is_equipment            BOOLEAN,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.transaction_summary (
        enterprise_id               TEXT,
        company_id                  TEXT,
        transaction_type            TEXT,
        status                      TEXT,
        total_transactions          BIGINT,
        total_amount                DOUBLE PRECISION,
        avg_amount                  DOUBLE PRECISION,
        outstanding_amount          DOUBLE PRECISION,
        is_revenue                  BOOLEAN,
        is_expense                  BOOLEAN,
        revenue_last_7d             BIGINT,
        revenue_last_30d            BIGINT,
        expense_last_30d            BIGINT,
        revenue_amount_last_7d      DOUBLE PRECISION,
        revenue_amount_last_30d     DOUBLE PRECISION,
        revenue_amount_last_90d     DOUBLE PRECISION,
        revenue_amount_prev_30d     DOUBLE PRECISION,
        expense_amount_last_30d     DOUBLE PRECISION,
        expense_amount_prev_30d     DOUBLE PRECISION,
        avg_days_to_pay             DOUBLE PRECISION,
        snapshot_date               DATE,
        loaded_at                   TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.task_summary (
        enterprise_id               TEXT,
        company_id                  TEXT,
        task_type                   TEXT,
        status                      TEXT,
        total_tasks                 BIGINT,
        completed_tasks             BIGINT,
        completion_rate_pct         DOUBLE PRECISION,
        overdue_tasks               BIGINT,
        tasks_last_7d               BIGINT,
        tasks_last_30d              BIGINT,
        refused_tasks               BIGINT,
        missed_tasks                BIGINT,
        avg_completion_delay_mins   DOUBLE PRECISION,
        total_quantity_used         DOUBLE PRECISION,
        snapshot_date               DATE,
        loaded_at                   TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.address_summary (
        id                      TEXT,
        company_id              TEXT,
        label                   TEXT,
        address_line_1          TEXT,
        address_line_2          TEXT,
        city                    TEXT,
        state_region            TEXT,
        postal_code             TEXT,
        country                 TEXT,
        full_address            TEXT,
        latitude                DOUBLE PRECISION,
        longitude               DOUBLE PRECISION,
        has_coordinates         BOOLEAN,
        coordinate_source       TEXT,
        address_type            TEXT,
        linked_entity_type      TEXT,
        enterprise_id           TEXT,
        person_id               TEXT,
        status                  TEXT,
        is_active               BOOLEAN,
        created_date            TEXT,
        days_since_created      DOUBLE PRECISION,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.relationship_summary (
        id                      TEXT,
        company_id              TEXT,
        relationship_type       TEXT,
        relationship_category   TEXT,
        person_name             TEXT,
        enterprise_name         TEXT,
        item_name               TEXT,
        service_name            TEXT,
        address_label           TEXT,
        role                    TEXT,
        status                  TEXT,
        is_active               BOOLEAN,
        is_ended                BOOLEAN,
        start_date              TEXT,
        end_date                TEXT,
        has_end_date            BOOLEAN,
        duration_days           DOUBLE PRECISION,
        created_date            TEXT,
        days_since_created      DOUBLE PRECISION,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.service_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        service_type            TEXT,
        status                  TEXT,
        category                TEXT,
        service_count           BIGINT,
        active_service_count    BIGINT,
        inactive_service_count  BIGINT,
        total_billable_value    DOUBLE PRECISION,
        avg_rate                DOUBLE PRECISION,
        max_rate                DOUBLE PRECISION,
        min_rate                DOUBLE PRECISION,
        is_billable             BOOLEAN,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.geospatial_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        name                    TEXT,
        enterprise_type         TEXT,
        status                  TEXT,
        primary_address         TEXT,
        latitude                DOUBLE PRECISION,
        longitude               DOUBLE PRECISION,
        geocoded_at             TEXT,
        geocode_source          TEXT,
        cluster_id              TEXT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    # ── New canonical entities ─────────────────────────────────────────────────

    """
    CREATE TABLE IF NOT EXISTS analytics.document_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        document_type           TEXT,
        status                  TEXT,
        document_count          BIGINT,
        active_count            BIGINT,
        expired_count           BIGINT,
        signed_count            BIGINT,
        is_contract             BOOLEAN,
        is_invoice              BOOLEAN,
        is_policy               BOOLEAN,
        new_last_7d             BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.schedule_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        schedule_type           TEXT,
        frequency               TEXT,
        status                  TEXT,
        schedule_count          BIGINT,
        active_count            BIGINT,
        paused_count            BIGINT,
        is_daily                BOOLEAN,
        is_weekly               BOOLEAN,
        is_monthly              BOOLEAN,
        new_last_7d             BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.signal_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        signal_type             TEXT,
        unit_of_measure         TEXT,
        status                  TEXT,
        signal_count            BIGINT,
        active_count            BIGINT,
        anomaly_count           BIGINT,
        avg_value               DOUBLE PRECISION,
        is_sensor               BOOLEAN,
        is_survey               BOOLEAN,
        new_last_7d             BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.channel_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        channel_type            TEXT,
        purpose                 TEXT,
        status                  TEXT,
        channel_count           BIGINT,
        active_count            BIGINT,
        positive_count          BIGINT,
        negative_count          BIGINT,
        total_messages          BIGINT,
        is_whatsapp             BOOLEAN,
        is_email                BOOLEAN,
        new_last_7d             BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.territory_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        territory_type          TEXT,
        country                 TEXT,
        status                  TEXT,
        territory_count         BIGINT,
        active_count            BIGINT,
        total_area_km2          DOUBLE PRECISION,
        total_population        DOUBLE PRECISION,
        is_sales_zone           BOOLEAN,
        is_delivery_zone        BOOLEAN,
        is_catchment            BOOLEAN,
        new_last_7d             BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    # ── Agricultural / ecological entities ────────────────────────────────────

    """
    CREATE TABLE IF NOT EXISTS analytics.animal_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        animal_type             TEXT,
        species                 TEXT,
        status                  TEXT,
        animal_count            BIGINT,
        active_count            BIGINT,
        inactive_count          BIGINT,
        avg_age_days            DOUBLE PRECISION,
        avg_weight_kg           DOUBLE PRECISION,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.plot_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        plot_type               TEXT,
        land_use                TEXT,
        status                  TEXT,
        plot_count              BIGINT,
        active_count            BIGINT,
        inactive_count          BIGINT,
        total_area_ha           DOUBLE PRECISION,
        avg_area_ha             DOUBLE PRECISION,
        plots_with_coords       BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.observation_summary (
        enterprise_id           TEXT,
        company_id              TEXT,
        observation_type        TEXT,
        unit_of_measure         TEXT,
        subject_type            TEXT,
        observation_count       BIGINT,
        avg_value               DOUBLE PRECISION,
        min_value               DOUBLE PRECISION,
        max_value               DOUBLE PRECISION,
        anomaly_count           BIGINT,
        new_last_7d             BIGINT,
        new_last_30d            BIGINT,
        snapshot_date           DATE,
        loaded_at               TIMESTAMP
    )
    """,
]


# ─────────────────────────────────────────────────────────────────────────────
# Enhanced / intelligence analytics tables — current-state snapshots
# (load_dataframe_replace — DROP + recreate on every ETL run).
# Pre-creation ensures reads return [] instead of 500 before first ETL.
# ─────────────────────────────────────────────────────────────────────────────
_ENHANCED_ANALYTICS_DDL = [

    """
    CREATE TABLE IF NOT EXISTS analytics.monthly_kpis (
        company_id              TEXT,
        year_month              TEXT,
        revenue                 DOUBLE PRECISION,
        expense                 DOUBLE PRECISION,
        net                     DOUBLE PRECISION,
        transaction_count       BIGINT,
        new_people              BIGINT,
        new_clients             BIGINT,
        new_staff               BIGINT,
        tasks_created           BIGINT,
        tasks_completed         BIGINT,
        task_completion_rate_pct DOUBLE PRECISION,
        snapshot_date           DATE
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.entity_index (
        entity_id               TEXT,
        company_id              TEXT,
        enterprise_id           TEXT,
        entity_name             TEXT,
        entity_type             TEXT,
        entity_subtype          TEXT,
        status                  TEXT,
        availability_status     TEXT,
        tenure_days             DOUBLE PRECISION,
        is_staff                BOOLEAN,
        is_participant          BOOLEAN,
        is_contact              BOOLEAN,
        new_last_30d            BOOLEAN,
        became_inactive_30d     BOOLEAN,
        snapshot_date           DATE
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.company_scorecard (
        company_id              TEXT,
        snapshot_date           DATE,
        total_people            BIGINT,
        active_people           BIGINT,
        active_clients          BIGINT,
        active_staff            BIGINT,
        total_contacts          BIGINT,
        new_people_30d          BIGINT,
        churn_risk_count        BIGINT,
        total_enterprises       BIGINT,
        active_enterprises      BIGINT,
        revenue_30d             DOUBLE PRECISION,
        expense_30d             DOUBLE PRECISION,
        net_30d                 DOUBLE PRECISION,
        outstanding_amount      DOUBLE PRECISION,
        total_transactions_30d  BIGINT,
        tasks_created_30d       BIGINT,
        tasks_completed_30d     BIGINT,
        task_completion_rate_pct DOUBLE PRECISION,
        overdue_tasks           BIGINT,
        total_products          BIGINT,
        low_stock_count         BIGINT,
        out_of_stock_count      BIGINT,
        expiring_7d_count       BIGINT,
        total_inventory_value   DOUBLE PRECISION
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.kpi_summary (
        company_id                  TEXT,
        total_people                BIGINT,
        active_staff                BIGINT,
        active_clients              BIGINT,
        inactive_people             BIGINT,
        client_staff_ratio          DOUBLE PRECISION,
        new_clients_30d             BIGINT,
        revenue_30d                 DOUBLE PRECISION,
        expense_30d                 DOUBLE PRECISION,
        net_profit_30d              DOUBLE PRECISION,
        revenue_prev_30d            DOUBLE PRECISION,
        mom_revenue_growth_pct      DOUBLE PRECISION,
        revenue_90d                 DOUBLE PRECISION,
        overdue_invoice_total       DOUBLE PRECISION,
        overdue_invoice_count       BIGINT,
        avg_days_to_pay             DOUBLE PRECISION,
        open_tasks                  BIGINT,
        total_tasks                 BIGINT,
        overdue_tasks               BIGINT,
        task_completion_rate_pct    DOUBLE PRECISION,
        avg_task_completion_days    DOUBLE PRECISION,
        total_products              BIGINT,
        low_stock_count             BIGINT,
        dead_stock_count            BIGINT,
        out_of_stock_count          BIGINT,
        total_enterprises           BIGINT,
        active_enterprises          BIGINT,
        total_relationships         BIGINT,
        churn_risk_count            BIGINT
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.client_value (
        company_id                  TEXT,
        person_id                   TEXT,
        person_name                 TEXT,
        person_type                 TEXT,
        person_subtype              TEXT,
        enterprise_name             TEXT,
        total_revenue_lifetime      DOUBLE PRECISION,
        total_revenue_12m           DOUBLE PRECISION,
        total_revenue_30d           DOUBLE PRECISION,
        avg_transaction_amount      DOUBLE PRECISION,
        transaction_count_lifetime  BIGINT,
        transaction_count_12m       BIGINT,
        last_transaction_date       TEXT,
        first_transaction_date      TEXT,
        days_since_last_tx          DOUBLE PRECISION,
        rfm_recency_score           BIGINT,
        rfm_frequency_score         BIGINT,
        rfm_monetary_score          BIGINT,
        rfm_total_score             BIGINT,
        rfm_segment                 TEXT,
        avg_days_to_pay             DOUBLE PRECISION,
        payment_on_time_rate_pct    DOUBLE PRECISION,
        churn_risk                  BOOLEAN
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.staff_performance (
        company_id              TEXT,
        person_id               TEXT,
        person_name             TEXT,
        person_subtype          TEXT,
        enterprise_name         TEXT,
        availability_status     TEXT,
        current_status          TEXT,
        tasks_assigned_total    BIGINT,
        tasks_completed_total   BIGINT,
        tasks_open              BIGINT,
        tasks_overdue           BIGINT,
        completion_rate_pct     DOUBLE PRECISION,
        avg_completion_days     DOUBLE PRECISION,
        tasks_completed_30d     BIGINT,
        tasks_completed_7d      BIGINT,
        sla_breach_count        BIGINT,
        sla_breach_rate_pct     DOUBLE PRECISION,
        on_time_rate_pct        DOUBLE PRECISION,
        tasks_per_day_30d       DOUBLE PRECISION,
        workload_score          DOUBLE PRECISION
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.ar_aging (
        company_id              TEXT,
        transaction_id          TEXT,
        client_name             TEXT,
        enterprise_name         TEXT,
        transaction_type        TEXT,
        invoice_date            TEXT,
        due_date                TEXT,
        amount                  DOUBLE PRECISION,
        days_overdue            BIGINT,
        aging_bucket            TEXT
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.ar_aging_summary (
        company_id              TEXT,
        total_outstanding       DOUBLE PRECISION,
        current_amount          DOUBLE PRECISION,
        bucket_1_30_amount      DOUBLE PRECISION,
        bucket_31_60_amount     DOUBLE PRECISION,
        bucket_61_90_amount     DOUBLE PRECISION,
        bucket_90plus_amount    DOUBLE PRECISION,
        invoice_count           BIGINT,
        oldest_invoice_days     BIGINT
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.product_velocity (
        company_id              TEXT,
        product_id              TEXT,
        product_name            TEXT,
        item_type               TEXT,
        item_class              TEXT,
        item_subtype            TEXT,
        unit_of_measure         TEXT,
        stock_quantity          DOUBLE PRECISION,
        reorder_level           DOUBLE PRECISION,
        out_of_stock            BOOLEAN,
        below_reorder           BOOLEAN,
        units_sold_30d          DOUBLE PRECISION,
        units_sold_90d          DOUBLE PRECISION,
        revenue_30d             DOUBLE PRECISION,
        revenue_90d             DOUBLE PRECISION,
        transaction_count_30d   BIGINT,
        last_sale_date          TEXT,
        days_since_last_sale    DOUBLE PRECISION,
        dead_stock              BOOLEAN,
        avg_daily_sales_30d     DOUBLE PRECISION,
        stock_coverage_days     DOUBLE PRECISION,
        reorder_urgency         TEXT
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.network_summary (
        company_id              TEXT,
        enterprise_name         TEXT,
        enterprise_type         TEXT,
        enterprise_tier         TEXT,
        operating_status        TEXT,
        city                    TEXT,
        region                  TEXT,
        country                 TEXT,
        staff_count             BIGINT,
        client_count            BIGINT,
        total_people            BIGINT,
        revenue_30d             DOUBLE PRECISION,
        expense_30d             DOUBLE PRECISION,
        net_profit_30d          DOUBLE PRECISION,
        transaction_count_30d   BIGINT,
        overdue_invoice_count   BIGINT,
        open_tasks              BIGINT,
        overdue_tasks           BIGINT,
        completion_rate_pct     DOUBLE PRECISION,
        low_stock_count         BIGINT,
        out_of_stock_count      BIGINT,
        revenue_rank            BIGINT,
        completion_rank         BIGINT,
        performance_score       DOUBLE PRECISION,
        performance_tier        TEXT
    )
    """,

    """
    CREATE TABLE IF NOT EXISTS analytics.concentration_risk (
        company_id                  TEXT,
        revenue_hhi                 DOUBLE PRECISION,
        revenue_concentration       TEXT,
        top_client_name             TEXT,
        top_client_revenue_pct      DOUBLE PRECISION,
        top_3_clients_revenue_pct   DOUBLE PRECISION,
        top_client_count            BIGINT,
        client_hhi                  DOUBLE PRECISION,
        client_concentration        TEXT,
        top_enterprise_client_count BIGINT,
        staff_hhi                   DOUBLE PRECISION,
        staff_concentration         TEXT,
        single_staff_enterprises    BIGINT,
        no_staff_enterprises        BIGINT,
        concentration_risk_level    TEXT,
        concentration_flags         TEXT
    )
    """,
]


# ─────────────────────────────────────────────────────────────────────────────
# Copilot memory — key-value store, already has lazy DDL but moving to startup
# ─────────────────────────────────────────────────────────────────────────────
_OTHER_DDL = [
    """
    CREATE TABLE IF NOT EXISTS analytics.copilot_memory (
        id          SERIAL PRIMARY KEY,
        company_id  TEXT NOT NULL,
        memory_type TEXT NOT NULL DEFAULT 'note',
        key         TEXT NOT NULL,
        value       TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (company_id, key)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_copilot_memory_company ON analytics.copilot_memory (company_id)",

    # ── Production Infra: backup log ─────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.backup_log (
        backup_id   TEXT PRIMARY KEY,
        started_at  TEXT,
        ended_at    TEXT,
        status      TEXT,
        size_bytes  BIGINT,
        storage     TEXT,
        error       TEXT,
        duration_s  DOUBLE PRECISION
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_backup_log_started ON analytics.backup_log (started_at DESC)",

    # ── Onboarding: tenant provisioning log ──────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.onboarding_log (
        id                     SERIAL PRIMARY KEY,
        company_id             TEXT,
        enterprise_type        TEXT,
        cluster                TEXT,
        taxonomy_count         INTEGER,
        workflows_created      INTEGER,
        ai_readiness_score     INTEGER,
        steps_completed        INTEGER,
        people_added           INTEGER,
        products_added         INTEGER,
        tasks_created          INTEGER,
        invites_sent           INTEGER,
        provisioned_at         TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_onboarding_log_company ON analytics.onboarding_log (company_id)",

    # ── BI Export: access log ─────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.bi_export_log (
        id          SERIAL PRIMARY KEY,
        company_id  TEXT,
        report      TEXT,
        format      TEXT,
        file_size_bytes BIGINT,
        exported_at TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_bi_export_log_company ON analytics.bi_export_log (company_id, exported_at DESC)",

    # ── Platform admin: audit log + tenant flags ──────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.admin_audit_log (
        id           SERIAL PRIMARY KEY,
        action       TEXT,
        company_id   TEXT,
        performed_by TEXT,
        detail       TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_admin_audit_company ON analytics.admin_audit_log (company_id, created_at DESC)",
    """
    CREATE TABLE IF NOT EXISTS analytics.tenant_flags (
        company_id  TEXT,
        flag        TEXT,
        set_by      TEXT,
        set_at      TIMESTAMPTZ DEFAULT NOW(),
        reason      TEXT,
        PRIMARY KEY (company_id, flag)
    )
    """,

    # ── Security: 2FA / TOTP secrets ─────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.user_2fa_secrets (
        user_id     TEXT PRIMARY KEY,
        company_id  TEXT,
        secret      TEXT,
        status      TEXT DEFAULT 'pending',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        verified_at TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_user_2fa_company ON analytics.user_2fa_secrets (company_id)",

    # ── Time / Attendance analytics ───────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.time_summary (
        company_id          TEXT,
        person_id           TEXT,
        person_name         TEXT,
        enterprise_id       TEXT,
        enterprise_name     TEXT,
        work_date           DATE,
        week_start          DATE,
        clock_in_time       TEXT,
        clock_out_time      TEXT,
        total_hours         DOUBLE PRECISION,
        break_hours         DOUBLE PRECISION,
        net_hours           DOUBLE PRECISION,
        is_overtime         BOOLEAN,
        scheduled_hours     DOUBLE PRECISION,
        utilisation_pct     DOUBLE PRECISION,
        snapshot_date       DATE,
        loaded_at           TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_time_summary_company ON analytics.time_summary (company_id, work_date DESC)",
    "CREATE INDEX IF NOT EXISTS idx_time_summary_person  ON analytics.time_summary (company_id, person_id)",

    # ── Market Intelligence write-back ───────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.mi_competitors (
        id                  SERIAL PRIMARY KEY,
        company_id          TEXT,
        linked_enterprise_id TEXT,
        linked_enterprise_name TEXT,
        competitor_name     TEXT,
        competitor_type     TEXT,
        distance_km         DOUBLE PRECISION,
        address             TEXT,
        phone               TEXT,
        website             TEXT,
        rating              DOUBLE PRECISION,
        lat                 DOUBLE PRECISION,
        lon                 DOUBLE PRECISION,
        source_location     TEXT,
        business_type       TEXT,
        relationship_id     TEXT,
        saved_at            TIMESTAMPTZ DEFAULT NOW()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_mi_competitors_company ON analytics.mi_competitors (company_id)",
    "CREATE INDEX IF NOT EXISTS idx_mi_competitors_enterprise ON analytics.mi_competitors (linked_enterprise_id)",
]


# ─────────────────────────────────────────────────────────────────────────────
# Column migrations — run after every CREATE TABLE IF NOT EXISTS.
# Required for live deployments where the table already exists but is missing
# columns added in later phases. Add one entry per new column on any existing
# table — otherwise live deployments crash with "column does not exist".
# ─────────────────────────────────────────────────────────────────────────────
_INGESTION_DDL = [
    # ── Ingestion plans — pending/approved/loaded mapping plans ───────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.ingestion_plans (
        id                  TEXT PRIMARY KEY,
        company_id          TEXT NOT NULL,
        source_name         TEXT,
        source_fingerprint  TEXT,
        file_type           TEXT,
        row_count           BIGINT,
        plan_json           TEXT,
        rows_json           TEXT,
        status              TEXT DEFAULT 'draft',
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at         TIMESTAMPTZ,
        reviewed_by         TEXT,
        loaded_at           TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ingestion_plans_company ON analytics.ingestion_plans (company_id, status)",

    # ── Ingestion memory — learned mappings per company+fingerprint ───────────
    """
    CREATE TABLE IF NOT EXISTS analytics.ingestion_memory (
        id                  SERIAL PRIMARY KEY,
        company_id          TEXT NOT NULL,
        source_fingerprint  TEXT NOT NULL,
        source_name         TEXT,
        mapping_json        TEXT,
        use_count           BIGINT DEFAULT 1,
        last_used_at        TIMESTAMPTZ DEFAULT NOW(),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (company_id, source_fingerprint)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ingestion_memory_company ON analytics.ingestion_memory (company_id)",

    # ── Ingestion runs — execution history ────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS analytics.ingestion_runs (
        id                      TEXT PRIMARY KEY,
        company_id              TEXT NOT NULL,
        plan_id                 TEXT,
        status                  TEXT DEFAULT 'running',
        rows_total              BIGINT DEFAULT 0,
        entities_created        BIGINT DEFAULT 0,
        entities_updated        BIGINT DEFAULT 0,
        entities_skipped        BIGINT DEFAULT 0,
        entities_failed         BIGINT DEFAULT 0,
        relationships_created   BIGINT DEFAULT 0,
        errors_json             TEXT,
        started_at              TIMESTAMPTZ DEFAULT NOW(),
        finished_at             TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ingestion_runs_company ON analytics.ingestion_runs (company_id, started_at DESC)",
]


_MIGRATIONS = [
    # Ingestion agent — rows cache for copilot-triggered load
    "ALTER TABLE analytics.ingestion_plans ADD COLUMN IF NOT EXISTS rows_json TEXT",
    # Gap 1: outcome reason counts
    "ALTER TABLE analytics.task_summary ADD COLUMN IF NOT EXISTS refused_tasks             BIGINT",
    "ALTER TABLE analytics.task_summary ADD COLUMN IF NOT EXISTS missed_tasks              BIGINT",
    # Gap 2: schedule adherence
    "ALTER TABLE analytics.task_summary ADD COLUMN IF NOT EXISTS avg_completion_delay_mins DOUBLE PRECISION",
    # Gap 3: quantity consumed
    "ALTER TABLE analytics.task_summary ADD COLUMN IF NOT EXISTS total_quantity_used       DOUBLE PRECISION",
]


def ensure_all_analytics_tables(engine) -> None:
    """
    Pre-create all analytics.* and raw.* tables using CREATE TABLE IF NOT EXISTS.
    Safe to call on every startup — idempotent.

    Prevents "table does not exist" errors on GET endpoints before the first
    ETL run. Tables will be empty until ETL populates them.
    """
    created = 0
    errors  = 0

    try:
        with engine.begin() as conn:
            # Raw tables — minimal schema (load_raw replaces on first ETL)
            for table in _RAW_TABLES:
                try:
                    conn.execute(text(_RAW_DDL_TEMPLATE.format(table=table)))
                    created += 1
                except Exception as exc:
                    logger.warning("setup: raw.%s — %s", table, exc)
                    errors += 1

            # Core ETL analytics tables (append / time-series)
            for ddl in _CORE_ANALYTICS_DDL:
                try:
                    conn.execute(text(ddl))
                    created += 1
                except Exception as exc:
                    logger.warning("setup: core analytics DDL failed — %s", exc)
                    errors += 1

            # Enhanced analytics tables (replace / current-state)
            for ddl in _ENHANCED_ANALYTICS_DDL:
                try:
                    conn.execute(text(ddl))
                    created += 1
                except Exception as exc:
                    logger.warning("setup: enhanced analytics DDL failed — %s", exc)
                    errors += 1

            # Ingestion agent tables
            for ddl in _INGESTION_DDL:
                try:
                    conn.execute(text(ddl))
                    created += 1
                except Exception as exc:
                    logger.warning("setup: ingestion DDL failed — %s", exc)
                    errors += 1

            # Other (copilot_memory, etc.)
            for ddl in _OTHER_DDL:
                try:
                    conn.execute(text(ddl))
                    created += 1
                except Exception as exc:
                    logger.warning("setup: other DDL failed — %s", exc)
                    errors += 1

            # Column migrations — add new columns to existing tables
            for migration in _MIGRATIONS:
                try:
                    conn.execute(text(migration))
                    created += 1
                except Exception as exc:
                    logger.warning("setup: migration failed — %s", exc)
                    errors += 1

        logger.info(
            "Startup: analytics tables ready — %d statements executed, %d errors",
            created, errors,
        )

    except Exception as exc:
        logger.warning("Startup: ensure_all_analytics_tables failed — %s", exc)
