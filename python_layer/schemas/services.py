from pydantic import BaseModel
from datetime import datetime


class ServiceSummary(BaseModel):
    enterprise_id: int
    service_type: str
    service_count: int
    first_used: datetime
    last_used: datetime
