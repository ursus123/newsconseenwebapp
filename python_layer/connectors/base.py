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
from connectors.retry import request_with_retry

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

        totals = {"created": 0, "updated": 0, "failed": 0, "skipped_conflict": 0}

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
                    elif result == "skipped_conflict":
                        totals["skipped_conflict"] += 1
                except Exception as e:
                    totals["failed"] += 1
                    logger.error(
                        "connector.load: failed to upsert %s record — %s",
                        entity_name, e,
                    )
                    self._record_failed_row(entity_name, record, str(e))

        self.run_stats["created"] += totals["created"]
        self.run_stats["updated"] += totals["updated"]
        self.run_stats["failed"]  += totals["failed"]
        self.run_stats["skipped"] += totals["skipped_conflict"]

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

            # Mirror synced records into raw.* so ML, copilot, and the
            # three-tier fallback chain can access connector data without
            # waiting for the next scheduled ETL cron run.
            self._write_raw_records(transformed)

            # Fire ETL for every entity that received records so that
            # analytics.*, copilot, alerts, and dashboards reflect the
            # new data immediately — not after the next manual ETL run.
            self._trigger_etl(transformed)

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
            "changes":            self.run_stats.get("changes", {}),
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

        Inbound conflict check: if this schedule's inbound_conflict_policy is
        not the default 'connector_wins', and the existing record's
        updated_date is newer than this connector's last sync (i.e. a human
        or another process touched it since we last synced), apply the
        configured policy instead of blindly overwriting. Only runs when
        self.credentials carries '_last_sync_at' — a one-off manual run with
        no prior schedule skips this check entirely (nothing to compare to).

        Returns "created", "updated", or "skipped_conflict".
        """
        external_id = record.get("external_id")

        # Try to find existing record by external_id
        if external_id:
            existing = self._find_by_external_id(url, external_id)
            if existing:
                record_id = existing.get("id")

                policy = self.credentials.get("_inbound_conflict_policy", "connector_wins")
                last_sync_at = self.credentials.get("_last_sync_at")
                if policy != "connector_wins" and last_sync_at and self._touched_since(existing, last_sync_at):
                    if policy == "manual_wins":
                        self._record_conflict(entity_name, external_id, policy)
                        logger.info(
                            "connector: skipped %s external_id=%s — touched since last sync, policy=manual_wins",
                            entity_name, external_id,
                        )
                        return "skipped_conflict"
                    if policy == "flag_review":
                        self._record_conflict(entity_name, external_id, policy)
                        # fall through — still writes, just flagged

                request_with_retry(
                    "PUT", f"{url}/{record_id}",
                    json=record, headers=HEADERS, timeout=30,
                )
                logger.debug(
                    "connector: updated %s external_id=%s", entity_name, external_id
                )
                return "updated"

        # Create new record
        request_with_retry(
            "POST", url,
            json=record, headers=HEADERS, timeout=30,
        )
        logger.debug(
            "connector: created %s external_id=%s", entity_name, external_id
        )
        return "created"

    @staticmethod
    def _touched_since(existing: dict, last_sync_at: str) -> bool:
        """True if existing record's updated_date is after last_sync_at."""
        try:
            updated = existing.get("updated_date") or existing.get("updated_at")
            if not updated:
                return False
            u_dt = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
            s_dt = datetime.fromisoformat(str(last_sync_at).replace("Z", "+00:00"))
            if u_dt.tzinfo is None:
                u_dt = u_dt.replace(tzinfo=timezone.utc)
            if s_dt.tzinfo is None:
                s_dt = s_dt.replace(tzinfo=timezone.utc)
            return u_dt > s_dt
        except Exception:
            return False

    def _record_conflict(self, entity_name: str, external_id: str, policy: str) -> None:
        """Log an inbound conflict for operator visibility. Best-effort."""
        try:
            from database import get_engine_safe
            from sqlalchemy import text
            engine = get_engine_safe()
            if not engine:
                return
            with engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO connectors.conflict_log
                        (company_id, connector_id, entity_type, external_id, policy_applied)
                    VALUES (:cid, :conn_id, :entity, :ext_id, :policy)
                """), {
                    "cid": self.company_id,
                    "conn_id": self.__class__.__name__.lower().replace("connector", ""),
                    "entity": entity_name, "ext_id": external_id, "policy": policy,
                })
        except Exception as exc:
            logger.debug("connector: conflict_log write skipped — %s", exc)

    def _record_failed_row(self, entity_name: str, record: dict, error_message: str) -> None:
        """
        Persist a failed upsert to the shared failed-row quarantine so it's
        reviewable/retryable instead of just a log line. Best-effort.
        """
        try:
            from database import get_engine_safe
            from ingestion.quarantine import record_failed_row
            record_failed_row(
                get_engine_safe(), self.company_id,
                source=f"connector:{self.__class__.__name__.lower().replace('connector', '')}",
                entity_type=entity_name, row_payload=record, error_message=error_message,
            )
        except Exception as exc:
            logger.debug("connector: failed-row quarantine skipped — %s", exc)

    def _diff_since_last_sync(self, entities_written: dict[str, list]) -> dict:
        """
        Compare incoming external_ids against what's currently in raw.* for
        this company, per entity. Best-effort, read-only — never raises.
        """
        diff = {}
        try:
            from database import get_engine_safe
            from sqlalchemy import text
            engine = get_engine_safe()
            if not engine:
                return diff
            with engine.connect() as conn:
                for entity, records in entities_written.items():
                    incoming_ids = {r.get("external_id") for r in records if r.get("external_id")}
                    if not incoming_ids:
                        continue
                    try:
                        rows = conn.execute(
                            text(f"SELECT DISTINCT external_id FROM raw.{entity} WHERE company_id = :cid"),
                            {"cid": self.company_id},
                        ).fetchall()
                        existing_ids = {r[0] for r in rows if r[0]}
                    except Exception:
                        existing_ids = set()  # table may not exist yet — treat as all-new

                    added   = incoming_ids - existing_ids
                    removed = existing_ids - incoming_ids
                    updated = incoming_ids & existing_ids
                    diff[entity] = {
                        "added_count":   len(added),
                        "removed_count": len(removed),
                        "updated_count": len(updated),
                    }
        except Exception as exc:
            logger.debug("connector: change diff skipped — %s", exc)
        return diff

    def _write_raw_records(self, transformed: dict[str, list]) -> None:
        """
        Mirror synced records into the raw.* PostgreSQL tables.

        Uses delete-then-append (not full replace) so records for other
        tenants are never wiped. Only this company's rows are touched.

        Called fire-and-forget after load() — database unavailability
        never fails the connector run (data is already safely in Base44).

        Entity name → raw table mapping mirrors the ETL cron convention:
            people       → raw.people
            enterprises  → raw.enterprises
            products     → raw.products
            transactions → raw.transactions
            relationships→ raw.relationships
            tasks        → raw.tasks
            addresses    → raw.addresses
            services     → raw.services
        """
        import threading
        import pandas as pd

        # Only entities with records
        entities_written = {
            entity: records
            for entity, records in transformed.items()
            if records
        }
        if not entities_written:
            return

        company_id = self.company_id

        # "What changed since last sync" — coarse id-set diff, computed
        # synchronously (fast SELECT) before the delete+append happens in
        # the background thread below. Not a true field-level diff (doesn't
        # say *which* fields changed on updated records) — just added vs
        # removed vs updated-or-unchanged external_ids, compared against
        # what's already in raw.* for this company from the last sync.
        self.run_stats["changes"] = self._diff_since_last_sync(entities_written)

        def _write():
            try:
                from database import get_engine_safe
                from etl.load import _sanitize_for_sql
            except Exception as exc:
                logger.warning("connector raw write: import failed — %s", exc)
                return

            engine = get_engine_safe()
            if not engine:
                logger.debug("connector raw write: no DB engine, skipping")
                return

            for entity, records in entities_written.items():
                try:
                    df = pd.DataFrame(records)
                    if df.empty:
                        continue

                    # Ensure company_id is stamped on every row
                    df["company_id"] = company_id

                    df = _sanitize_for_sql(df)
                    df["_loaded_at"] = pd.Timestamp.now()

                    with engine.begin() as conn:
                        # Delete this company's existing rows — safe for multi-tenant tables
                        conn.execute(
                            __import__("sqlalchemy").text(
                                f"DELETE FROM raw.{entity} WHERE company_id = :cid"
                            ),
                            {"cid": company_id},
                        )

                    # Append new rows
                    df.to_sql(
                        entity,
                        engine,
                        schema="raw",
                        if_exists="append",
                        index=False,
                    )

                    logger.info(
                        "connector raw write: %d rows → raw.%s (company=%s)",
                        len(df), entity, company_id,
                    )

                except Exception as exc:
                    # Table may not exist yet — harmless, ETL cron will create it
                    logger.warning(
                        "connector raw write: failed for raw.%s — %s", entity, exc
                    )

        threading.Thread(target=_write, daemon=True).start()

    def _trigger_etl(self, transformed: dict[str, list]) -> None:
        """
        Fire ETL refresh for every entity that received records.

        Called fire-and-forget after load() so that analytics.*,
        copilot, alerts, and dashboard stat cards reflect the new
        data without waiting for the next scheduled ETL run.

        Entity name → ETL endpoint mapping mirrors the cron pipeline.
        Failures are logged but never surfaced to the caller — ETL
        is best-effort from the connector's perspective; the data
        is already safely in Base44.
        """
        import os
        import threading

        # Entity name in transformed dict → ETL slug used in /load/{slug}-summary
        ENTITY_ETL_SLUGS = {
            "people":        "people",
            "enterprises":   "enterprise",
            "products":      "product",
            "transactions":  "transaction",
            "relationships": "relationship",
            "tasks":         "task",
            "addresses":     "address",
            "services":      "service",
        }

        railway_url = os.getenv(
            "RAILWAY_URL",
            "https://newsconseenwebapp-production.up.railway.app",
        )

        entities_written = [e for e, records in transformed.items() if records]
        if not entities_written:
            return

        def _fire():
            import requests as req
            for entity in entities_written:
                slug = ENTITY_ETL_SLUGS.get(entity)
                if not slug:
                    continue
                try:
                    resp = req.post(
                        f"{railway_url}/load/{slug}-summary",
                        params={"company_id": self.company_id},
                        timeout=60,
                    )
                    if resp.ok:
                        logger.info(
                            "connector ETL triggered: /load/%s-summary (company=%s)",
                            slug, self.company_id,
                        )
                    else:
                        logger.warning(
                            "connector ETL trigger returned %d for %s: %s",
                            resp.status_code, slug, resp.text[:200],
                        )
                except Exception as exc:
                    logger.warning(
                        "connector ETL trigger failed for %s — %s", slug, exc
                    )

        threading.Thread(target=_fire, daemon=True).start()

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
