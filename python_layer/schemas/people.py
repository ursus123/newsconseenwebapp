from pydantic import BaseModel
from datetime import datetime


class PeopleSummary(BaseModel):
    enterprise_id: int
    role: str
    people_count: int
    earliest_join: datetime
    latest_join: datetime
