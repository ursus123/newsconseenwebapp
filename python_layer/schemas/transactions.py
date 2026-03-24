from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class TransactionSummary(BaseModel):
    """
    One row from analytics.transaction_summary.
    Matches the output of etl/transactions.transform_transactions() exactly.
    """
    # -- Grouping keys --
    enterprise_id:       Optional[str] = None
    company_id:          Optional[str] = None
    transaction_type:    Optional[str] = None
    status:              Optional[str] = None

    # -- Metrics --
    total_transactions:  int
    total_amount:        float
    avg_amount:          float
    outstanding_amount:  float
    revenue_last_7d:     int
    revenue_last_30d:    int
    expense_last_30d:    int

    # -- Classification --
    is_revenue:          bool = False
    is_expense:          bool = False

    # -- Snapshot --
    snapshot_date:       Optional[date]     = None
    loaded_at:           Optional[datetime] = None

    class Config:
        from_attributes = True
