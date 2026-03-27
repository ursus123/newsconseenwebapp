# ==============================================================
# Newsconseen Phase 3C — Network Intelligence API Routes
# ==============================================================
#
# GET  /network/overview?network_id=...
# GET  /network/members?network_id=...
# GET  /network/rankings?network_id=...&metric=...
# GET  /network/alerts?network_id=...
# POST /network/join          — child redeems a join code
# POST /network/join-code     — admin generates a join code
# GET  /network/status        — auth check for a network_id
# DELETE /network/members/{company_id}?network_id=...
# ==============================================================

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from network.registry import NetworkRegistry
from network.aggregator import NetworkAggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/network", tags=["Network Intelligence"])

RAILWAY_URL = os.getenv(
    "RAILWAY_URL",
    "https://newsconseenwebapp-production.up.railway.app",
)


class JoinRequest(BaseModel):
    join_code:       str
    company_id:      str
    company_name:    str
    enterprise_type: Optional[str] = "commercial"


class JoinCodeRequest(BaseModel):
    network_id: str
    admin_key:  str     # must match NETWORK_ADMIN_KEY env var
    expires_in_days: Optional[int] = 30


class RemoveMemberRequest(BaseModel):
    network_id: str
    admin_key:  str


# ----------------------------------------------------------
# Read endpoints
# ----------------------------------------------------------

@router.get("/overview")
def network_overview(network_id: str = Query(...)):
    """
    Aggregated intelligence view across all member companies.
    Returns rolled-up metrics with per-member breakdown.
    """
    registry = NetworkRegistry(network_id)
    members  = registry.get_members()

    if not members:
        raise HTTPException(
            status_code=404,
            detail=f"No active members found for network_id={network_id}. "
                   "Add members via the NetworkMembership entity or join code.",
        )

    aggregator = NetworkAggregator(
        network_id=network_id,
        members=members,
        railway_url=RAILWAY_URL,
    )
    return aggregator.aggregate_overview()


@router.get("/members")
def network_members(network_id: str = Query(...)):
    """
    Per-member summaries with health scores and key metrics.
    Sorted best to worst by health score.
    """
    registry = NetworkRegistry(network_id)
    members  = registry.get_members()

    if not members:
        return {
            "network_id": network_id,
            "count":      0,
            "members":    [],
        }

    aggregator = NetworkAggregator(
        network_id=network_id,
        members=members,
        railway_url=RAILWAY_URL,
    )
    member_summaries = aggregator.aggregate_members()

    return {
        "network_id": network_id,
        "count":      len(member_summaries),
        "members":    member_summaries,
    }


@router.get("/rankings")
def network_rankings(
    network_id: str = Query(...),
    metric:     str = Query("health", description="revenue | completion | retention | health | expiry | low_stock"),
):
    """
    Ranked list of member companies by a specific metric.
    Returns rank, score, and signals per member.
    """
    valid_metrics = {"revenue", "completion", "retention", "health", "expiry", "low_stock"}
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric '{metric}'. Choose from: {', '.join(sorted(valid_metrics))}",
        )

    registry = NetworkRegistry(network_id)
    members  = registry.get_members()

    if not members:
        return {"network_id": network_id, "metric": metric, "rankings": []}

    aggregator = NetworkAggregator(
        network_id=network_id,
        members=members,
        railway_url=RAILWAY_URL,
    )
    ranked = aggregator.rank_members(metric)

    return {
        "network_id": network_id,
        "metric":     metric,
        "count":      len(ranked),
        "rankings":   ranked,
    }


@router.get("/alerts")
def network_alerts(network_id: str = Query(...)):
    """
    All active alerts across every member company in the network.
    Severity-sorted: critical → warning → info.
    """
    registry = NetworkRegistry(network_id)
    members  = registry.get_members()

    if not members:
        return {"network_id": network_id, "alert_count": 0, "alerts": []}

    aggregator = NetworkAggregator(
        network_id=network_id,
        members=members,
        railway_url=RAILWAY_URL,
    )

    try:
        alerts = aggregator.network_alerts()
    except ImportError:
        # alerts module not available — use network-level rollup only
        overview = aggregator.aggregate_overview()
        alerts   = overview.get("alerts", [])

    return {
        "network_id":   network_id,
        "member_count": len(members),
        "alert_count":  len(alerts),
        "critical":     [a for a in alerts if a.get("level") == "critical"],
        "warning":      [a for a in alerts if a.get("level") == "warning"],
        "info":         [a for a in alerts if a.get("level") == "info"],
    }


