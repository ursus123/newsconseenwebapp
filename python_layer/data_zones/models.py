from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class DataZone(str, Enum):
    RAW = "raw"
    CANONICAL = "public"
    ANALYTICS = "analytics"


@dataclass(frozen=True)
class ZoneSource:
    name: str
    zone: DataZone
    table: str
    purpose: str
    tenant_column: str = "company_id"
    freshness_column: str | None = None
    derived_from: tuple[str, ...] = field(default_factory=tuple)
    methodology: str | None = None
    confidence_kind: str | None = None
    sensitivity: str = "internal"

    @property
    def qualified_table(self):
        return f"{self.zone.value}.{self.table}"


@dataclass
class ZoneResult:
    status: str
    source: str
    data: Any = None
    freshness: dict = field(default_factory=dict)
    lineage: dict = field(default_factory=dict)
    limitation: str | None = None
    operator_action: str | None = None
