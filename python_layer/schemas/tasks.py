from pydantic import BaseModel
from .common import SummaryBase


class TaskSummary(BaseModel):
    enterprise_id: int
    total_tasks: int
    completed_tasks: int
    delayed_tasks: int
    avg_duration_days: float
