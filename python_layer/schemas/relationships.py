from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class RelationshipSummary(BaseModel):
    """
    One row from analytics.relationship_summary.
    Matches the output of etl/relationships.transform_relationships() exactly.

    NOTE: One row per relationship record. Not grouped.
    This is the join backbone for all cross-entity dashboards.
    """
    # -- Identity --
    id:                     str
    company_id:             Optional[str] = None

    # -- Relationship definition --
    relationship_type:      Optional[str] = None
    relationship_category:  Optional[str] = None  # "person_enterprise" | "item_enterprise" |
                                                   # "item_person" | "service" | "address" | "other"

    # -- Linked entities --
    person_name:            Optional[str] = None
    enterprise_name:        Optional[str] = None
    item_name:              Optional[str] = None
    service_name:           Optional[str] = None
    address_label:          Optional[str] = None
    role:                   Optional[str] = None

    # -- Status --
    status:                 Optional[str] = None
    is_active:              bool = False
    is_ended:               bool = False

    # -- Timing --
    start_date:             Optional[datetime] = None
    end_date:               Optional[datetime] = None
    has_end_date:           bool = False
    duration_days:          int = 0
    created_date:           Optional[datetime] = None
    days_since_created:     int = 0

    # -- Snapshot --
    snapshot_date:          Optional[date]     = None
    loaded_at:              Optional[datetime] = None

    class Config:
        from_attributes = True
