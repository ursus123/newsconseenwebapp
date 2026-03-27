# ==============================================================
# Newsconseen Connector Base Class
# ==============================================================
# Every connector — Excel, M-Pesa, ADP, Epic, PowerSchool, etc.
# — inherits from BaseConnector and implements three methods:
#
#   extract()   → pull raw records from the source system
#   transform() → map to master entity format using taxonomy
#   load()      → create/update records in Base44 via API
#
# The load() method is implemented here and shared by all
# connectors. Only extract() and transform() differ per source.
#
# This is the technical enforcement of the architecture principle:
# every connector is a different Extract, but Transform and Load
# are identical because they all map to the same three entities
# through the same taxonomy.
# ==============================================================

import logging
import requests
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

from config.settings import settings, HEADERS
from config.taxonomy import (
    normalize_person_type,
    normalize_enterprise_type,
    normalize_item_type,
)

logger = logging.getLogger(__name__)


class UnmappedValueError(Exception):
    """
    Raised when a source value cannot be mapped to a taxonomy value
    and no saved mapping exists for it.

    The connector catches this, adds the unmapped value to the
    ConnectorRun.unmapped_values list, and skips the record.
    The operator reviews and maps the value in the Connectors UI,
    then re-runs the connector to process the skipped records.
    """
    def __init__(self, field_name: str, source_value: str):
        self.field_name   = field_name
        self.source_value = source_value
        super().__init__(
            f"Unmapped value for field '{field_name}': '{source_value}'"
        )


