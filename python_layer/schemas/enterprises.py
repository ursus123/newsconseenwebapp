from pydantic import BaseModel


class EnterpriseSummary(BaseModel):
    status: str
    enterprise_count: int
