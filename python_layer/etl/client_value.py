"""
etl/client_value.py
-------------------
analytics.client_value — one row per (company_id, person_id) for every client.

Enables the Retention Agent, copilot get_top_clients tool, and CLV dashboard.

RFM model:
    Recency   — days since last transaction
    Frequency — number of posted transactions in last 12 months
    Monetary  — total posted revenue attributed to this client (lifetime)

Columns produced:
    company_id
    person_id             Base44 person id
    person_name           full_name or first+last
    person_type           canonical type (client / patient / student / etc.)
    person_subtype
    enterprise_name       primary linked enterprise (from relationships)

    -- Monetary --
    total_revenue_lifetime     sum of all posted revenue transactions
    total_revenue_12m          sum of posted revenue last 12 months
    total_revenue_30d          sum of posted revenue last 30 days
    avg_transaction_amount     mean amount per transaction
    transaction_count_lifetime count of all posted transactions
    transaction_count_12m      count of posted transactions last 12 months

    -- Recency / Frequency --
    last_transaction_date      ISO date of most recent transaction
    days_since_last_tx         days since last transaction (null if none)
    first_transaction_date     ISO date of first transaction

    -- RFM scores (1–5 quintile, 5=best) --
    rfm_recency_score
    rfm_frequency_score
    rfm_monetary_score
    rfm_total_score            sum of three scores (3–15)
    rfm_segment                high_value / at_risk / new / lost / dormant / regular

    -- Payment behaviour --
    avg_days_to_pay            mean days from invoice date to payment
    payment_on_time_rate_pct   % of invoices paid on or before due_date

    -- Churn signal --
    churn_risk                 high / medium / low / none
"""

import logging
from datetime import datetime, timezone

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

REVENUE_TYPES = {
    "service_fee", "tuition", "membership_fee", "donation",
    "tithe", "event_income", "grant", "sponsorship",
    "livestock_sale", "crop_sale", "product_sale",
    "rental_income", "interest_income", "refund_received",
}

_CLIENT_TYPES = {
    "client", "patient", "student", "member", "beneficiary",
    "enrollee", "participant", "subscriber", "attendee",
    "learner", "trainee", "resident", "customer", "applicant",
}


