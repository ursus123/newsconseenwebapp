"""
python_layer/connectors/writeback.py  — Phase 14: Bidirectional Connectors
===========================================================================
Write-back engine. When Newsconseen creates or updates a record (via agent
or operator), this module pushes the change to connected external systems.

Supported targets:
  google_sheets      — append a row to a Google Sheet (Sheets API v4)
  quickbooks_online  — create invoice / customer in QuickBooks Online
  xero               — create invoice / contact in Xero
  outbound_webhook   — generic HTTP POST to any URL (covers any system)

In-memory stores (reset on redeploy — acceptable for v1):
  _WRITEBACK_CONFIGS  — per-company, per-connector config
  _PUSH_LOG           — last 500 push events

Conflict policy options:
  newsconseen_wins — always push Newsconseen data to external (default)
  external_wins    — log conflict without pushing, let operator resolve manually
  flag_review      — push AND flag the record in Newsconseen for review

Called by:
  action_executor.push_to_connected_systems() — after every entity mutation
  POST /connectors/writeback/test             — manual test push
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ── In-memory stores ──────────────────────────────────────────────────────────

# Key: "{company_id}:{connector_id}"
_WRITEBACK_CONFIGS: dict[str, dict] = {}

_PUSH_LOG: list[dict] = []
_PUSH_LOG_MAX = 500


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_push(event: dict) -> None:
    global _PUSH_LOG
    _PUSH_LOG.append(event)
    if len(_PUSH_LOG) > _PUSH_LOG_MAX:
        _PUSH_LOG = _PUSH_LOG[-_PUSH_LOG_MAX:]


# ── Connectors that support write-back ───────────────────────────────────────

WRITEBACK_CAPABLE = {
    "google_sheets",
    "quickbooks_online",
    "xero",
    "outbound_webhook",
    "slack",
    "sage_pastel",
}

# What entity types each connector can receive
WRITEBACK_ENTITIES: dict[str, list[str]] = {
    "google_sheets":     ["people", "enterprises", "products", "tasks", "transactions"],
    "quickbooks_online": ["people", "transactions"],
    "xero":              ["people", "transactions"],
    "outbound_webhook":  ["people", "enterprises", "products", "tasks", "transactions"],
    "slack":             ["people", "enterprises", "products", "tasks", "transactions"],
    "sage_pastel":       ["people", "transactions"],
}


# ── Push handlers ─────────────────────────────────────────────────────────────

def _push_google_sheets(config: dict, payload: dict, entity_type: str) -> dict:
    """
    Append a row to a Google Sheet.
    config must contain: api_key (service account token) or access_token,
    and spreadsheet_id (or sheet_url).
    Row columns = sorted keys of payload.
    """
    token         = config.get("access_token") or config.get("api_key", "")
    spreadsheet_id = config.get("spreadsheet_id") or config.get("sheet_id", "")
    sheet_name    = config.get("sheet_name", entity_type.capitalize())

    if not token or not spreadsheet_id:
        return {"pushed": False, "error": "google_sheets: missing access_token or spreadsheet_id"}

    values = [list(payload.keys()), list(str(v) for v in payload.values())]
    url    = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        f"/values/{sheet_name}:append"
        f"?valueInputOption=USER_ENTERED"
    )
    try:
        resp = requests.post(
            url,
            json={"values": values},
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json"},
            timeout=15,
        )
        resp.raise_for_status()
        return {"pushed": True, "rows_appended": 1,
                "spreadsheet_id": spreadsheet_id}
    except Exception as e:
        return {"pushed": False, "error": str(e)}


def _push_quickbooks(config: dict, payload: dict, entity_type: str) -> dict:
    """
    Push to QuickBooks Online.
    - entity_type=transactions → create Invoice
    - entity_type=people       → create Customer
    """
    access_token = config.get("access_token", "")
    realm_id     = config.get("realm_id") or config.get("company_id_qbo", "")
    sandbox      = config.get("sandbox", False)
    base_url     = (
        "https://sandbox-quickbooks.api.intuit.com"
        if sandbox else
        "https://quickbooks.api.intuit.com"
    )

    if not access_token or not realm_id:
        return {"pushed": False, "error": "quickbooks: missing access_token or realm_id"}

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }

    try:
        if entity_type == "transactions":
            body = {
                "Line": [{
                    "Amount":            float(payload.get("amount", 0)),
                    "DetailType":        "SalesItemLineDetail",
                    "SalesItemLineDetail": {
                        "ItemRef": {"value": "1", "name": "Services"}
                    },
                    "Description": payload.get("description", ""),
                }],
                "CustomerRef": {"value": "1"},
                "DocNumber":   payload.get("reference_number", ""),
            }
            url = f"{base_url}/v3/company/{realm_id}/invoice"
        else:
            # person → Customer
            name = payload.get("full_name") or payload.get("first_name", "Unknown")
            body = {
                "DisplayName": name,
                "PrimaryEmailAddr": {"Address": payload.get("email", "")},
            }
            url = f"{base_url}/v3/company/{realm_id}/customer"

        resp = requests.post(url, json=body, headers=headers, timeout=20)
        resp.raise_for_status()
        return {"pushed": True, "qbo_id": resp.json().get("Id")}
    except Exception as e:
        return {"pushed": False, "error": str(e)}


def _push_xero(config: dict, payload: dict, entity_type: str) -> dict:
    """
    Push to Xero.
    - entity_type=transactions → create Invoice
    - entity_type=people       → create Contact
    """
    access_token = config.get("access_token", "")
    tenant_id    = config.get("tenant_id", "")

    if not access_token or not tenant_id:
        return {"pushed": False, "error": "xero: missing access_token or tenant_id"}

    headers = {
        "Authorization":  f"Bearer {access_token}",
        "Xero-tenant-id": tenant_id,
        "Content-Type":   "application/json",
    }

    try:
        if entity_type == "transactions":
            body = {"Invoices": [{
                "Type":        "ACCREC",
                "Status":      "DRAFT",
                "LineItems": [{
                    "Description": payload.get("description", "Service"),
                    "UnitAmount":  float(payload.get("amount", 0)),
                    "AccountCode": "200",
                }],
                "InvoiceNumber": payload.get("reference_number", ""),
            }]}
            url = "https://api.xero.com/api.xro/2.0/Invoices"
        else:
            name = payload.get("full_name") or payload.get("enterprise_name", "Contact")
            body = {"Contacts": [{"Name": name,
                                   "EmailAddress": payload.get("email", "")}]}
            url = "https://api.xero.com/api.xro/2.0/Contacts"

        resp = requests.post(url, json=body, headers=headers, timeout=20)
        resp.raise_for_status()
        return {"pushed": True}
    except Exception as e:
        return {"pushed": False, "error": str(e)}


def _push_outbound_webhook(config: dict, payload: dict, entity_type: str) -> dict:
    """
    Generic HTTP POST to any URL.
    config: {url, method (default POST), headers (dict), include_entity_type (bool)}
    """
    url     = config.get("url", "")
    method  = config.get("method", "POST").upper()
    headers = config.get("headers") or {}
    if not url:
        return {"pushed": False, "error": "outbound_webhook: no url configured"}

    body = {**payload, "entity_type": entity_type, "source": "newsconseen"}

    try:
        fn   = getattr(requests, method.lower(), requests.post)
        resp = fn(url, json=body, headers=headers, timeout=15)
        return {"pushed": True, "status_code": resp.status_code,
                "ok": resp.ok}
    except Exception as e:
        return {"pushed": False, "error": str(e)}


def _push_slack(config: dict, payload: dict, entity_type: str) -> dict:
    """
    Post a message to a Slack channel via incoming webhook URL.
    config: {webhook_url, channel (optional), username (optional)}
    """
    webhook_url = config.get("webhook_url", "")
    if not webhook_url:
        return {"pushed": False, "error": "slack: no webhook_url configured"}

    name = (payload.get("full_name") or payload.get("enterprise_name")
            or payload.get("name") or payload.get("title") or "record")
    text = f"*Newsconseen update* — {entity_type}: {name}"
    if payload.get("amount"):
        text += f" · Amount: {payload['amount']}"
    if payload.get("status"):
        text += f" · Status: {payload['status']}"

    try:
        resp = requests.post(webhook_url, json={"text": text}, timeout=10)
        return {"pushed": True, "status_code": resp.status_code}
    except Exception as e:
        return {"pushed": False, "error": str(e)}


def _push_sage_pastel(config: dict, payload: dict, entity_type: str) -> dict:
    """Sage Pastel — stub that uses outbound_webhook pattern for now."""
    return _push_outbound_webhook(config, payload, entity_type)


# ── Dispatcher ────────────────────────────────────────────────────────────────

_HANDLERS = {
    "google_sheets":     _push_google_sheets,
    "quickbooks_online": _push_quickbooks,
    "xero":              _push_xero,
    "outbound_webhook":  _push_outbound_webhook,
    "slack":             _push_slack,
    "sage_pastel":       _push_sage_pastel,
}


# ── Config management ─────────────────────────────────────────────────────────

def save_config(
    company_id: str,
    connector_id: str,
    entity_types: list[str],
    conflict_policy: str,
    credentials: dict,
    enabled: bool = True,
) -> dict:
    """Save or update a write-back config."""
    key = f"{company_id}:{connector_id}"
    _WRITEBACK_CONFIGS[key] = {
        "company_id":      company_id,
        "connector_id":    connector_id,
        "entity_types":    entity_types,
        "conflict_policy": conflict_policy,  # newsconseen_wins | external_wins | flag_review
        "credentials":     credentials,
        "enabled":         enabled,
        "created_at":      _WRITEBACK_CONFIGS.get(key, {}).get("created_at", _now_iso()),
        "updated_at":      _now_iso(),
        "push_count":      _WRITEBACK_CONFIGS.get(key, {}).get("push_count", 0),
        "last_pushed_at":  _WRITEBACK_CONFIGS.get(key, {}).get("last_pushed_at"),
    }
    return _safe_config(_WRITEBACK_CONFIGS[key])


def get_configs(company_id: str) -> list[dict]:
    """Return all write-back configs for a company (credentials stripped)."""
    prefix = f"{company_id}:"
    return [
        _safe_config(v)
        for k, v in _WRITEBACK_CONFIGS.items()
        if k.startswith(prefix) and v.get("enabled", True)
    ]


def delete_config(company_id: str, connector_id: str) -> bool:
    key = f"{company_id}:{connector_id}"
    if key in _WRITEBACK_CONFIGS:
        del _WRITEBACK_CONFIGS[key]
        return True
    return False


def _safe_config(cfg: dict) -> dict:
    """Return config without credentials."""
    return {k: v for k, v in cfg.items() if k != "credentials"}


def get_push_log(company_id: str, limit: int = 50) -> list[dict]:
    return [e for e in reversed(_PUSH_LOG)
            if e.get("company_id") == company_id][:limit]


# ── Push function ─────────────────────────────────────────────────────────────

def push(
    company_id: str,
    connector_id: str,
    entity_type: str,
    payload: dict,
    dry_run: bool = False,
) -> dict:
    """
    Push a record mutation to an external system.

    Returns:
        {
          "pushed": bool,
          "connector_id": str,
          "entity_type": str,
          "conflict": bool,
          "dry_run": bool,
          "error": str | None,
          "pushed_at": ISO str,
        }
    """
    key    = f"{company_id}:{connector_id}"
    config = _WRITEBACK_CONFIGS.get(key)

    if not config or not config.get("enabled"):
        return {"pushed": False, "connector_id": connector_id,
                "error": "No active write-back config",
                "pushed_at": _now_iso(), "dry_run": dry_run}

    # Conflict policy check
    conflict_policy = config.get("conflict_policy", "newsconseen_wins")
    if conflict_policy == "external_wins":
        event = {
            "company_id": company_id, "connector_id": connector_id,
            "entity_type": entity_type, "pushed": False,
            "conflict": True, "conflict_policy": "external_wins",
            "pushed_at": _now_iso(), "dry_run": dry_run,
        }
        _log_push(event)
        return event

    if dry_run:
        return {"pushed": True, "dry_run": True, "connector_id": connector_id,
                "entity_type": entity_type, "pushed_at": _now_iso()}

    handler = _HANDLERS.get(connector_id)
    if not handler:
        return {"pushed": False, "connector_id": connector_id,
                "error": f"No write-back handler for '{connector_id}'",
                "pushed_at": _now_iso(), "dry_run": dry_run}

    try:
        creds  = config.get("credentials", {})
        result = handler(creds, payload, entity_type)
    except Exception as e:
        result = {"pushed": False, "error": str(e)}

    # Update stats
    if result.get("pushed"):
        config["push_count"]    = config.get("push_count", 0) + 1
        config["last_pushed_at"] = _now_iso()

    event = {
        "company_id":   company_id,
        "connector_id": connector_id,
        "entity_type":  entity_type,
        "pushed":       result.get("pushed", False),
        "conflict":     conflict_policy == "flag_review" and not result.get("pushed"),
        "error":        result.get("error"),
        "pushed_at":    _now_iso(),
        "dry_run":      dry_run,
    }
    _log_push(event)

    logger.info("writeback: %s/%s/%s → pushed=%s",
                company_id, connector_id, entity_type, event["pushed"])
    return event


def push_all(company_id: str, entity_type: str, payload: dict) -> list[dict]:
    """
    Push to ALL active write-back configs for this company + entity_type.
    Called fire-and-forget from action_executor.
    """
    results = []
    prefix  = f"{company_id}:"
    for key, config in _WRITEBACK_CONFIGS.items():
        if not key.startswith(prefix):
            continue
        if not config.get("enabled"):
            continue
        if entity_type not in config.get("entity_types", []):
            continue
        connector_id = config["connector_id"]
        result = push(company_id, connector_id, entity_type, payload)
        results.append(result)
    return results
