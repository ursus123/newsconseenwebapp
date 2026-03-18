# python_layer/schemas/products.py

from pydantic import BaseModel
from typing import Optional


class ProductBase(BaseModel):
    name: str
    sku: str
    item_type: str
    stock_quantity: int
    unit_price: float
    cost_price: float
    status: str


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    item_type: Optional[str] = None
    stock_quantity: Optional[int] = None
    unit_price: Optional[float] = None
    cost_price: Optional[float] = None
    status: Optional[str] = None


class Product(ProductBase):
    id: int

    class Config:
        orm_mode = True


class ProductSummary(BaseModel):
    """
    Output schema for /product-summary.
    Matches the shape produced by etl/products.transform_products().
    """
    item_type: str
    total_products: int
    total_stock: int
    avg_price: float
