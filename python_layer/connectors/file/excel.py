# ==============================================================
# Excel / CSV Connector — Sprint 1
# ==============================================================
# The universal entry point for any SME with existing data.
# Handles .xlsx, .xls, .csv, and .tsv files.
#
# Operator flow:
#   1. Upload file in Connectors UI
#   2. System detects column headers, suggests field mappings
#   3. Operator confirms or adjusts: "this column = first_name"
#   4. System validates taxonomy — flags unmapped type values
#   5. Operator maps: "Mwalimu → staff/Teacher"
#   6. On confirm → records created in Base44 with taxonomy fields
#   7. ETL refresh triggered automatically
#
# Supports three target entity types:
#   - people     → Person entity
#   - enterprises → Enterprise entity
#   - products   → Product entity
#
# Entity type is specified in credentials["entity_type"] or
# auto-detected from column headers.
# ==============================================================

import io
import logging
from typing import Any

from connectors.base import BaseConnector, UnmappedValueError
from config.taxonomy import (
    normalize_person_type,
    normalize_enterprise_type,
    normalize_item_type,
    get_sector_for_subtype,
)

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Column name aliases
# Maps common column header variations to canonical field names.
# Case-insensitive matching applied before lookup.
# ----------------------------------------------------------
PEOPLE_COLUMN_ALIASES = {
    # first_name
    "first_name":    "first_name",
    "firstname":     "first_name",
    "first":         "first_name",
    "given_name":    "first_name",
    "forename":      "first_name",
    # last_name
    "last_name":     "last_name",
    "lastname":      "last_name",
    "last":          "last_name",
    "surname":       "last_name",
    "family_name":   "last_name",
    # preferred_name
    "preferred_name":"preferred_name",
    "display_name":  "preferred_name",
    "nickname":      "preferred_name",
    "known_as":      "preferred_name",
    # person_type
    "person_type":   "person_type",
    "type":          "person_type",
    "role_type":     "person_type",
    "category":      "person_type",
    # person_subtype
    "person_subtype":"person_subtype",
    "subtype":       "person_subtype",
    "role":          "person_subtype",
    "position":      "person_subtype",
    "job_title":     "person_subtype",
    "designation":   "person_subtype",
    # primary_role
    "primary_role":  "primary_role",
    "job":           "primary_role",
    "occupation":    "primary_role",
    # contact
    "phone":         "phone",
    "mobile":        "phone",
    "telephone":     "phone",
    "phone_number":  "phone",
    "email":         "email",
    "email_address": "email",
    # address
    "address":       "address",
    "street":        "address",
    "address_line_1":"address",
    "city":          "city",
    "town":          "city",
    "region":        "region",
    "state":         "region",
    "province":      "region",
    "country":       "country",
    # status
    "status":        "status",
    "active":        "status",
    # dates
    "start_date":    "start_date",
    "date_joined":   "start_date",
    "hire_date":     "start_date",
    "dob":           "date_of_birth",
    "date_of_birth": "date_of_birth",
    "birth_date":    "date_of_birth",
    # id
    "id":            "external_id",
    "employee_id":   "external_id",
    "student_id":    "external_id",
    "patient_id":    "external_id",
    "member_id":     "external_id",
    "record_id":     "external_id",
    "ref":           "external_id",
    "reference":     "external_id",
}

ENTERPRISE_COLUMN_ALIASES = {
    "enterprise_name":  "enterprise_name",
    "name":             "enterprise_name",
    "company_name":     "enterprise_name",
    "organisation":     "enterprise_name",
    "organization":     "enterprise_name",
    "business_name":    "enterprise_name",
    "enterprise_type":  "enterprise_type",
    "type":             "enterprise_type",
    "sector":           "enterprise_type",
    "industry":         "enterprise_type",
    "enterprise_subtype":"enterprise_subtype",
    "subtype":          "enterprise_subtype",
    "sub_type":         "enterprise_subtype",
    "category":         "enterprise_subtype",
    "phone":            "phone",
    "email":            "email",
    "website":          "website",
    "address":          "primary_address",
    "city":             "city",
    "region":           "region",
    "state":            "region",
    "country":          "country",
    "status":           "status",
    "id":               "external_id",
    "company_id":       "external_id",
    "reg_number":       "external_id",
    "registration":     "external_id",
}