def transform_client_value(
    people_df: pd.DataFrame,
    transactions_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build analytics.client_value — one row per client per company.
    """
    now_ts = pd.Timestamp.now(tz="UTC")

    if people_df.empty:
        logger.warning("transform_client_value: empty people_df — returning empty")
        return pd.DataFrame()

    # ── Filter to clients only ────────────────────────────────────────────────
    ppl = people_df.copy()
    pt_col = ppl.get("person_type", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
    clients = ppl[pt_col.isin(_CLIENT_TYPES)].copy()

    if clients.empty:
        logger.info("transform_client_value: no client-type people found")
        return pd.DataFrame()

    # ── Build name column ─────────────────────────────────────────────────────
    if "full_name" in clients.columns:
        clients["_name"] = clients["full_name"].fillna("")
    else:
        fn = clients.get("first_name", pd.Series("", index=clients.index)).fillna("")
        ln = clients.get("last_name",  pd.Series("", index=clients.index)).fillna("")
        clients["_name"] = (fn + " " + ln).str.strip()

    # ── Build primary enterprise from relationships ───────────────────────────
    ent_map: dict = {}
    if not relationships_df.empty and "relationship_type" in relationships_df.columns:
        pe_rels = relationships_df[
            relationships_df["relationship_type"].isin({
                "person_enterprise", "employment", "membership",
                "enrollment", "client_enrollment", "care_assignment",
            })
            & (relationships_df.get("status", pd.Series("", index=relationships_df.index))
               .fillna("").str.lower() != "ended")
        ]
        if "person_id" in pe_rels.columns and "enterprise_name" in pe_rels.columns:
            for _, r in pe_rels.iterrows():
                pid = r.get("person_id")
                ename = r.get("enterprise_name")
                if pid and ename and pid not in ent_map:
                    ent_map[str(pid)] = str(ename)

    # ── Prepare transactions ──────────────────────────────────────────────────
    tx_by_person: dict = {}  # person_id -> DataFrame
    if not transactions_df.empty:
        tx = transactions_df.copy()
        tx["amount"] = pd.to_numeric(tx.get("amount", 0), errors="coerce").fillna(0)
        tx_st = tx.get("status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()
        posted = tx[tx_st == "posted"].copy()

        if not posted.empty:
            tt = posted.get("transaction_type", pd.Series("", index=posted.index)).fillna("").str.lower()
            posted = posted[tt.isin(REVENUE_TYPES)].copy()

            posted["_date"] = pd.to_datetime(
                posted.get("transaction_date", posted.get("created_date")),
                errors="coerce", utc=True,
            )

            # Index by person_id if available, else person_name
            if "person_id" in posted.columns:
                for pid, grp in posted.groupby("person_id", dropna=True):
                    tx_by_person[str(pid)] = grp
            elif "person_name" in posted.columns:
                for pname, grp in posted.groupby("person_name", dropna=True):
                    tx_by_person[str(pname)] = grp

    # ── Build one row per client ──────────────────────────────────────────────
    rows = []
    for _, person in clients.iterrows():
        cid    = str(person.get("company_id", "") or "")
        pid    = str(person.get("id", "") or "")
        pname  = str(person.get("_name", "") or "")

        # Get transactions for this person
        ptx = tx_by_person.get(pid) or tx_by_person.get(pname, pd.DataFrame())

        row: dict = {
            "company_id":   cid,
            "person_id":    pid,
            "person_name":  pname,
            "person_type":  str(person.get("person_type", "") or ""),
            "person_subtype": str(person.get("person_subtype", "") or ""),
            "enterprise_name": ent_map.get(pid, ""),
        }

        if not ptx.empty and "_date" in ptx.columns:
            valid = ptx[ptx["_date"].notna()]
            cutoff_12m = now_ts - pd.Timedelta(days=365)
            cutoff_30d = now_ts - pd.Timedelta(days=30)

            tx_12m = valid[valid["_date"] >= cutoff_12m]
            tx_30d = valid[valid["_date"] >= cutoff_30d]

            row["total_revenue_lifetime"]      = round(float(valid["amount"].sum()), 2)
            row["total_revenue_12m"]           = round(float(tx_12m["amount"].sum()), 2)
            row["total_revenue_30d"]           = round(float(tx_30d["amount"].sum()), 2)
            row["avg_transaction_amount"]      = round(float(valid["amount"].mean()), 2) if len(valid) else 0.0
            row["transaction_count_lifetime"]  = len(valid)
            row["transaction_count_12m"]       = len(tx_12m)
            row["last_transaction_date"]       = str(valid["_date"].max().date()) if not valid.empty else None
            row["first_transaction_date"]      = str(valid["_date"].min().date()) if not valid.empty else None
            row["days_since_last_tx"]          = (
                int((now_ts - valid["_date"].max()).days)
                if not valid.empty else None
            )

            # Payment behaviour
            if "payment_date" in valid.columns and "due_date" in valid.columns:
                valid["_pdate"] = pd.to_datetime(valid["payment_date"], errors="coerce", utc=True)
                valid["_ddate"] = pd.to_datetime(valid["due_date"],     errors="coerce", utc=True)
                paid_mask = valid["_pdate"].notna() & valid["_date"].notna()
                days_arr  = (
                    (valid.loc[paid_mask, "_pdate"] - valid.loc[paid_mask, "_date"])
                    .dt.total_seconds().div(86400)
                )
                row["avg_days_to_pay"] = round(float(days_arr.mean()), 1) if len(days_arr) else None

                on_time_mask = paid_mask & valid["_ddate"].notna() & (valid["_pdate"] <= valid["_ddate"])
                row["payment_on_time_rate_pct"] = (
                    round(float(on_time_mask.sum() / paid_mask.sum() * 100), 1)
                    if paid_mask.sum() > 0 else None
                )
            else:
                row["avg_days_to_pay"] = None
                row["payment_on_time_rate_pct"] = None
        else:
            row.update({
                "total_revenue_lifetime": 0.0, "total_revenue_12m": 0.0,
                "total_revenue_30d": 0.0, "avg_transaction_amount": 0.0,
                "transaction_count_lifetime": 0, "transaction_count_12m": 0,
                "last_transaction_date": None, "first_transaction_date": None,
                "days_since_last_tx": None, "avg_days_to_pay": None,
                "payment_on_time_rate_pct": None,
            })

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df_out = pd.DataFrame(rows)

    # ── RFM scoring (quintile-based, per company) ─────────────────────────────
    df_out = _add_rfm_scores(df_out)

    # ── Churn risk ────────────────────────────────────────────────────────────
    def _churn_risk(row):
        days = row.get("days_since_last_tx")
        if days is None or row.get("transaction_count_lifetime", 0) == 0:
            return "none"
        if days > 180:
            return "high"
        if days > 90:
            return "medium"
        if days > 60:
            return "low"
        return "none"

    df_out["churn_risk"] = df_out.apply(_churn_risk, axis=1)

    logger.info(
        "transform_client_value: produced %d client rows across %d companies",
        len(df_out), df_out["company_id"].nunique(),
    )
    return df_out


def _add_rfm_scores(df: pd.DataFrame) -> pd.DataFrame:
    """Compute RFM quintile scores per company (1=worst, 5=best)."""
    results = []
    for cid, grp in df.groupby("company_id", dropna=True):
        grp = grp.copy()

        def _quintile(series, ascending=True):
            """Rank into 5 buckets; handle ties + all-same values gracefully."""
            if series.nunique() <= 1:
                return pd.Series(3, index=series.index)
            try:
                labels = [1, 2, 3, 4, 5] if ascending else [5, 4, 3, 2, 1]
                return pd.qcut(series, q=5, labels=labels, duplicates="drop").astype(float).fillna(3)
            except Exception:
                return pd.Series(3, index=series.index)

        # Recency: lower days_since = better → ascending=False gives higher score
        rec_col = grp["days_since_last_tx"].fillna(999)
        grp["rfm_recency_score"]   = _quintile(-rec_col)  # negate so lower days → higher score
        grp["rfm_frequency_score"] = _quintile(grp["transaction_count_12m"].fillna(0))
        grp["rfm_monetary_score"]  = _quintile(grp["total_revenue_lifetime"].fillna(0))

        grp["rfm_total_score"] = (
            grp["rfm_recency_score"].fillna(3) +
            grp["rfm_frequency_score"].fillna(3) +
            grp["rfm_monetary_score"].fillna(3)
        )

        def _segment(r):
            total = r.get("rfm_total_score", 9)
            rec   = r.get("rfm_recency_score", 3)
            if total >= 12:
                return "high_value"
            if rec <= 1:
                return "lost"
            if rec <= 2:
                return "at_risk"
            if r.get("transaction_count_lifetime", 0) <= 1:
                return "new"
            if total <= 6:
                return "dormant"
            return "regular"

        grp["rfm_segment"] = grp.apply(_segment, axis=1)
        results.append(grp)

    return pd.concat(results, ignore_index=True) if results else df
