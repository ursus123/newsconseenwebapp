"""
bi/
---
BI export engine for Newsconseen.

Serves analyst-ready file downloads from the analytics layer so operators
can open their data in Power BI, Tableau, Looker Studio, or Excel without
any database configuration.

Formats:
  excel    — multi-sheet .xlsx (Power BI / Excel import in one click)
  tableau  — .twbx package (CSV embedded in Tableau workbook, opens in Tableau Desktop/Public)
  csv      — plain CSV (Looker Studio, Google Sheets, any tool)

Endpoint:
  GET /bi/export?report=<name>&format=<excel|tableau|csv>&company_id=<id>

Reports:
  people        analytics.people_summary + person_enrichment
  transactions  analytics.transaction_summary
  products      analytics.product_summary + product_enrichment
  tasks         analytics.task_summary
  enterprises   analytics.enterprise_summary
  scores        analytics.entity_scores
"""
