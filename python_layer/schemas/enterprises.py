from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class EnterpriseSummary(BaseModel):
    """
    One row from analytics.enterprise_summary.
    Matches the output of etl/enterprises.transform_enterprises() exactly.

    NOTE: This table has one row per enterprise, not one row per group.
    It is the join anchor for all other summary tables via enterprise_id.
    """
    # -- Identity --
    id:                  str
    company_id:          Optional[str] = None
    name:                Optional[str] = None
    enterprise_type:     Optional[str] = None

    # -- Status --
    status:              Optional[str] = None
    operating_status:    Optional[str] = None
    is_active:           bool = False
    is_root:             bool = False
    parent_id:           Optional[str] = None

    # -- Contact --
    primary_address:     Optional[str] = None
    phone:               Optional[str] = None
    email:               Optional[str] = None
    website:             Optional[str] = None

    # -- Timing --
    created_date:        Optional[datetime] = None
    days_since_created:  int = 0

    # -- Snapshot --
    snapshot_date:       Optional[date]     = None
    loaded_at:           Optional[datetime] = None

    class Config:
        from_attributes = True
