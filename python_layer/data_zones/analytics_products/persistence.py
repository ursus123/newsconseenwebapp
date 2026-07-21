import json
from datetime import date

from sqlalchemy import text


DDL = """
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE TABLE IF NOT EXISTS analytics.operational_object_summaries (
  company_id TEXT NOT NULL, product_name TEXT NOT NULL, subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL, metrics JSONB NOT NULL, derived_from JSONB NOT NULL,
  methodology TEXT NOT NULL, product_version TEXT NOT NULL, computed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, product_name, subject_type, subject_id)
);
CREATE TABLE IF NOT EXISTS analytics.operational_facts_daily (
  company_id TEXT NOT NULL, fact_date DATE NOT NULL, product_name TEXT NOT NULL,
  subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, metrics JSONB NOT NULL,
  derived_from JSONB NOT NULL, methodology TEXT NOT NULL, product_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, fact_date, product_name, subject_type, subject_id)
);
CREATE TABLE IF NOT EXISTS analytics.cross_object_intelligence (
  company_id TEXT NOT NULL, product_name TEXT NOT NULL, subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL, metrics JSONB NOT NULL, derived_from JSONB NOT NULL,
  methodology TEXT NOT NULL, product_version TEXT NOT NULL, computed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, product_name, subject_type, subject_id)
);
CREATE TABLE IF NOT EXISTS analytics.governance_intelligence (
  company_id TEXT NOT NULL, product_name TEXT NOT NULL, subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL, metrics JSONB NOT NULL, derived_from JSONB NOT NULL,
  methodology TEXT NOT NULL, product_version TEXT NOT NULL, computed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, product_name, subject_type, subject_id)
);
CREATE TABLE IF NOT EXISTS analytics.predictive_intelligence (
  company_id TEXT NOT NULL, product_name TEXT NOT NULL, subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL, metrics JSONB NOT NULL, derived_from JSONB NOT NULL,
  methodology TEXT NOT NULL, product_version TEXT NOT NULL, confidence_kind TEXT NOT NULL,
  confidence DOUBLE PRECISION, limitations JSONB NOT NULL, model_version TEXT NOT NULL,
  feature_version TEXT NOT NULL, training_data_window TEXT NOT NULL, input_watermark TIMESTAMPTZ NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, product_name, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS analytics_product_company_idx ON analytics.predictive_intelligence(company_id, product_name, computed_at DESC);
"""


TABLE_BY_LAYER = {
    "operational_summary": "operational_object_summaries",
    "historical_fact": "operational_facts_daily",
    "cross_object_intelligence": "cross_object_intelligence",
    "governance_intelligence": "governance_intelligence",
    "predictive_intelligence": "predictive_intelligence",
}


def ensure_product_tables(engine):
    if engine is None: return False
    with engine.begin() as conn:
        for statement in [part.strip() for part in DDL.split(";") if part.strip()]:
            conn.execute(text(statement))
    return True


def _payload(company_id, row):
    model = row.get("model_metadata") or {}
    return {
        "company_id": company_id, "product_name": row["product_name"],
        "subject_type": row.get("subject_type") or "tenant", "subject_id": row.get("subject_id") or company_id,
        "metrics": json.dumps(row.get("metrics") or {}), "derived_from": json.dumps(row.get("derived_from") or []),
        "methodology": row["methodology"], "product_version": row["product_version"],
        "computed_at": row["computed_at"], "confidence_kind": row.get("confidence_kind"),
        "confidence": row.get("confidence"), "limitations": json.dumps(row.get("limitations") or []),
        "fact_date": row.get("fact_date") or str(date.today()), "model_version": model.get("model_version") or row["product_version"],
        "feature_version": model.get("feature_version") or "not_applicable",
        "training_data_window": model.get("training_data_window") or "not_applicable",
        "input_watermark": model.get("input_watermark") or row["computed_at"],
    }


def persist_layer(engine, company_id: str, layer: str, rows: list[dict]) -> int:
    if engine is None or not rows: return 0
    table = TABLE_BY_LAYER[layer]
    ensure_product_tables(engine)
    fact = layer == "historical_fact"
    predictive = layer == "predictive_intelligence"
    keys = "company_id, fact_date, product_name, subject_type, subject_id" if fact else "company_id, product_name, subject_type, subject_id"
    extra_cols = ", fact_date" if fact else ""
    pred_cols = ", confidence_kind, confidence, limitations, model_version, feature_version, training_data_window, input_watermark" if predictive else ""
    pred_vals = ", :confidence_kind, :confidence, CAST(:limitations AS JSONB), :model_version, :feature_version, :training_data_window, :input_watermark" if predictive else ""
    pred_updates = ", confidence_kind=EXCLUDED.confidence_kind, confidence=EXCLUDED.confidence, limitations=EXCLUDED.limitations, model_version=EXCLUDED.model_version, feature_version=EXCLUDED.feature_version, training_data_window=EXCLUDED.training_data_window, input_watermark=EXCLUDED.input_watermark" if predictive else ""
    sql = text(f"""
        INSERT INTO analytics.{table}
        (company_id, product_name, subject_type, subject_id, metrics, derived_from, methodology, product_version, computed_at{extra_cols}{pred_cols})
        VALUES (:company_id, :product_name, :subject_type, :subject_id, CAST(:metrics AS JSONB), CAST(:derived_from AS JSONB), :methodology, :product_version, :computed_at{', :fact_date' if fact else ''}{pred_vals})
        ON CONFLICT ({keys}) DO UPDATE SET metrics=EXCLUDED.metrics, derived_from=EXCLUDED.derived_from,
          methodology=EXCLUDED.methodology, product_version=EXCLUDED.product_version, computed_at=EXCLUDED.computed_at{pred_updates}
    """)
    with engine.begin() as conn:
        for row in rows: conn.execute(sql, _payload(company_id, row))
    return len(rows)
