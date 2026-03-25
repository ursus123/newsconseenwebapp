from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class AddressSummary(BaseModel):
    """
    One row from analytics.address_summary.
    Matches the output of etl/addresses.transform_addresses() exactly.

    NOTE: One row per address record. Not grouped.
    Join to other entities via enterprise_id or person_id.
    """
    # -- Identity --
    id:                  str
    company_id:          Optional[str] = None
    label:               Optional[str] = None

    # -- Address fields --
    address_line_1:      Optional[str] = None
    address_line_2:      Optional[str] = None
    city:                Optional[str] = None
    state_region:        Optional[str] = None
    postal_code:         Optional[str] = None
    country:             Optional[str] = None
    full_address:        Optional[str] = None

    # -- Coordinates --
    latitude:            Optional[float] = None
    longitude:           Optional[float] = None
    has_coordinates:     bool = False
    coordinate_source:   Optional[str] = None   # "base44" | "nominatim" | "missing"

    # -- Classification --
    address_type:        Optional[str] = None   # "enterprise" | "people" | "general"
    linked_entity_type:  Optional[str] = None   # "enterprise" | "person" | "both" | "unlinked"
    enterprise_id:       Optional[str] = None
    person_id:           Optional[str] = None

    # -- Status --
    status:              Optional[str] = None
    is_active:           bool = False

    # -- Timing --
    created_date:        Optional[datetime] = None
    days_since_created:  int = 0

    # -- Snapshot --
    snapshot_date:       Optional[date]     = None
    loaded_at:           Optional[datetime] = None

    class Config:
        from_attributes = True
