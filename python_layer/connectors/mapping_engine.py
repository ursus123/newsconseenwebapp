# ==============================================================
# Newsconseen Mapping Engine
# ==============================================================
# Translates arbitrary source field values to taxonomy values.
#
# This is the most critical piece of Phase 2. Without it,
# connectors break on any data that doesn't exactly match
# taxonomy values — a school using "Mwalimu" for teacher,
# a clinic using "Daktari" for doctor, a farm using "Ng'ombe"
# for cattle.
#
# Lookup order:
#   1. Exact match in saved operator mappings (Base44 entity)
#   2. Exact match in built-in taxonomy normalization
#   3. Fuzzy match against taxonomy system defaults (>85% confidence)
#   4. Flag as UNMAPPED — queue for operator review
#
# The operator maps once in the Connectors UI.
# The mapping is saved to ConnectorMapping in Base44.
# All future syncs use the saved mapping automatically.
# ==============================================================

import logging
from difflib import SequenceMatcher
from typing import Optional

import requests

from config.settings import settings, HEADERS
from config.taxonomy import (
    PERSON_TYPE_MAP, PERSON_SUBTYPES,
    ENTERPRISE_TYPE_MAP,
    ITEM_TYPE_MAP, ITEM_SUBTYPES,
    normalize_person_type,
    normalize_enterprise_type,
    normalize_item_type,
)

logger = logging.getLogger(__name__)

FUZZY_CONFIDENCE_THRESHOLD = 0.85