class BaseConnector(ABC):
    """
    Abstract base class for all Newsconseen data source connectors.

    Subclasses implement extract() and transform().
    load() is provided here and is identical for all connectors.

    Args:
        company_id:   Tenant identifier — all created records are scoped to this
        credentials:  Dict of API keys, tokens, file paths etc. per connector
        mappings:     Saved taxonomy mappings {field:value → taxonomy_value}
                      loaded from ConnectorMapping entity in Base44
    """

    def __init__(
        self,
        company_id:  str,
        credentials: dict,
        mappings:    dict,
    ):
        self.company_id  = company_id
        self.credentials = credentials
        self.mappings    = mappings  # {"person_type:Mwalimu": "staff", ...}
        self.run_stats   = {
            "extracted":    0,
            "created":      0,
            "updated":      0,
            "skipped":      0,
            "failed":       0,
            "unmapped":     [],
        }

    # ----------------------------------------------------------
    # Abstract methods — implement in each connector subclass
    # ----------------------------------------------------------

    @abstractmethod
    def extract(self) -> list[dict[str, Any]]:
        """
        Pull raw records from the source system.

        Returns a flat list of raw dicts — one per record.
        No transformation applied here. No taxonomy mapping.
        Just the raw data as the source provides it.
        """
        pass

    @abstractmethod
    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        """
        Map raw records to master entity format using the taxonomy.

        Returns a dict with keys matching Base44 entity names:
            {
                "people":        [...],
                "enterprises":   [...],
                "products":      [...],
                "transactions":  [...],
                "relationships": [...],
            }

        Each list contains records ready to upsert into Base44.
        Any list can be empty — only the populated ones are loaded.

        Use self.map_value() for every field that needs taxonomy mapping.
        Catch UnmappedValueError and append to self.run_stats["unmapped"].
        """
        pass

    # ----------------------------------------------------------
    # Load — identical for all connectors
    # ----------------------------------------------------------

    def load(self, transformed: dict[str, list]) -> dict[str, int]:
        """
        Upsert transformed records into Base44 via REST API.

        Uses external_id (source system record ID) to detect
        existing records and update them rather than duplicating.

        Returns counts per entity type.
        """
        entity_url_map = {
            "people":        settings.base44_people_url,
            "enterprises":   settings.base44_enterprises_url,
            "products":      settings.base44_products_url,
            "transactions":  getattr(settings, "base44_transactions_url", None),
            "relationships": settings.base44_relationships_url,
        }

        totals = {"created": 0, "updated": 0, "failed": 0}

        for entity_name, records in transformed.items():
            if not records:
                continue

            url = entity_url_map.get(entity_name)
            if not url:
                logger.warning(
                    "connector.load: no URL configured for entity '%s' — skipping",
                    entity_name,
                )
                continue

            for record in records:
                try:
                    result = self._upsert_record(url, record, entity_name)
                    if result == "created":
                        totals["created"] += 1
                    elif result == "updated":
                        totals["updated"] += 1
                except Exception as e:
                    totals["failed"] += 1
                    logger.error(
                        "connector.load: failed to upsert %s record — %s",
                        entity_name, e,
                    )

        self.run_stats["created"] += totals["created"]
        self.run_stats["updated"] += totals["updated"]
        self.run_stats["failed"]  += totals["failed"]

        return totals

    def run(self) -> dict:
        """
        Execute the full extract → transform → load cycle.

        Returns a run summary dict suitable for saving to
        ConnectorRun entity in Base44.
        """
        started_at = datetime.now(timezone.utc)
        logger.info(
            "connector.run: starting %s for company_id=%s",
            self.__class__.__name__, self.company_id,
        )

        try:
            raw = self.extract()
            self.run_stats["extracted"] = len(raw)
            logger.info(
                "connector.run: extracted %d records from source", len(raw)
            )

            transformed = self.transform(raw)
            total_transformed = sum(len(v) for v in transformed.values())
            logger.info(
                "connector.run: transformed to %d records across %d entities",
                total_transformed, len([k for k, v in transformed.items() if v]),
            )

            load_results = self.load(transformed)
            logger.info(
                "connector.run: loaded — created=%d updated=%d failed=%d",
                load_results["created"],
                load_results["updated"],
                load_results["failed"],
            )

            status = "completed" if not self.run_stats["unmapped"] else "needs_review"

        except Exception as e:
            logger.error("connector.run: failed — %s", e)
            status = "failed"
            self.run_stats["error"] = str(e)

        completed_at = datetime.now(timezone.utc)

        return {
            "connector_id":       self.__class__.__name__.lower().replace("connector", ""),
            "company_id":         self.company_id,
            "status":             status,
            "records_extracted":  self.run_stats["extracted"],
            "records_created":    self.run_stats["created"],
            "records_updated":    self.run_stats["updated"],
            "records_skipped":    self.run_stats["skipped"],
            "records_failed":     self.run_stats["failed"],
            "unmapped_values":    self.run_stats.get("unmapped", []),
            "started_at":         started_at.isoformat(),
            "completed_at":       completed_at.isoformat(),
            "error_message":      self.run_stats.get("error"),
        }

    # ----------------------------------------------------------
    # Taxonomy mapping helpers
    # ----------------------------------------------------------

    def map_value(self, source_value: str, field_name: str) -> str:
        """
        Translate a source value to a taxonomy value.

        Lookup order:
          1. Saved operator mapping in self.mappings
          2. Built-in taxonomy normalization functions
          3. Raises UnmappedValueError — record is skipped

        Args:
            source_value: Raw value from source system
            field_name:   Which taxonomy field this maps to
                          ("person_type", "enterprise_type", "item_type",
                           "person_subtype", "enterprise_subtype", "item_subtype")
        """
        if not source_value:
            return source_value

        # Check saved operator mappings first
        mapping_key = f"{field_name}:{source_value}"
        if mapping_key in self.mappings:
            return self.mappings[mapping_key]

        # Try built-in normalization for top-level types
        if field_name == "person_type":
            normalized = normalize_person_type(source_value)
            if normalized != "staff" or source_value.lower() in {"staff", "employee"}:
                return normalized

        if field_name == "enterprise_type":
            normalized = normalize_enterprise_type(source_value)
            if normalized != "commercial" or source_value.lower() in {"commercial", "business"}:
                return normalized

        if field_name == "item_type":
            normalized = normalize_item_type(source_value)
            if normalized != "physical" or source_value.lower() in {"physical", "product"}:
                return normalized

        # Cannot map — flag for operator review
        raise UnmappedValueError(field_name, source_value)

    def record_unmapped(self, field_name: str, source_value: str, record_id: str = None):
        """
        Record an unmapped value for operator review.
        Called when UnmappedValueError is caught.
        """
        entry = {
            "field_name":   field_name,
            "source_value": source_value,
            "record_id":    record_id,
        }
        if entry not in self.run_stats["unmapped"]:
            self.run_stats["unmapped"].append(entry)
            logger.info(
                "connector: unmapped value recorded — field=%s value=%s",
                field_name, source_value,
            )

    def scope(self, record: dict) -> dict:
        """
        Add company_id and connector_source to any record.
        Always call this before adding a record to transformed output.
        """
        record["company_id"]        = self.company_id
        record["connector_source"]  = self.__class__.__name__.lower()
        return record

    # ----------------------------------------------------------
    # Internal helpers
    # ----------------------------------------------------------

    def _upsert_record(self, url: str, record: dict, entity_name: str) -> str:
        """
        Create or update a record in Base44.

        Uses external_id field to detect duplicates:
          - If a record with the same external_id exists → update it
          - If not → create it

        Returns "created" or "updated".
        """
        external_id = record.get("external_id")

        # Try to find existing record by external_id
        if external_id:
            existing = self._find_by_external_id(url, external_id)
            if existing:
                record_id = existing.get("id")
                resp = requests.put(
                    f"{url}/{record_id}",
                    json=record,
                    headers=HEADERS,
                    timeout=30,
                )
                resp.raise_for_status()
                logger.debug(
                    "connector: updated %s external_id=%s", entity_name, external_id
                )
                return "updated"

        # Create new record
        resp = requests.post(
            url,
            json=record,
            headers=HEADERS,
            timeout=30,
        )
        resp.raise_for_status()
        logger.debug(
            "connector: created %s external_id=%s", entity_name, external_id
        )
        return "created"

    def _find_by_external_id(self, url: str, external_id: str) -> dict | None:
        """
        Search Base44 for a record with matching external_id.
        Returns the first match or None.
        """
        try:
            resp = requests.get(
                url,
                params={"external_id": external_id, "limit": 1},
                headers=HEADERS,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data:
                return data[0]
            if isinstance(data, dict):
                results = data.get("data") or data.get("results") or []
                return results[0] if results else None
        except Exception as e:
            logger.debug(
                "connector: external_id lookup failed for %s — %s", external_id, e
            )
        return None