PRODUCT_COLUMN_ALIASES = {
    "product_name":     "product_name",
    "name":             "product_name",
    "item_name":        "product_name",
    "description":      "product_name",
    "item_type":        "item_type",
    "type":             "item_type",
    "category":         "item_type",
    "item_subtype":     "item_subtype",
    "subtype":          "item_subtype",
    "sub_category":     "item_subtype",
    "brand":            "item_brand",
    "manufacturer":     "item_brand",
    "variant":          "item_variant",
    "model":            "item_variant",
    "sku":              "item_variant",
    "quantity":         "stock_quantity",
    "stock":            "stock_quantity",
    "stock_quantity":   "stock_quantity",
    "qty":              "stock_quantity",
    "price":            "unit_price",
    "unit_price":       "unit_price",
    "selling_price":    "unit_price",
    "cost":             "cost_price",
    "cost_price":       "cost_price",
    "reorder_level":    "reorder_level",
    "reorder":          "reorder_level",
    "min_stock":        "reorder_level",
    "expiry":           "expiry_date",
    "expiry_date":      "expiry_date",
    "expires":          "expiry_date",
    "unit":             "unit_of_measure",
    "unit_of_measure":  "unit_of_measure",
    "status":           "status",
    "id":               "external_id",
    "product_id":       "external_id",
    "sku_id":           "external_id",
    "barcode":          "external_id",
}

# Auto-detect entity type from column header patterns
ENTITY_DETECTION_SIGNALS = {
    "people":      {"first_name", "last_name", "person_type", "dob", "employee_id", "patient_id", "student_id"},
    "enterprises": {"enterprise_name", "company_name", "enterprise_type", "reg_number", "business_name"},
    "products":    {"product_name", "item_name", "stock_quantity", "unit_price", "expiry_date", "barcode"},
}


