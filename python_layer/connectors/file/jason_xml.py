import json
import logging
from typing import Any

from connectors.base import BaseConnector
from connectors.registry import register

logger = logging.getLogger(__name__)


@register("json_xml")
class JsonXmlConnector(BaseConnector):
    """
    JSON / XML file import connector.

    Credentials:
        file_content  bytes  — raw file bytes
        file_name     str    — used to detect JSON vs XML
        entity_type   str    — target entity (people, enterprises, …)

    Extracts a flat list of dicts from:
      - JSON: top-level array of objects, or {"data": [...]}
      - XML:  child elements of the root (one record per child)
    """

    def extract(self) -> list[dict[str, Any]]:
        content: bytes = self.credentials.get("file_content", b"")
        filename: str  = self.credentials.get("file_name", "upload.json")

        if not content:
            logger.warning("JsonXmlConnector.extract: no file_content in credentials")
            return []

        ext = filename.lower().rsplit(".", 1)[-1]

        try:
            if ext == "json":
                return self._parse_json(content)
            elif ext == "xml":
                return self._parse_xml(content)
            else:
                # Try JSON first, then XML
                try:
                    return self._parse_json(content)
                except Exception:
                    return self._parse_xml(content)
        except Exception as e:
            logger.error("JsonXmlConnector.extract: failed — %s", e)
            raise

    # ------------------------------------------------------------------
    def _parse_json(self, content: bytes) -> list[dict]:
        text = content.decode("utf-8", errors="replace")
        data = json.loads(text)

        # Top-level array
        if isinstance(data, list):
            return [r for r in data if isinstance(r, dict)]

        # {"data": [...]} or {"items": [...]} or {"records": [...]}
        for key in ("data", "items", "records", "results", "rows", "list"):
            if isinstance(data, dict) and isinstance(data.get(key), list):
                return [r for r in data[key] if isinstance(r, dict)]

        # Single object — wrap in list
        if isinstance(data, dict):
            return [data]

        raise ValueError(f"Cannot extract records from JSON structure: {type(data)}")

    def _parse_xml(self, content: bytes) -> list[dict]:
        import xml.etree.ElementTree as ET

        root = ET.fromstring(content.decode("utf-8", errors="replace"))

        records: list[dict] = []
        # Each direct child of root = one record
        for child in root:
            record: dict = {}
            # Child's own attributes
            record.update(child.attrib)
            # Child's sub-elements as key: text
            for elem in child:
                tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag  # strip namespace
                record[tag] = (elem.text or "").strip() or None
            # Fall back to child text if no sub-elements
            if not record and child.text:
                record[child.tag] = child.text.strip()
            if record:
                records.append(record)

        # If root itself has no children with sub-elements, treat root attrs as single record
        if not records and root.attrib:
            records.append(dict(root.attrib))

        return records

    # ------------------------------------------------------------------
    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        entity_type = self.credentials.get("entity_type", "people")
        out: dict[str, list] = {
            "people": [], "enterprises": [], "products": [],
            "transactions": [], "tasks": [],
        }
        for raw in raw_records:
            record = self.scope(raw)
            if record:
                out[entity_type].append(record)
        return {k: v for k, v in out.items() if v}