@router.get("/status")
def network_status(network_id: str = Query(...)):
    """
    Returns network membership count and data availability.
    Quick auth check for the network dashboard.
    """
    registry = NetworkRegistry(network_id)
    members  = registry.get_members()

    return {
        "network_id":    network_id,
        "member_count":  len(members),
        "members":       [
            {"company_id": m["company_id"], "name": m["name"], "source": m.get("source")}
            for m in members
        ],
        "data_available": len(members) > 0,
    }


# ----------------------------------------------------------
# Membership management endpoints
# ----------------------------------------------------------

@router.post("/join")
def join_network(request: JoinRequest):
    """
    Child company redeems a join code to join a network.
    The join code is issued by the network admin.

    This is Method B — self-registration via join code.
    """
    # Validate join code
    network_id = NetworkRegistry.decode_join_code(request.join_code)
    if not network_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired join code. Contact your network administrator for a new code.",
        )

    # Add to network
    registry = NetworkRegistry(network_id)

    if registry.is_member(request.company_id):
        return {
            "status":     "already_member",
            "network_id": network_id,
            "message":    f"{request.company_name} is already a member of this network.",
        }

    success = registry.add_member(
        company_id=request.company_id,
        name=request.company_name,
        enterprise_type=request.enterprise_type,
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Could not add member to network. Check BASE44_NETWORK_MEMBERSHIP_URL configuration.",
        )

    return {
        "status":     "joined",
        "network_id": network_id,
        "message":    f"{request.company_name} has joined the network. Network view will include your data within the next analytics cycle.",
    }


@router.post("/join-code")
def generate_join_code(request: JoinCodeRequest):
    """
    Network admin generates a join code to share with a new member.
    Protected by NETWORK_ADMIN_KEY environment variable.
    """
    admin_key = os.getenv("NETWORK_ADMIN_KEY", "")
    if not admin_key or request.admin_key != admin_key:
        raise HTTPException(status_code=403, detail="Invalid admin key.")

    code = NetworkRegistry.generate_join_code(request.network_id)

    # Optionally store the code in Base44 for validation
    # (If BASE44_JOIN_CODES_URL is set)
    try:
        from config.settings import settings, HEADERS
        import requests as req
        from datetime import datetime, timezone, timedelta

        join_codes_url = getattr(settings, "base44_join_codes_url", None)
        if join_codes_url:
            expires_at = (
                datetime.now(timezone.utc) +
                timedelta(days=request.expires_in_days or 30)
            ).isoformat()
            req.post(
                join_codes_url,
                json={
                    "code":               code,
                    "network_company_id": request.network_id,
                    "is_active":          True,
                    "expires_at":         expires_at,
                },
                headers=HEADERS,
                timeout=10,
            )
    except Exception as e:
        logger.warning("generate_join_code: could not persist code — %s", e)

    return {
        "join_code":       code,
        "network_id":      request.network_id,
        "expires_in_days": request.expires_in_days or 30,
        "instructions":    (
            f"Share this code with the member operator. "
            f"They enter it at Settings → Network → Join Network. "
            f"Code expires in {request.expires_in_days or 30} days."
        ),
    }


@router.delete("/members/{company_id}")
def remove_member(
    company_id: str,
    network_id: str = Query(...),
    admin_key:  str = Query(...),
):
    """
    Remove a company from the network (soft delete).
    Protected by NETWORK_ADMIN_KEY environment variable.
    """
    stored_key = os.getenv("NETWORK_ADMIN_KEY", "")
    if not stored_key or admin_key != stored_key:
        raise HTTPException(status_code=403, detail="Invalid admin key.")

    registry = NetworkRegistry(network_id)
    success  = registry.remove_member(company_id)

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Could not remove member. Check BASE44_NETWORK_MEMBERSHIP_URL configuration.",
        )

    return {
        "status":     "removed",
        "company_id": company_id,
        "network_id": network_id,
    }
