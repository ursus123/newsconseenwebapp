"""
enrichment/temporal/__init__.py
--------------------------------
Phase E: Predictive & Temporal Intelligence

Derives forward-looking signals from internal transaction history and
existing analytics tables. No external API calls — all signals come from
the operator's own data, making this universally applicable.

Modules:
  person_temporal       spend_trend, churn_probability, CLV segment, 30d activity
  enterprise_temporal   revenue_trend, payment_behavior, avg_days_to_pay, relationship_count
  product_temporal      demand_trend, stockout_risk, velocity_change_pct, days_of_stock
  transaction_temporal  is_recurring, recurrence_count, seasonal_flag, days_since_prior_tx
"""