class MappingEngine:
    """
    Translates source system values to Newsconseen taxonomy values.

    Instantiated per connector run with the company's saved mappings.
    Unmapped values are collected and returned for operator review.

    Example:
        engine = MappingEngine(company_id="abc123")
        canonical = engine.map("Mwalimu", "person_subtype", parent="staff")
        # Returns "Teacher" if mapping exists, else raises UnmappedValueError
    """

    def __init__(self, company_id: str):
        self.company_id   = company_id
        self._mappings    = self._load_saved_mappings()
        self._unmapped    = []

    def map(
        self,
        source_value: str,
        field_name:   str,
        parent_value: str = None,
    ) -> str:
        """
        Translate a source value to a taxonomy value.

        Args:
            source_value: Raw value from source system ("Mwalimu", "nurse", "cattle")
            field_name:   Which field ("person_type", "person_subtype", "enterprise_type", etc.)
            parent_value: Parent type context for subtype fields ("staff", "client", etc.)

        Returns canonical taxonomy value.
        Raises UnmappedValueError if no mapping found.
        """
        if not source_value:
            return source_value

        clean = source_value.strip()

        # 1. Check saved operator mappings (exact match, case-insensitive)
        key = f"{field_name}:{clean.lower()}"
        if key in self._mappings:
            logger.debug("mapping: saved mapping hit — %s → %s", clean, self._mappings[key])
            return self._mappings[key]

        # 2. Built-in taxonomy normalization for top-level types
        builtin = self._builtin_normalize(clean, field_name)
        if builtin:
            return builtin

        # 3. Fuzzy match against taxonomy options for this field+parent
        options = self._get_taxonomy_options(field_name, parent_value)
        if options:
            fuzzy_result = self._fuzzy_match(clean, options)
            if fuzzy_result and fuzzy_result["confidence"] >= FUZZY_CONFIDENCE_THRESHOLD:
                logger.info(
                    "mapping: fuzzy match — '%s' → '%s' (confidence=%.2f)",
                    clean, fuzzy_result["value"], fuzzy_result["confidence"],
                )
                return fuzzy_result["value"]

        # 4. Cannot map — flag for operator review
        self._record_unmapped(source_value, field_name, parent_value)
        from connectors.base import UnmappedValueError
        raise UnmappedValueError(field_name, source_value)

    def save_mapping(
        self,
        source_value:    str,
        field_name:      str,
        taxonomy_value:  str,
        parent_value:    str = None,
    ) -> bool:
        """
        Save a confirmed operator mapping to Base44 ConnectorMapping entity.
        Called when the operator confirms a mapping in the Connectors UI.

        Returns True on success, False on failure.
        """
        try:
            from database import get_engine_safe
            from ingestion.quarantine import record_mapping_history
            record_mapping_history(
                get_engine_safe(), self.company_id, source_fingerprint=field_name,
                source_name=f"taxonomy:{field_name}",
                mapping={"source_value": source_value, "taxonomy_value": taxonomy_value, "parent_value": parent_value},
                changed_by="operator",
            )
        except Exception as e:
            logger.debug("mapping: history skipped — %s", e)

        try:
            connector_mapping_url = getattr(
                settings, "base44_connector_mappings_url", None
            )
            if not connector_mapping_url:
                # Store in-memory if entity not configured yet
                key = f"{field_name}:{source_value.lower()}"
                self._mappings[key] = taxonomy_value
                logger.info(
                    "mapping: saved in-memory (ConnectorMapping entity not configured) "
                    "%s → %s", source_value, taxonomy_value,
                )
                return True

            requests.post(
                connector_mapping_url,
                json={
                    "company_id":     self.company_id,
                    "field_name":     field_name,
                    "source_value":   source_value,
                    "taxonomy_value": taxonomy_value,
                    "parent_value":   parent_value,
                    "is_confirmed":   True,
                },
                headers=HEADERS,
                timeout=15,
            ).raise_for_status()

            # Update in-memory cache
            key = f"{field_name}:{source_value.lower()}"
            self._mappings[key] = taxonomy_value

            logger.info(
                "mapping: saved to Base44 — '%s' → '%s'",
                source_value, taxonomy_value,
            )
            return True

        except Exception as e:
            logger.error("mapping: save_mapping failed — %s", e)
            return False

    @property
    def unmapped_values(self) -> list[dict]:
        """Return all values that could not be mapped in this session."""
        return self._unmapped

    def has_unmapped(self) -> bool:
        return len(self._unmapped) > 0

    # ----------------------------------------------------------
    # Internal helpers
    # ----------------------------------------------------------

    def _load_saved_mappings(self) -> dict:
        """
        Load saved operator mappings from Base44 ConnectorMapping entity.
        Returns dict keyed as "field_name:source_value_lower".
        Falls back to empty dict if entity not configured yet.
        """
        try:
            connector_mapping_url = getattr(
                settings, "base44_connector_mappings_url", None
            )
            if not connector_mapping_url:
                return {}

            resp = requests.get(
                connector_mapping_url,
                params={"company_id": self.company_id, "limit": 1000},
                headers=HEADERS,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            records = data if isinstance(data, list) else data.get("data", [])

            mappings = {}
            for record in records:
                key = f"{record['field_name']}:{record['source_value'].lower()}"
                mappings[key] = record["taxonomy_value"]

            logger.info(
                "mapping: loaded %d saved mappings for company_id=%s",
                len(mappings), self.company_id,
            )
            return mappings

        except Exception as e:
            logger.info(
                "mapping: could not load saved mappings (%s) — starting fresh", e
            )
            return {}

    def _builtin_normalize(self, value: str, field_name: str) -> Optional[str]:
        """Try built-in taxonomy normalization functions."""
        v = value.lower().strip()

        if field_name == "person_type":
            result = normalize_person_type(v)
            if result and v in PERSON_TYPE_MAP:
                return result

        if field_name == "enterprise_type":
            result = normalize_enterprise_type(v)
            if result and v in ENTERPRISE_TYPE_MAP:
                return result

        if field_name == "item_type":
            result = normalize_item_type(v)
            if result and v in ITEM_TYPE_MAP:
                return result

        return None

    def _get_taxonomy_options(
        self, field_name: str, parent_value: str = None
    ) -> list[str]:
        """Return the list of valid taxonomy values for a field."""
        from config.taxonomy import (
            PERSON_TYPES, ENTERPRISE_TYPES, ITEM_TYPES,
            PERSON_SUBTYPES, ITEM_SUBTYPES,
        )

        if field_name == "person_type":
            return PERSON_TYPES
        if field_name == "enterprise_type":
            return ENTERPRISE_TYPES
        if field_name == "item_type":
            return ITEM_TYPES
        if field_name == "person_subtype" and parent_value:
            return PERSON_SUBTYPES.get(parent_value, [])
        if field_name == "item_subtype" and parent_value:
            return ITEM_SUBTYPES.get(parent_value, [])

        return []

    def _fuzzy_match(
        self, source: str, options: list[str]
    ) -> Optional[dict]:
        """
        Find the closest match in options using SequenceMatcher.
        Returns {"value": best_match, "confidence": score} or None.
        """
        if not options:
            return None

        best_score = 0.0
        best_match = None

        source_lower = source.lower()
        for option in options:
            score = SequenceMatcher(
                None, source_lower, option.lower()
            ).ratio()
            if score > best_score:
                best_score = score
                best_match = option

        if best_match and best_score >= FUZZY_CONFIDENCE_THRESHOLD:
            return {"value": best_match, "confidence": best_score}
        return None

    def _record_unmapped(
        self, source_value: str, field_name: str, parent_value: str = None
    ):
        """Record an unmapped value for operator review."""
        entry = {
            "field_name":   field_name,
            "source_value": source_value,
            "parent_value": parent_value,
        }
        if entry not in self._unmapped:
            self._unmapped.append(entry)
