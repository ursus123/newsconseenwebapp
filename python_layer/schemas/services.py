from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class ServiceSummary(BaseModel):
    """
    One row from analytics.service_summary.
    Matches the output of etl/services.transform_services() exactly.
    """
    # -- Grouping keys --
    enterprise_id:           Optional[str] = None
    company_id:              Optional[str] = None
    service_type:            Optional[str] = None
    status:                  Optional[str] = None
    category:                Optional[str] = None

    # -- Metrics --
    service_count:           int
    active_service_count:    int
    inactive_service_count:  int
    total_billable_value:    float
    avg_rate:                float
    max_rate:                float
    min_rate:                float
    new_last_30d:            int

    # -- Classification --
    is_billable:             bool = False

    # -- Snapshot --
    snapshot_date:           Optional[date]     = None
    loaded_at:               Optional[datetime] = None

    class Config:
        from_attributes = True
