from pydantic import BaseModel


class TransactionSummary(BaseModel):
    enterprise_id: int
    total_transactions: int
    total_amount: float
    avg_amount: float
