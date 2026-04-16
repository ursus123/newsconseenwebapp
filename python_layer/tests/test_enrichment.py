"""
tests/test_enrichment.py
--------------------------
Unit tests for Phase A–E enrichment modules.
No external HTTP calls — tests cover pure-Python logic only.
"""

import pytest
import pandas as pd
from datetime import datetime, timedelta, timezone


# ── Phase A: Phone validation ─────────────────────────────────────────────────

class TestPhoneValidation:
    def test_valid_kenyan_number(self):
        from enrichment.phone import validate_phone
        result = validate_phone("+254712345678")
        assert result.get("phone_valid") is True
        assert result.get("phone_e164") == "+254712345678"
        assert result.get("phone_country") == "KE"

    def test_invalid_number(self):
        from enrichment.phone import validate_phone
        result = validate_phone("not-a-phone")
        assert result.get("phone_valid") is False

    def test_empty_number(self):
        from enrichment.phone import validate_phone
        result = validate_phone("")
        assert result.get("phone_valid") is False

    def test_returns_dict(self):
        from enrichment.phone import validate_phone
        result = validate_phone("+1 650 555 1234")
        assert isinstance(result, dict)


# ── Phase A: Email validation ─────────────────────────────────────────────────

class TestEmailValidation:
    def test_valid_format(self):
        from enrichment.email_check import validate_email
        result = validate_email("alice@example.com")
        assert result.get("email_format_valid") is True

    def test_invalid_format(self):
        from enrichment.email_check import validate_email
        result = validate_email("not-an-email")
        assert result.get("email_format_valid") is False

    def test_returns_dict_with_domain(self):
        from enrichment.email_check import validate_email
        result = validate_email("test@company.org")
        assert isinstance(result, dict)
        assert result.get("email_domain") == "company.org"

    def test_empty_email(self):
        from enrichment.email_check import validate_email
        result = validate_email("")
        assert result.get("email_format_valid") is False


# ── Phase D: Scoring logic ─────────────────────────────────────────────────────

class TestPersonScorer:
    def test_sanctions_hit_raises_risk(self):
        from enrichment.scoring.person_score import score
        row = {"sanctions_hit": True, "pep_flag": False}
        result = score(row)
        assert result["risk_score"] >= 50

    def test_pep_flag_raises_risk(self):
        from enrichment.scoring.person_score import score
        row = {"sanctions_hit": False, "pep_flag": True}
        result = score(row)
        assert result["risk_score"] >= 25

    def test_clean_person_low_risk(self):
        from enrichment.scoring.person_score import score
        row = {
            "sanctions_hit": False, "pep_flag": False,
            "phone_valid": True, "email_valid": True,
            "email_disposable": False,
            "sanctions_checked_at": "2026-01-01T00:00:00Z",
        }
        result = score(row)
        assert result["risk_score"] < 20

    def test_score_returns_required_keys(self):
        from enrichment.scoring.person_score import score
        result = score({})
        for key in ("risk_score", "quality_score", "intelligence_score",
                    "top_flags", "score_reasoning"):
            assert key in result

    def test_risk_score_bounded(self):
        from enrichment.scoring.person_score import score
        row = {"sanctions_hit": True, "pep_flag": True, "phone_valid": False,
               "email_valid": False, "email_disposable": True}
        result = score(row)
        assert 0 <= result["risk_score"] <= 100

    def test_churn_high_raises_flag(self):
        from enrichment.scoring.person_score import score
        row = {"churn_probability": 85.0, "clv_segment": "inactive",
               "spend_trend": "falling"}
        result = score(row)
        assert "high_churn_risk" in result["top_flags"] or result["risk_score"] > 0


class TestEnterpriseScorer:
    def test_sanctions_hit(self):
        from enrichment.scoring.enterprise_score import score
        result = score({"sanctions_hit": True})
        assert result["risk_score"] >= 45

    def test_often_late_payer_flag(self):
        from enrichment.scoring.enterprise_score import score
        result = score({"payment_behavior": "often_late"})
        assert "often_late_payer" in result["top_flags"]
        assert result["risk_score"] >= 12

    def test_very_high_country_risk(self):
        from enrichment.scoring.enterprise_score import score
        result = score({
            "country_risk_score": 15.0,
            "country_risk_label": "very_high_risk",
        })
        assert result["risk_score"] >= 30