class ExcelConnector(BaseConnector):
    """
    Connector for Excel (.xlsx, .xls) and CSV (.csv, .tsv) files.

    credentials must contain:
        file_content:  bytes — the raw file content (from upload)
        file_name:     str   — original filename (used to detect format)
        entity_type:   str   — "people", "enterprises", or "products"
                               (auto-detected if not provided)
        column_map:    dict  — operator-confirmed column mappings
                               {"Source Column": "canonical_field"}
                               (auto-suggested if not provided)

    mappings should contain operator-confirmed taxonomy value mappings:
        {"person_type:Mwalimu": "staff", "person_subtype:Teacher": "Teacher"}
    """

    def extract(self) -> list[dict[str, Any]]:
        """
        Parse the uploaded file into a list of row dicts.
        Handles .xlsx, .xls, .csv, and .tsv formats.
        """
        file_content = self.credentials.get("file_content")
        file_name    = self.credentials.get("file_name", "upload.xlsx")

        if not file_content:
            logger.error("ExcelConnector.extract: no file_content in credentials")
            return []

        try:
            import pandas as pd
        except ImportError:
            logger.error("ExcelConnector: pandas not installed")
            return []

        try:
            file_bytes = (
                file_content if isinstance(file_content, bytes)
                else file_content.encode("utf-8")
            )
            buf = io.BytesIO(file_bytes)

            ext = file_name.rsplit(".", 1)[-1].lower()

            if ext in ("xlsx", "xls"):
                df = pd.read_excel(buf, dtype=str)
            elif ext == "tsv":
                df = pd.read_csv(buf, sep="\t", dtype=str)
            else:
                # Default to CSV
                df = pd.read_csv(buf, dtype=str)

            # Strip whitespace from all string values
            df = df.apply(lambda col: col.str.strip() if col.dtype == "object" else col)

            # Replace NaN with None for clean JSON
            df = df.where(df.notna(), None)

            records = df.to_dict(orient="records")
            logger.info(
                "ExcelConnector.extract: parsed %d rows from %s", len(records), file_name
            )
            return records

        except Exception as e:
            logger.error("ExcelConnector.extract: failed to parse %s — %s", file_name, e)
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        """
        Map raw rows to master entity format using taxonomy.

        Steps:
          1. Detect or confirm entity type (people/enterprises/products)
          2. Resolve column names using aliases + operator column_map
          3. Map taxonomy values using saved mappings + normalization
          4. Scope records to company_id
          5. Return transformed records per entity type
        """
        if not raw_records:
            return {"people": [], "enterprises": [], "products": []}

        # Detect entity type
        entity_type = self.credentials.get("entity_type") or self._detect_entity_type(
            list(raw_records[0].keys())
        )
        logger.info(
            "ExcelConnector.transform: entity_type=%s, %d records",
            entity_type, len(raw_records),
        )

        # Get column map (operator-confirmed or auto-suggested)
        column_map = self.credentials.get("column_map") or self._suggest_column_map(
            list(raw_records[0].keys()), entity_type
        )

        results = {"people": [], "enterprises": [], "products": []}

        for i, raw in enumerate(raw_records):
            try:
                # Remap column names
                remapped = self._remap_columns(raw, column_map)

                # Transform by entity type
                if entity_type == "people":
                    record = self._transform_person(remapped, i)
                elif entity_type == "enterprises":
                    record = self._transform_enterprise(remapped, i)
                elif entity_type == "products":
                    record = self._transform_product(remapped, i)
                else:
                    logger.warning(
                        "ExcelConnector.transform: unknown entity_type '%s'", entity_type
                    )
                    continue

                if record:
                    results[entity_type].append(self.scope(record))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(i))
                self.run_stats["skipped"] += 1
                logger.info(
                    "ExcelConnector: skipped row %d — unmapped %s='%s'",
                    i, e.field_name, e.source_value,
                )
            except Exception as e:
                self.run_stats["failed"] += 1
                logger.warning(
                    "ExcelConnector: failed row %d — %s", i, e
                )

        logger.info(
            "ExcelConnector.transform: %d transformed, %d skipped, %d failed",
            sum(len(v) for v in results.values()),
            self.run_stats["skipped"],
            self.run_stats["failed"],
        )
        return results

    # ----------------------------------------------------------
    # Entity-specific transform methods
    # ----------------------------------------------------------

    def _transform_person(self, row: dict, row_idx: int) -> dict | None:
        """Transform a row to Person entity format."""
        first_name = row.get("first_name") or ""
        last_name  = row.get("last_name")  or ""

        if not first_name.strip():
            logger.debug("ExcelConnector: skipping row %d — no first_name", row_idx)
            self.run_stats["skipped"] += 1
            return None

        # Normalize person_type
        raw_type = row.get("person_type") or "staff"
        try:
            person_type = self.map_value(raw_type, "person_type")
        except UnmappedValueError:
            # Default to staff if type cannot be mapped
            person_type = "staff"
            self.record_unmapped("person_type", raw_type, str(row_idx))

        # Normalize person_subtype if present
        person_subtype = row.get("person_subtype") or row.get("role")
        if person_subtype:
            try:
                person_subtype = self.map_value(person_subtype, "person_subtype")
            except UnmappedValueError:
                self.record_unmapped("person_subtype", person_subtype, str(row_idx))
                person_subtype = person_subtype  # keep original if unmapped

        return {
            "first_name":      first_name,
            "last_name":       last_name,
            "preferred_name":  row.get("preferred_name"),
            "person_type":     person_type,
            "person_subtype":  person_subtype,
            "primary_role":    row.get("primary_role"),
            "phone":           row.get("phone"),
            "email":           row.get("email"),
            "address":         row.get("address"),
            "city":            row.get("city"),
            "region":          row.get("region"),
            "country":         row.get("country"),
            "status":          row.get("status") or "active",
            "date_of_birth":   row.get("date_of_birth"),
            "start_date":      row.get("start_date"),
            "external_id":     row.get("external_id"),
        }

    def _transform_enterprise(self, row: dict, row_idx: int) -> dict | None:
        """Transform a row to Enterprise entity format."""
        name = row.get("enterprise_name") or ""

        if not name.strip():
            logger.debug("ExcelConnector: skipping row %d — no enterprise_name", row_idx)
            self.run_stats["skipped"] += 1
            return None

        raw_type = row.get("enterprise_type") or "commercial"
        try:
            enterprise_type = self.map_value(raw_type, "enterprise_type")
        except UnmappedValueError:
            enterprise_type = "commercial"
            self.record_unmapped("enterprise_type", raw_type, str(row_idx))

        enterprise_subtype = row.get("enterprise_subtype")
        sector_id, sector_name = None, None
        if enterprise_subtype:
            sector_id, sector_name = get_sector_for_subtype(enterprise_subtype)

        return {
            "enterprise_name":  name,
            "enterprise_type":  enterprise_type,
            "enterprise_subtype": enterprise_subtype,
            "sic_sector_id":    sector_id,
            "sic_sector_name":  sector_name,
            "phone":            row.get("phone"),
            "email":            row.get("email"),
            "website":          row.get("website"),
            "primary_address":  row.get("primary_address"),
            "city":             row.get("city"),
            "region":           row.get("region"),
            "country":          row.get("country"),
            "status":           row.get("status") or "active",
            "external_id":      row.get("external_id"),
        }

    def _transform_product(self, row: dict, row_idx: int) -> dict | None:
        """Transform a row to Product entity format."""
        name = row.get("product_name") or ""

        if not name.strip():
            logger.debug("ExcelConnector: skipping row %d — no product_name", row_idx)
            self.run_stats["skipped"] += 1
            return None

        raw_type = row.get("item_type") or "physical"
        try:
            item_type = self.map_value(raw_type, "item_type")
        except UnmappedValueError:
            item_type = "physical"
            self.record_unmapped("item_type", raw_type, str(row_idx))

        return {
            "product_name":    name,
            "item_type":       item_type,
            "item_subtype":    row.get("item_subtype"),
            "item_brand":      row.get("item_brand"),
            "item_variant":    row.get("item_variant"),
            "stock_quantity":  self._safe_float(row.get("stock_quantity")),
            "unit_price":      self._safe_float(row.get("unit_price")),
            "cost_price":      self._safe_float(row.get("cost_price")),
            "reorder_level":   self._safe_float(row.get("reorder_level")),
            "unit_of_measure": row.get("unit_of_measure"),
            "expiry_date":     row.get("expiry_date"),
            "status":          row.get("status") or "active",
            "external_id":     row.get("external_id"),
        }

    # ----------------------------------------------------------
    # Column mapping helpers
    # ----------------------------------------------------------

    def _detect_entity_type(self, columns: list[str]) -> str:
        """
        Auto-detect whether the file contains people, enterprises, or products
        based on column header names.
        """
        lower_cols = {c.lower().strip().replace(" ", "_") for c in columns}

        scores = {
            entity: len(signals & lower_cols)
            for entity, signals in ENTITY_DETECTION_SIGNALS.items()
        }

        best = max(scores, key=scores.get)
        logger.info(
            "ExcelConnector: auto-detected entity_type=%s (scores=%s)", best, scores
        )
        return best

    def _suggest_column_map(
        self, columns: list[str], entity_type: str
    ) -> dict[str, str]:
        """
        Suggest column name mappings based on known aliases.
        Returns {source_column: canonical_field}.
        """
        alias_map = {
            "people":      PEOPLE_COLUMN_ALIASES,
            "enterprises": ENTERPRISE_COLUMN_ALIASES,
            "products":    PRODUCT_COLUMN_ALIASES,
        }.get(entity_type, PEOPLE_COLUMN_ALIASES)

        suggestions = {}
        for col in columns:
            normalized = col.lower().strip().replace(" ", "_")
            if normalized in alias_map:
                suggestions[col] = alias_map[normalized]

        logger.info(
            "ExcelConnector: suggested %d column mappings for %s",
            len(suggestions), entity_type,
        )
        return suggestions

    def _remap_columns(self, row: dict, column_map: dict) -> dict:
        """
        Apply column_map to a row dict.
        {source_col: canonical_field} → {canonical_field: value}
        """
        remapped = {}
        for source_col, canonical in column_map.items():
            if source_col in row:
                remapped[canonical] = row[source_col]
        # Also keep any columns that were already canonical
        for col, val in row.items():
            if col not in column_map and col not in remapped:
                remapped[col] = val
        return remapped

    @staticmethod
    def _safe_float(val) -> float | None:
        """Convert a value to float, returning None if not possible."""
        if val is None or val == "":
            return None
        try:
            return float(str(val).replace(",", "").strip())
        except (ValueError, TypeError):
            return None

    @staticmethod
    def suggest_column_mappings(
        columns: list[str], entity_type: str
    ) -> dict[str, str]:
        """
        Static method — called by the Connectors UI before running the connector.
        Returns suggested mappings for the operator to review and confirm.
        """
        connector = ExcelConnector(
            company_id="preview",
            credentials={"entity_type": entity_type},
            mappings={},
        )
        return connector._suggest_column_map(columns, entity_type)
