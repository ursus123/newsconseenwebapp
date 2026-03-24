from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class ProductSummary(BaseModel):
    """
    One row from analytics.product_summary.
    Matches the output of etl/products.transform_products() exactly.
    """
    # -- Grouping keys --
    enterprise_id:           Optional[str] = None
    company_id:              Optional[str] = None
    item_type:               Optional[str] = None
    status:                  Optional[str] = None

    # -- Inventory metrics --
    total_products:          int
    total_stock:             int
    avg_price:               float
    avg_cost_price:          float
    total_inventory_value:   float
    avg_gross_margin_pct:    float

    # -- Alert metrics --
    low_stock_count:         int
    out_of_stock_count:      int
    expiring_7d_count:       int
    expiring_30d_count:      int
    new_last_30d:            int

    # -- Classification --
    is_medication:           bool = False
    is_livestock:            bool = False

    # -- Snapshot --
    snapshot_date:           Optional[date]     = None
    loaded_at:               Optional[datetime] = None

    class Config:
        from_attributes = True
