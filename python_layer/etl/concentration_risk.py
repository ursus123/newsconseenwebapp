"""
etl/concentration_risk.py
-------------------------
analytics.concentration_risk — one row per company_id.

Computes the Herfindahl-Hirschman Index (HHI) for revenue, client, and staff
concentration per company.

HHI is the sum of squared market shares of each participant.
    HHI = 0          perfectly distributed
    HHI = 10000      monopoly (one entity has 100% share)
    HHI < 1500       unconcentrated
    HHI 1500–2500    moderate concentration
    HHI > 2500       high concentration (dangerous for SMEs)

Columns produced:
    company_id

    -- Revenue concentration --
    revenue_hhi              HHI across client revenue shares
    revenue_concentration    low / moderate / high / critical
    top_client_name          name of highest-revenue client
    top_client_revenue_pct   % of total revenue from top client
    top_3_clients_revenue_pct % from top 3 clients combined
    top_client_count         number of clients generating top 80% of revenue

    -- Client count concentration (which enterprise has the most clients) --
    client_hhi               HHI of client distribution across enterprises
    client_concentration     low / moderate / high / critical
    top_enterprise_client_count  count of clients at top enterprise

    -- Staff concentration --
    staff_hhi                HHI of staff distribution across enterprises
    staff_concentration      low / moderate / high / critical

    -- Single-person dependency --
    single_staff_enterprises  count of enterprises with only 1 staff member
    no_staff_enterprises      count of enterprises with 0 staff

    -- Overall risk signal --
    concentration_risk_level  low / medium / high / critical
    concentration_flags       comma-separated list of active risk flags
"""

import logging

import pandas as pd

logger = logging.getLogger(__name__)

REVENUE_TYPES = {
    "service_fee", "tuition", "membership_fee", "donation",
    "tithe", "event_income", "grant", "sponsorship",
    "livestock_sale", "crop_sale", "product_sale",
    "rental_income", "interest_income", "refund_received",
}
_STAFF_TYPES  = {"staff","employee","contractor","freelancer","driver","teacher","nurse","agent"}
_CLIENT_TYPES = {"client","patient","student","member","beneficiary","enrollee","participant",
                 "subscriber","attendee","learner","trainee","resident","customer","applicant"}


