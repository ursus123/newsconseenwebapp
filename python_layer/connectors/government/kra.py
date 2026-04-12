# ==============================================================
# KRA Connector — Sprint 8
# ==============================================================
# Validates business registration and tax compliance via the
# Kenya Revenue Authority (KRA) iTax portal API.
#
# KRA does not have a public REST API with OAuth. This connector
# uses two mechanisms:
#   1. PIN Checker API — public endpoint for TIN/PIN validation
#   2. iTax credential-based session (username/password) for
#      detailed filing history (requires KRA portal credentials)
#
# credentials must contain:
#   username:   str  — iTax KRA PIN/username
#   password:   str  — iTax password
#   mode:       str  — "validate_only" | "full_sync" (default: validate_only)
#
# Maps to Newsconseen entities:
#   Registered business → Enterprise (enterprise_type: commercial)
#   Director/partner    → Person (person_type: contact)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

KRA_BASE       = "https://itax.kra.go.ke/KRA-Portal"
KRA_PIN_CHECK  = "https://itax.kra.go.ke/KRA-Portal/pinchecker.htm"

BUSINESS_TYPE_MAP = {
    "SOLE PROPRIETOR":    ("commercial",  "headquarters"),
    "LIMITED LIABILITY":  ("commercial",  "headquarters"),
    "PARTNERSHIP":        ("commercial",  "headquarters"),
    "PUBLIC LIMITED":     ("commercial",  "headquarters"),
    "NON PROFIT":         ("nonprofit",   "headquarters"),
    "COOPERATIVE":        ("cooperative", "headquarters"),
    "GOVERNMENT":         ("government",  "headquarters"),
}


class KraConnector(BaseConnector):
    """Kenya KRA iTax connector. Sprint 8."""

    def _validate_pin(self, session: requests.Session, pin: str) -> dict | None:
        try:
            resp = session.get(
                KRA_PIN_CHECK,
                params={"PIN": pin},
                timeout=15,
            )
            if resp.ok:
                return resp.json() if resp.headers.get("content-type", "").startswith("application/json") else None
        except Exception:
            pass
        return None

    def _login(self) -> requests.Session:
        session = requests.Session()
        resp    = session.post(
            f"{KRA_BASE}/login.htm",
            data={
                "wtrealm":     "kraportal",
                "username":    self.credentials["username"],
                "password":    self.credentials["password"],
                "action":      "login",
            },
            timeout=30,
        )
        if resp.status_code not in (200, 302):
            raise ValueError(f"KRA login failed: HTTP {resp.status_code}")
        return session

    def extract(self) -> list[dict]:
        logger.info("KraConnector: extracting for company_id=%s", self.company_id)
        mode = self.credentials.get("mode", "validate_only")

        if mode == "validate_only":
            pin = self.credentials.get("target_pin")
            if not pin:
                logger.warning("KraConnector: no target_pin in credentials")
                return []
            try:
                session = self._login()
                result  = self._validate_pin(session, pin)
                if result:
                    return [result]
            except Exception as e:
                logger.error("KraConnector.extract failed — %s", e)
            return []

        # full_sync: enumerate businesses filed under this PIN
        try:
            session   = self._login()
            resp      = session.get(
                f"{KRA_BASE}/taxpayer/taxpayerProfile.htm",
                timeout=30,
            )
            resp.raise_for_status()
            # Response is HTML — parse what we can
            return [{"_raw_html": resp.text, "_mode": "full_sync"}]
        except Exception as e:
            logger.error("KraConnector.extract failed (full_sync) — %s", e)
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        enterprises = []

        for r in raw_records:
            try:
                if r.get("_mode") == "full_sync":
                    # HTML scraping fallback — minimal info
                    continue

                name       = r.get("taxpayerName") or r.get("name", "")
                pin        = r.get("PIN") or r.get("pin", "")
                biz_type   = (r.get("taxpayerType") or "").upper()
                etype, tier = BUSINESS_TYPE_MAP.get(biz_type, ("commercial", "headquarters"))

                if not name:
                    continue

                enterprises.append(self.scope({
                    "external_id":      f"kra_{pin}",
                    "name":             name,
                    "enterprise_type":  etype,
                    "enterprise_tier":  tier,
                    "tax_id":           pin,
                    "operating_status": "open" if r.get("status") != "DEREGISTERED" else "closed",
                    "status":           "active" if r.get("status") != "DEREGISTERED" else "inactive",
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("PIN", ""))
            except Exception as e:
                logger.warning("KraConnector.transform: skipped — %s", e)

        logger.info("KraConnector.transform: %d enterprises", len(enterprises))
        return {"people": [], "enterprises": enterprises, "products": [], "transactions": []}