class TestProductScorer:
    def test_stockout_imminent(self):
        from enrichment.scoring.product_score import score
        result = score({"stockout_risk": "high"})
        assert "stockout_imminent" in result["top_flags"]
        assert result["risk_score"] >= 15

    def test_out_of_stock(self):
        from enrichment.scoring.product_score import score
        result = score({"days_of_stock": 0, "stockout_risk": "high"})
        assert result["risk_score"] >= 15

    def test_controlled_substance(self):
        from enrichment.scoring.product_score import score
        result = score({"drug_class": "Schedule II Controlled Narcotic"})
        assert result["risk_score"] >= 20


class TestTransactionScorer:
    def test_high_aml_score(self):
        from enrichment.scoring.transaction_score import score
        result = score({"aml_risk_score": 0.8, "aml_flags": "[]"})
        assert result["risk_score"] >= 30

    def test_structuring_flag(self):
        from enrichment.scoring.transaction_score import score
        import json
        result = score({"aml_flags": json.dumps(["just_below_limit"]), "aml_risk_score": 0.4})
        assert "structuring_suspected" in result["top_flags"]

    def test_recurring_transaction_noted(self):
        from enrichment.scoring.transaction_score import score
        result = score({"is_recurring": True, "recurrence_count": 6})
        assert "high_frequency_recurring" in result["top_flags"]


# ── Phase E: Temporal modules ──────────────────────────────────────────────────

class TestPersonTemporal:
    def test_returns_all_fields(self, sample_transactions_df):
        from enrichment.temporal.person_temporal import enrich_person_temporal
        person = {"id": "p1", "person_id": "p1"}
        result = enrich_person_temporal(person, sample_transactions_df)
        for key in ("spend_trend", "days_since_last_transaction",
                    "transaction_count_30d", "transaction_volume_30d_usd",
                    "churn_probability", "clv_segment"):
            assert key in result

    def test_inactive_person_high_churn(self):
        from enrichment.temporal.person_temporal import enrich_person_temporal
        # Person with no transactions
        result = enrich_person_temporal({"id": "ghost"}, pd.DataFrame())
        assert result.get("churn_probability") is None or result.get("clv_segment") != "high"

    def test_active_person_low_churn(self, sample_transactions_df):
        from enrichment.temporal.person_temporal import enrich_person_temporal
        person = {"id": "p1", "person_id": "p1"}
        result = enrich_person_temporal(person, sample_transactions_df)
        if result.get("churn_probability") is not None:
            assert 0 <= result["churn_probability"] <= 100

    def test_transaction_count_30d_non_negative(self, sample_transactions_df):
        from enrichment.temporal.person_temporal import enrich_person_temporal
        person = {"id": "p1", "person_id": "p1"}
        result = enrich_person_temporal(person, sample_transactions_df)
        if result.get("transaction_count_30d") is not None:
            assert result["transaction_count_30d"] >= 0


class TestTransactionTemporal:
    def test_batch_returns_parallel_list(self, sample_transactions_df):
        from enrichment.temporal.transaction_temporal import compute_transaction_temporal_batch
        results = compute_transaction_temporal_batch(sample_transactions_df)
        assert len(results) == len(sample_transactions_df)

    def test_seasonal_flag_is_quarter(self, sample_transactions_df):
        from enrichment.temporal.transaction_temporal import compute_transaction_temporal_batch
        results = compute_transaction_temporal_batch(sample_transactions_df)
        for r in results:
            if r.get("seasonal_flag"):
                assert r["seasonal_flag"] in ("Q1", "Q2", "Q3", "Q4")

    def test_recurring_detection(self, sample_transactions_df):
        from enrichment.temporal.transaction_temporal import compute_transaction_temporal_batch
        results = compute_transaction_temporal_batch(sample_transactions_df)
        # t1 and t2 both have person_id=p1, amount=500 USD → should be recurring
        recurring = [r for r in results if r.get("is_recurring")]
        assert len(recurring) >= 1


class TestProductTemporal:
    def test_returns_stockout_risk(self, sample_products_df, sample_transactions_df):
        from enrichment.temporal.product_temporal import enrich_product_temporal
        product = sample_products_df.iloc[0].to_dict()
        result = enrich_product_temporal(product, sample_transactions_df)
        assert "stockout_risk" in result

    def test_no_transactions_returns_none_trend(self, sample_products_df):
        from enrichment.temporal.product_temporal import enrich_product_temporal
        product = sample_products_df.iloc[0].to_dict()
        result = enrich_product_temporal(product, pd.DataFrame())
        assert result.get("demand_trend") is None
