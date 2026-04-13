import logging
from datetime import datetime, timezone

import pandas as pd

logger = logging.getLogger(__name__)

# How many months of history to materialise each ETL run.
LOOKBACK_MONTHS = 24

# Mirrors etl/transactions.py
REVENUE_TYPES = {
    "service_fee", "tuition", "membership_fee", "donation",
    "tithe", "event_income", "grant", "sponsorship",
    "livestock_sale", "crop_sale", "product_sale",
    "rental_income", "interest_income", "refund_received",
}
EXPENSE_TYPES = {
    "payroll", "contractor_payment", "rent_expense",
    "utility_expense", "supply_purchase", "equipment_purchase",
    "feed_purchase", "vet_expense", "medication_purchase",
    "insurance_expense", "tax_payment", "refund_issued",
    "ministry_expense", "travel_expense", "marketing_expense",
    "other_expense",
}

# Mirrors etl/people.py / config/taxonomy.py
_STAFF_TYPES = {
    "staff", "employee", "contractor", "freelancer",
    "driver", "teacher", "nurse", "agent",
}
_CLIENT_TYPES = {
    "client", "patient", "student", "member", "beneficiary",
    "enrollee", "participant", "subscriber", "attendee",
    "learner", "trainee", "resident", "customer", "applicant",
}


def _month_grid(lookback: int) -> pd.DataFrame:
    """
    Build a DataFrame of year-month strings covering the last N months.
    e.g. ["2023-05", "2023-06", …, "2025-04"]
    """
    now = pd.Timestamp.now(tz="UTC")
    months = pd.date_range(
        end   = now.normalize().replace(day=1),
        periods = lookback,
        freq  = "MS",
    )
    return pd.DataFrame({"year_month": months.strftime("%Y-%m")})


