from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class PeopleSummary(BaseModel):
    """
    One row from analytics.people_summary.
    Matches the output of etl/people.transform_people() exactly.
    """
    # -- Grouping keys --
    enterprise_id:       Optional[str] = None
    company_id:          Optional[str] = None
    person_type:         Optional[str] = None
    status:              Optional[str] = None

    # -- Metrics --
    people_count:        int
    active_count:        int
    inactive_count:      int
    retention_rate_pct:  float
    avg_tenure_days:     float
    new_last_7d:         int
    new_last_30d:        int

    # -- Classification --
    is_staff:            bool = False
    is_participant:      bool = False

    # -- Snapshot --
    snapshot_date:       Optional[date]     = None
    loaded_at:           Optional[datetime] = None

    class Config:
        from_attributes = True