def transform_concentration_risk(
    people_df: pd.DataFrame,
    transactions_df: pd.DataFrame,
    enterprises_df: pd.DataFrame,
) -> pd.DataFrame:
    """Build analytics.concentration_risk — one row per company."""

    all_companies: set = set()
    for df in [people_df, transactions_df, enterprises_df]:
        if not df.empty and "company_id" in df.columns:
            all_companies.update(df["company_id"].dropna().unique())

    if not all_companies:
        logger.warning("transform_concentration_risk: no company_ids found")
        return pd.DataFrame()

    rows = []
    for cid in sorted(all_companies):
        row: dict = {"company_id": cid}

        # ── Revenue concentration ─────────────────────────────────────────────
        tx = _cid(transactions_df, cid)
        if not tx.empty:
            tx = tx.copy()
            tx["amount"] = pd.to_numeric(tx.get("amount", 0), errors="coerce").fillna(0)
            tx_st = tx.get("status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()
            tx_tt = tx.get("transaction_type", pd.Series("", index=tx.index)).fillna("").str.lower()
            posted_rev = tx[(tx_st == "posted") & tx_tt.isin(REVENUE_TYPES)].copy()

            if not posted_rev.empty:
                name_col = next((c for c in ["person_name", "client_name", "enterprise"] if c in posted_rev.columns), None)
                if name_col:
                    client_rev = (
                        posted_rev.groupby(name_col, dropna=True)["amount"]
                        .sum()
                        .sort_values(ascending=False)
                    )
                    total_rev = client_rev.sum()
                    if total_rev > 0:
                        shares = client_rev / total_rev * 100
                        hhi = float((shares ** 2).sum())
                        cumulative = shares.cumsum()

                        row["revenue_hhi"]               = round(hhi, 1)
                        row["revenue_concentration"]     = _hhi_label(hhi)
                        row["top_client_name"]           = str(client_rev.index[0])
                        row["top_client_revenue_pct"]    = round(float(shares.iloc[0]), 1)
                        row["top_3_clients_revenue_pct"] = round(float(shares.iloc[:3].sum()), 1)
                        # How many clients make up 80% of revenue
                        row["top_client_count"]  = int((cumulative <= 80).sum()) + 1
                    else:
                        row.update(_empty_revenue_conc())
                else:
                    row.update(_empty_revenue_conc())
            else:
                row.update(_empty_revenue_conc())
        else:
            row.update(_empty_revenue_conc())

        # ── Client + staff concentration (per enterprise) ─────────────────────
        ppl = _cid(people_df, cid)
        if not ppl.empty:
            ppl = ppl.copy()
            pt = ppl.get("person_type", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
            ent_col = next((c for c in ["enterprise", "enterprise_name"] if c in ppl.columns), None)

            clients = ppl[pt.isin(_CLIENT_TYPES)]
            staff   = ppl[pt.isin(_STAFF_TYPES)]

            if ent_col and not clients.empty:
                c_dist = clients[ent_col].value_counts()
                total_c = c_dist.sum()
                if total_c > 0:
                    shares_c = c_dist / total_c * 100
                    row["client_hhi"]                    = round(float((shares_c ** 2).sum()), 1)
                    row["client_concentration"]          = _hhi_label(row["client_hhi"])
                    row["top_enterprise_client_count"]   = int(c_dist.iloc[0]) if not c_dist.empty else 0
                else:
                    row.update({"client_hhi": 0.0, "client_concentration": "low", "top_enterprise_client_count": 0})
            else:
                row.update({"client_hhi": 0.0, "client_concentration": "low", "top_enterprise_client_count": 0})

            if ent_col and not staff.empty:
                s_dist = staff[ent_col].value_counts()
                total_s = s_dist.sum()
                if total_s > 0:
                    shares_s = s_dist / total_s * 100
                    row["staff_hhi"]           = round(float((shares_s ** 2).sum()), 1)
                    row["staff_concentration"] = _hhi_label(row["staff_hhi"])
                else:
                    row.update({"staff_hhi": 0.0, "staff_concentration": "low"})

                # Single-person dependency
                if ent_col:
                    row["single_staff_enterprises"] = int((s_dist == 1).sum())
            else:
                row.update({"staff_hhi": 0.0, "staff_concentration": "low",
                            "single_staff_enterprises": 0})
        else:
            row.update({
                "client_hhi": 0.0, "client_concentration": "low",
                "top_enterprise_client_count": 0,
                "staff_hhi": 0.0, "staff_concentration": "low",
                "single_staff_enterprises": 0,
            })

        # Enterprises with 0 staff
        ent = _cid(enterprises_df, cid)
        if not ent.empty and not ppl.empty:
            ent_col2 = next((c for c in ["enterprise_name", "enterprise"] if c in ppl.columns), None)
            if ent_col2:
                staffed = set(staff[ent_col2].dropna().unique()) if not staff.empty else set()
                row["no_staff_enterprises"] = int(sum(
                    1 for _, e in ent.iterrows()
                    if str(e.get("enterprise_name","") or "").strip() not in staffed
                ))
            else:
                row["no_staff_enterprises"] = 0
        else:
            row["no_staff_enterprises"] = 0

        # ── Overall risk level + flags ────────────────────────────────────────
        flags = []
        rev_conc  = row.get("revenue_concentration", "low")
        cli_conc  = row.get("client_concentration", "low")
        sta_conc  = row.get("staff_concentration", "low")
        top_pct   = row.get("top_client_revenue_pct", 0) or 0
        single_st = row.get("single_staff_enterprises", 0) or 0

        if top_pct > 50:
            flags.append("single_client_dominance")
        if rev_conc in ("high", "critical"):
            flags.append("revenue_concentration")
        if cli_conc in ("high", "critical"):
            flags.append("client_concentration")
        if sta_conc in ("high", "critical"):
            flags.append("staff_concentration")
        if single_st > 0:
            flags.append(f"{single_st}_single_staff_branches")

        severity = max(
            _conc_score(rev_conc),
            _conc_score(cli_conc),
            _conc_score(sta_conc),
        )
        row["concentration_risk_level"] = ["low","medium","high","critical"][severity]
        row["concentration_flags"]      = ",".join(flags) if flags else ""

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df_out = pd.DataFrame(rows)
    logger.info(
        "transform_concentration_risk: produced %d rows", len(df_out)
    )
    return df_out


def _cid(df: pd.DataFrame, company_id: str) -> pd.DataFrame:
    if df.empty or "company_id" not in df.columns:
        return df
    return df[df["company_id"] == company_id].copy()


def _hhi_label(hhi: float) -> str:
    if hhi < 1500:  return "low"
    if hhi < 2500:  return "moderate"
    if hhi < 5000:  return "high"
    return "critical"


def _conc_score(label: str) -> int:
    return {"low": 0, "moderate": 1, "high": 2, "critical": 3}.get(label, 0)


def _empty_revenue_conc() -> dict:
    return {
        "revenue_hhi": 0.0, "revenue_concentration": "low",
        "top_client_name": None, "top_client_revenue_pct": 0.0,
        "top_3_clients_revenue_pct": 0.0, "top_client_count": 0,
    }