def transform_monthly_kpis(
    people_df:       pd.DataFrame,
    transactions_df: pd.DataFrame,
    tasks_df:        pd.DataFrame,
    lookback_months: int = LOOKBACK_MONTHS,
) -> pd.DataFrame:
    """
    Build analytics.monthly_kpis — one row per (company_id, year_month).

    Columns produced:
        company_id
        year_month              — "YYYY-MM"
        revenue                 — sum of posted revenue transactions
        expense                 — sum of posted expense transactions
        net                     — revenue - expense
        transaction_count       — total posted transactions
        new_people              — people created this month (all types)
        new_clients             — participant/client people created
        new_staff               — staff people created
        tasks_created           — tasks created this month
        tasks_completed         — tasks completed/closed this month
        task_completion_rate_pct

    All amounts in the native currency stored in Base44 (no FX conversion).
    Months with no activity are filled with zeros so the time series is continuous.
    """
    now = pd.Timestamp.now(tz="UTC")

    # ── Discover all company_ids across all inputs ────────────────────────────
    all_companies: set = set()
    for df in [people_df, transactions_df, tasks_df]:
        if not df.empty and "company_id" in df.columns:
            all_companies.update(df["company_id"].dropna().unique())

    if not all_companies:
        logger.warning("transform_monthly_kpis: no company_ids found — returning empty")
        return pd.DataFrame()

    # ── Build a full month × company grid ────────────────────────────────────
    grid_months   = _month_grid(lookback_months)
    grid_companies = pd.DataFrame({"company_id": sorted(all_companies)})
    grid = grid_months.merge(grid_companies, how="cross")

    # ── Revenue + expense by (company_id, year_month) ────────────────────────
    tx_monthly = pd.DataFrame({"company_id": pd.Series(dtype=str),
                                "year_month": pd.Series(dtype=str),
                                "revenue": pd.Series(dtype=float),
                                "expense": pd.Series(dtype=float),
                                "transaction_count": pd.Series(dtype=int)})

    if not transactions_df.empty and "amount" in transactions_df.columns:
        tx = transactions_df.copy()
        tx["amount"]  = pd.to_numeric(tx.get("amount", 0), errors="coerce").fillna(0)
        tx["status"]  = tx.get("status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()
        tx = tx[tx["status"] == "posted"]

        # Parse effective date
        tx["_date"] = pd.to_datetime(
            tx.get("transaction_date", tx.get("created_date")), errors="coerce", utc=True
        )
        # Clip to lookback window
        cutoff = now - pd.DateOffset(months=lookback_months)
        tx = tx[tx["_date"].notna() & (tx["_date"] >= cutoff)]

        if not tx.empty and "company_id" in tx.columns:
            tx["year_month"] = tx["_date"].dt.strftime("%Y-%m")
            tx_type = tx.get("transaction_type", pd.Series("", index=tx.index)).fillna("").str.lower()
            tx["_rev"] = tx["amount"].where(tx_type.isin(REVENUE_TYPES), 0.0)
            tx["_exp"] = tx["amount"].where(tx_type.isin(EXPENSE_TYPES), 0.0)

            tx_monthly = (
                tx.groupby(["company_id", "year_month"], dropna=False)
                .agg(
                    revenue=("_rev", "sum"),
                    expense=("_exp", "sum"),
                    transaction_count=("amount", "count"),
                )
                .reset_index()
            )

    # ── New people by (company_id, year_month) ───────────────────────────────
    ppl_monthly = pd.DataFrame({"company_id": pd.Series(dtype=str),
                                 "year_month": pd.Series(dtype=str),
                                 "new_people": pd.Series(dtype=int),
                                 "new_clients": pd.Series(dtype=int),
                                 "new_staff": pd.Series(dtype=int)})

    if not people_df.empty:
        ppl = people_df.copy()
        ppl["_date"] = pd.to_datetime(ppl.get("created_date"), errors="coerce", utc=True)
        cutoff = now - pd.DateOffset(months=lookback_months)
        ppl = ppl[ppl["_date"].notna() & (ppl["_date"] >= cutoff)]

        if not ppl.empty and "company_id" in ppl.columns:
            ppl["year_month"] = ppl["_date"].dt.strftime("%Y-%m")
            pt = ppl.get("person_type", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
            ppl["_is_client"] = pt.isin(_CLIENT_TYPES)
            ppl["_is_staff"]  = pt.isin(_STAFF_TYPES)

            ppl_monthly = (
                ppl.groupby(["company_id", "year_month"], dropna=False)
                .agg(
                    new_people=("id", "count"),
                    new_clients=("_is_client", "sum"),
                    new_staff=("_is_staff", "sum"),
                )
                .reset_index()
            )

    # ── Task metrics by (company_id, year_month) ─────────────────────────────
    task_monthly = pd.DataFrame({"company_id": pd.Series(dtype=str),
                                  "year_month": pd.Series(dtype=str),
                                  "tasks_created": pd.Series(dtype=int),
                                  "tasks_completed": pd.Series(dtype=int)})

    if not tasks_df.empty:
        tsk = tasks_df.copy()
        tsk["_created"] = pd.to_datetime(tsk.get("created_date"), errors="coerce", utc=True)
        cutoff = now - pd.DateOffset(months=lookback_months)
        tsk = tsk[tsk["_created"].notna() & (tsk["_created"] >= cutoff)]

        if not tsk.empty and "company_id" in tsk.columns:
            tsk["year_month"]   = tsk["_created"].dt.strftime("%Y-%m")
            tsk["_completed"]   = tsk.get("status", pd.Series("", index=tsk.index)).str.lower() == "completed"

            task_monthly = (
                tsk.groupby(["company_id", "year_month"], dropna=False)
                .agg(
                    tasks_created=("id", "count"),
                    tasks_completed=("_completed", "sum"),
                )
                .reset_index()
            )

    # ── Join everything onto the grid ─────────────────────────────────────────
    result = grid.copy()
    for df, merge_cols in [
        (tx_monthly,   ["revenue", "expense", "transaction_count"]),
        (ppl_monthly,  ["new_people", "new_clients", "new_staff"]),
        (task_monthly, ["tasks_created", "tasks_completed"]),
    ]:
        if not df.empty:
            result = result.merge(df, on=["company_id", "year_month"], how="left")
        else:
            for col in merge_cols:
                result[col] = 0

    # ── Fill nulls + compute derived columns ──────────────────────────────────
    for col in ["revenue", "expense", "transaction_count",
                "new_people", "new_clients", "new_staff",
                "tasks_created", "tasks_completed"]:
        result[col] = result.get(col, pd.Series(0, index=result.index)).fillna(0)

    result["revenue"]           = result["revenue"].round(2)
    result["expense"]           = result["expense"].round(2)
    result["net"]               = (result["revenue"] - result["expense"]).round(2)
    result["transaction_count"] = result["transaction_count"].astype(int)
    result["new_people"]        = result["new_people"].astype(int)
    result["new_clients"]       = result["new_clients"].astype(int)
    result["new_staff"]         = result["new_staff"].astype(int)
    result["tasks_created"]     = result["tasks_created"].astype(int)
    result["tasks_completed"]   = result["tasks_completed"].astype(int)

    result["task_completion_rate_pct"] = (
        (result["tasks_completed"] / result["tasks_created"].replace(0, pd.NA)) * 100
    ).round(1).fillna(0.0)

    result["snapshot_date"] = pd.Timestamp.now(tz="UTC").date()

    # Drop months that are entirely zero for all metrics (no data yet for that month)
    metric_cols = ["revenue", "expense", "new_people", "tasks_created"]
    all_zero = result[metric_cols].eq(0).all(axis=1)
    # Always keep the last 6 months even if empty (for chart continuity)
    recent_months = sorted(result["year_month"].unique())[-6:]
    keep_recent = result["year_month"].isin(recent_months)
    result = result[~all_zero | keep_recent].reset_index(drop=True)

    logger.info(
        "transform_monthly_kpis: %d rows across %d companies, %d months",
        len(result), result["company_id"].nunique(), result["year_month"].nunique(),
    )

    return result
