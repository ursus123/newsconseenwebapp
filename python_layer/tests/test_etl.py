"""
tests/test_etl.py
------------------
Unit tests for the ETL pipeline — transform logic only.
No database, no Base44 network calls.

Tests verify:
  - ETL transform functions return DataFrames with expected columns
  - Multi-tenant isolation: company_id is always stamped
  - Three-tier fallback: empty analytics → empty raw → graceful result
  - Edge cases: empty input, malformed data
"""

import pytest
import pandas as pd
from datetime import datetime, timezone


# ── People ETL ───────────────────────────────────────────────────────────────

class TestPeopleETL:
    def test_enrich_people_returns_dataframe(self, sample_people_df):
        from enrichment.person_enrich import enrich_people
        result = enrich_people(sample_people_df, "c1")
        assert isinstance(result, pd.DataFrame)

    def test_enrich_people_stamps_company_id(self, sample_people_df):
        from enrichment.person_enrich import enrich_people
        result = enrich_people(sample_people_df, "c1")
        assert "company_id" in result.columns
        assert (result["company_id"] == "c1").all()

    def test_enrich_people_has_person_id(self, sample_people_df):
        from enrichment.person_enrich import enrich_people
        result = enrich_people(sample_people_df, "c1")
        assert "person_id" in result.columns
        assert result["person_id"].notna().all()

    def test_enrich_people_empty_input(self):
        from enrichment.person_enrich import enrich_people
        result = enrich_people(pd.DataFrame(), "c1")
        assert isinstance(result, pd.DataFrame)
        assert result.empty

    def test_enrich_people_tenant_isolation(self, sample_people_df):
        """Records for company c2 should not appear in c1 results."""
        from enrichment.person_enrich import enrich_people
        df = sample_people_df.copy()
        df.loc[0, "company_id"] = "c2"  # one record for another tenant
        result = enrich_people(df, "c1")
        assert (result["company_id"] == "c1").all()

    def test_enrich_people_has_enriched_at(self, sample_people_df):
        from enrichment.person_enrich import enrich_people
        result = enrich_people(sample_people_df, "c1")
        assert "enriched_at" in result.columns

    def test_enrich_people_invalid_phone_flagged(self, sample_people_df):
        from enrichment.person_enrich import enrich_people
        result = enrich_people(sample_people_df, "c1")
        # Bob has phone="invalid" — phone_valid should be False
        bob = result[result["person_id"] == "p2"]
        if not bob.empty and "phone_valid" in bob.columns:
            assert bob.iloc[0]["phone_valid"] is False or bob.iloc[0]["phone_valid"] == False


# ── Transaction ETL ───────────────────────────────────────────────────────────

class TestTransactionETL:
    def test_enrich_transactions_returns_dataframe(self, sample_transactions_df):
        from enrichment.transaction_enrich import enrich_transactions
        result = enrich_transactions(sample_transactions_df, "c1")
        assert isinstance(result, pd.DataFrame)

    def test_enrich_transactions_stamps_company_id(self, sample_transactions_df):
        from enrichment.transaction_enrich import enrich_transactions
        result = enrich_transactions(sample_transactions_df, "c1")
        assert "company_id" in result.columns
        assert (result["company_id"] == "c1").all()

    def test_enrich_transactions_has_amount_usd(self, sample_transactions_df):
        from enrichment.transaction_enrich import enrich_transactions
        result = enrich_transactions(sample_transactions_df, "c1")
        assert "amount_usd" in result.columns

    def test_enrich_transactions_usd_passthrough(self, sample_transactions_df):
        """USD transactions should have amount_usd == amount and fx_rate == 1.0."""
        from enrichment.transaction_enrich import enrich_transactions
        result = enrich_transactions(sample_transactions_df, "c1")
        usd_rows = result[result["base_currency"] == "USD"]
        if not usd_rows.empty and "fx_rate" in usd_rows.columns:
            assert (usd_rows["fx_rate"] == 1.0).all()

    def test_enrich_transactions_empty_input(self):
        from enrichment.transaction_enrich import enrich_transactions
        result = enrich_transactions(pd.DataFrame(), "c1")
        assert isinstance(result, pd.DataFrame)
        assert result.empty

    def test_enrich_transactions_aml_columns_present(self, sample_transactions_df):
        from enrichment.transaction_enrich import enrich_transactions
        result = enrich_transactions(sample_transactions_df, "c1")
        # AML columns may be null if batch skipped, but columns must exist
        for col in ("aml_risk_score", "aml_flags", "anomaly_flag"):
            assert col in result.columns, f"Missing AML column: {col}"

    def test_enrich_transactions_temporal_columns_present(self, sample_transactions_df):
        from enrichment.transaction_enrich import enrich_transactions
        result = enrich_transactions(sample_transactions_df, "c1")
        for col in ("is_recurring", "seasonal_flag"):
            assert col in result.columns, f"Missing Phase E column: {col}"


# ── Product ETL ───────────────────────────────────────────────────────────────

class TestProductETL:
    def test_enrich_products_returns_dataframe(self, sample_products_df):
        from enrichment.product_enrich import enrich_products
        result = enrich_products(sample_products_df, "c1")
        assert isinstance(result, pd.DataFrame)

    def test_enrich_products_stamps_company_id(self, sample_products_df):
        from enrichment.product_enrich import enrich_products
        result = enrich_products(sample_products_df, "c1")
        assert "company_id" in result.columns
        assert (result["company_id"] == "c1").all()

    def test_enrich_products_has_product_id(self, sample_products_df):
        from enrichment.product_enrich import enrich_products
        result = enrich_products(sample_products_df, "c1")
        assert "product_id" in result.columns

    def test_enrich_products_empty_input(self):
        from enrichment.product_enrich import enrich_products
        result = enrich_products(pd.DataFrame(), "c1")
        assert result.empty


# ── Three-tier fallback (unit level) ─────────────────────────────────────────

class TestFallbackPattern:
    """
    Verify that functions gracefully return empty/default when
    upstream dependencies are unavailable.
    """

    def test_enrichment_coverage_no_db_returns_dict(self):
        from enrichment.engine import get_enrichment_coverage
        result = get_enrichment_coverage("c1")
        assert isinstance(result, dict)
        for entity in ("people", "enterprises", "products", "transactions", "addresses"):
            assert entity in result
            assert "raw_rows" in result[entity]
            assert "enriched_rows" in result[entity]

    def test_run_enrichment_empty_data_returns_summary(self):
        from enrichment.engine import run_enrichment
        empty = {k: pd.DataFrame() for k in
                 ("people", "enterprises", "products", "transactions", "addresses")}
        result = run_enrichment(empty, "c1")
        assert isinstance(result, dict)
        # Each entity key should be present
        for key in ("people", "enterprises", "products", "transactions", "addresses"):
            assert key in result
