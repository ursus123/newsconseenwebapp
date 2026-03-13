from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SummaryBase(BaseModel):
    enterprise_id: Optional[int] = None
