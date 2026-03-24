from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class TaskSummary(BaseModel):
    """
    One row from analytics.task_summary.
    Matches the output of etl/tasks.transform_tasks() exactly.
    snapshot_date and loaded_at are stamped by etl/load.load_dataframe().
    """
    # -- Grouping keys --
    enterprise_id:       Optional[str] = None
    company_id:          Optional[str] = None
    task_type:           Optional[str] = None
    status:              Optional[str] = None

    # -- Metrics --
    total_tasks:         int
    completed_tasks:     int
    completion_rate_pct: float
    overdue_tasks:       int
    tasks_last_7d:       int
    tasks_last_30d:      int

    # -- Snapshot --
    snapshot_date:       Optional[date]     = None
    loaded_at:           Optional[datetime] = None

    class Config:
        from_attributes = True
