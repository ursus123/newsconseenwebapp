# ==============================================================
# Google Sheets Connector — Sprint 1
# ==============================================================
# Syncs data from a Google Sheet via the Google Sheets API v4.
#
# credentials must contain:
#   sheet_id:      str  — Google Sheet ID from the URL
#   range:         str  — Sheet range e.g. "Sheet1!A1:Z1000"
#                         (default: first sheet, all data)
#   access_token:  str  — OAuth2 access token
#                         (scope: https://www.googleapis.com/auth/spreadsheets.readonly)
#   entity_type:   str  — "people", "enterprises", or "products"
#   column_map:    dict — operator-confirmed column mappings
#                         e.g. {"A": "first_name", "B": "last_name", ...}
#                         OR header-name based: {"First Name": "first_name"}
#   header_row:    bool — True if first row is a header (default: True)
#
# Maps to Newsconseen entities based on entity_type:
#   "people"      → Person records
#   "enterprises" → Enterprise records
#   "products"    → Product records
# ==============================================================

import logging
from typing import Any

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

# Default column mapping inference from common header names
PEOPLE_HEADER_HINTS = {
    "first name": "first_name", "firstname": "first_name",
    "last name": "last_name", "lastname": "last_name", "surname": "last_name",
    "full name": "full_name", "name": "full_name",
    "email": "email", "email address": "email",
    "phone": "phone", "mobile": "phone", "telephone": "phone",
    "type": "person_type", "role": "person_subtype",
    "status": "status", "department": "person_subtype",
}

ENTERPRISE_HEADER_HINTS = {
    "name": "name", "company": "name", "organisation": "name", "organization": "name",
    "type": "enterprise_type", "tier": "enterprise_tier",
    "status": "status", "email": "email", "phone": "phone",
    "website": "website",
}

PRODUCT_HEADER_HINTS = {
    "name": "name", "item": "name", "product": "name",
    "type": "item_type", "class": "item_class",
    "price": "price", "unit": "unit_of_measure",
    "description": "description", "sku": "sku",
    "status": "status",
}

HINT_MAPS = {
    "people":      PEOPLE_HEADER_HINTS,
    "enterprises": ENTERPRISE_HEADER_HINTS,
    "products":    PRODUCT_HEADER_HINTS,
}


class GoogleSheetsConnector(BaseConnector):
    """Google Sheets API v4 connector. Sprint 1."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Accept": "application/json",
        }

    def extract(self) -> list[dict]:
        sheet_id  = self.credentials["sheet_id"]
        range_    = self.credentials.get("range", "")
        logger.info(
            "GoogleSheetsConnector: reading sheet_id=%s range=%s", sheet_id, range_ or "all"
        )

        # If no range specified, fetch sheet metadata to get first sheet name
        if not range_:
            try:
                meta = requests.get(
                    f"{SHEETS_BASE}/{sheet_id}",
                    headers=self._headers(),
                    timeout=15,
                ).json()
                first_sheet = meta.get("sheets", [{}])[0].get("properties", {}).get("title", "Sheet1")
                range_      = f"{first_sheet}"
            except Exception:
                range_ = "Sheet1"

        try:
            resp = requests.get(
                f"{SHEETS_BASE}/{sheet_id}/values/{range_}",
                headers=self._headers(),
                params={"valueRenderOption": "UNFORMATTED_VALUE"},
                timeout=30,
            )
            resp.raise_for_status()
            data   = resp.json()
            values = data.get("values", [])
            if not values:
                logger.info("GoogleSheetsConnector: sheet is empty")
                return []
            logger.info("GoogleSheetsConnector: extracted %d rows", len(values))
            return values
        except Exception as e:
            logger.error("GoogleSheetsConnector.extract failed — %s", e)
            return []

    def _infer_column_map(self, headers: list[str]) -> dict[str, str]:
        entity_type = self.credentials.get("entity_type", "people")
        hints       = HINT_MAPS.get(entity_type, PEOPLE_HEADER_HINTS)
        col_map     = {}
        for i, h in enumerate(headers):
            norm = str(h).lower().strip()
            if norm in hints:
                col_map[i] = hints[norm]
        return col_map

    def transform(self, raw_records: list[Any]) -> dict[str, list]:
        entity_type  = self.credentials.get("entity_type", "people")
        has_header   = self.credentials.get("header_row", True)
        saved_map    = self.credentials.get("column_map", {})

        if not raw_records:
            return {"people": [], "enterprises": [], "products": [], "transactions": []}

        rows   = raw_records
        idx_map: dict[int, str] = {}

        if has_header:
            header_row = rows[0]
            rows       = rows[1:]

            # Build index→field map from saved_map (header-name keys) or auto-inference
            if saved_map:
                for key, field in saved_map.items():
                    # key may be column letter (A, B, C) or header name
                    if len(key) == 1 and key.upper().isalpha():
                        idx = ord(key.upper()) - ord("A")
                    else:
                        try:
                            idx = [str(h).strip() for h in header_row].index(key)
                        except ValueError:
                            continue
                    idx_map[idx] = field
            else:
                idx_map = self._infer_column_map([str(h) for h in header_row])
        else:
            if saved_map:
                for key, field in saved_map.items():
                    if len(key) == 1 and key.upper().isalpha():
                        idx_map[ord(key.upper()) - ord("A")] = field

        if not idx_map:
            logger.warning("GoogleSheetsConnector: no column mapping — returning empty")
            return {"people": [], "enterprises": [], "products": [], "transactions": []}

        records = []
        for row_idx, row in enumerate(rows):
            mapped: dict[str, Any] = {}
            for col_idx, field in idx_map.items():
                val = row[col_idx] if col_idx < len(row) else None
                if val is not None and str(val).strip():
                    mapped[field] = val

            if not mapped:
                continue

            try:
                if entity_type == "people":
                    # handle "full_name" → split to first/last
                    if "full_name" in mapped and "first_name" not in mapped:
                        parts = str(mapped.pop("full_name")).split(" ", 1)
                        mapped["first_name"] = parts[0]
                        mapped["last_name"]  = parts[1] if len(parts) > 1 else ""
                    mapped.setdefault("person_type",    "client")
                    mapped.setdefault("engagement_model", "subscribed")
                    mapped.setdefault("status",         "active")
                    mapped["external_id"] = f"gsheets_people_{self.credentials['sheet_id']}_{row_idx}"
                    records.append(self.scope(mapped))

                elif entity_type == "enterprises":
                    mapped.setdefault("enterprise_type", "commercial")
                    mapped.setdefault("enterprise_tier", "branch")
                    mapped.setdefault("operating_status", "open")
                    mapped.setdefault("status", "active")
                    mapped["external_id"] = f"gsheets_ent_{self.credentials['sheet_id']}_{row_idx}"
                    records.append(self.scope(mapped))

                elif entity_type == "products":
                    mapped.setdefault("item_type",       "physical")
                    mapped.setdefault("item_class",      "unrestricted")
                    mapped.setdefault("unit_of_measure", "piece")
                    mapped.setdefault("status",          "active")
                    mapped["external_id"] = f"gsheets_prod_{self.credentials['sheet_id']}_{row_idx}"
                    records.append(self.scope(mapped))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(row_idx))
            except Exception as e:
                logger.warning("GoogleSheetsConnector.transform: row %d skipped — %s", row_idx, e)

        logger.info(
            "GoogleSheetsConnector.transform: %d %s records", len(records), entity_type
        )
        result: dict[str, list] = {"people": [], "enterprises": [], "products": [], "transactions": []}
        result[entity_type] = records
        return result
