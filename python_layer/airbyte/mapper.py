# ==============================================================
# Airbyte → Newsconseen Universal Entity Mapper
# ==============================================================
# Maps Airbyte stream data from any source into Newsconseen's
# universal ontology: Person, Enterprise, Product, Transaction, Task.
#
# How it works:
#   1. Airbyte syncs data into PostgreSQL (airbyte.* schema)
#   2. This mapper reads those tables
#   3. Applies source-specific field mappings
#   4. Writes to raw.* schema (Newsconseen standard)
#   5. Triggers ETL transform → analytics.*
#
# Adding a new source:
#   Add an entry to STREAM_MAPPINGS below.
#   No code changes required — purely configuration.
# ==============================================================

import logging
from datetime import datetime
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


# ── Universal stream mappings ────────────────────────────────────────────────
# Structure per entry:
#   "source_name": {
#       "stream_name": {
#           "entity":   Newsconseen entity (people/enterprises/products/transactions/tasks)
#           "mapping":  {airbyte_field: newsconseen_field}
#           "defaults": {newsconseen_field: fixed_value}  — stamped on every row
#           "transform": optional callable(row) → row for complex transformations
#       }
#   }

STREAM_MAPPINGS: dict[str, dict[str, dict]] = {

    # ── Shopify ──────────────────────────────────────────────────────────────
    "shopify": {
        "customers": {
            "entity": "people",
            "mapping": {
                "id":           "external_id",
                "first_name":   "first_name",
                "last_name":    "last_name",
                "email":        "email",
                "phone":        "phone",
                "created_at":   "created_date",
                "tags":         "tags",
                "note":         "notes",
            },
            "defaults": {
                "person_type":    "client",
                "person_subtype": "Customer",
                "status":         "active",
                "source":         "shopify",
            },
        },
        "orders": {
            "entity": "transactions",
            "mapping": {
                "id":                  "external_id",
                "order_number":        "reference_number",
                "created_at":          "date",
                "total_price":         "amount",
                "subtotal_price":      "subtotal",
                "total_tax":           "tax_amount",
                "financial_status":    "payment_status",
                "fulfillment_status":  "fulfillment_status",
                "currency":            "currency",
                "customer.email":      "primary_person",
                "note":                "description",
            },
            "defaults": {
                "transaction_type": "sale_service",
                "status":           "posted",
                "source":           "shopify",
            },
        },
        "products": {
            "entity": "products",
            "mapping": {
                "id":           "external_id",
                "title":        "name",
                "product_type": "item_subtype",
                "vendor":       "supplier_name",
                "status":       "status",
                "created_at":   "created_date",
                "body_html":    "description",
                "tags":         "tags",
            },
            "defaults": {
                "item_type":  "physical",
                "item_class": "non_perishable",
                "source":     "shopify",
            },
        },
        "inventory_levels": {
            "entity": "products",
            "mapping": {
                "inventory_item_id": "external_id",
                "available":         "quantity_on_hand",
                "updated_at":        "last_updated",
            },
            "defaults": {"source": "shopify_inventory"},
        },
    },

    # ── HubSpot ──────────────────────────────────────────────────────────────
    "hubspot": {
        "contacts": {
            "entity": "people",
            "mapping": {
                "id":                          "external_id",
                "properties.firstname":        "first_name",
                "properties.lastname":         "last_name",
                "properties.email":            "email",
                "properties.phone":            "phone",
                "properties.jobtitle":         "primary_role",
                "properties.lifecyclestage":   "person_subtype",
                "properties.hs_lead_status":   "lead_status",
                "properties.createdate":       "created_date",
                "properties.notes_last_updated": "last_activity_date",
            },
            "defaults": {
                "person_type": "contact",
                "source":      "hubspot",
            },
        },
        "companies": {
            "entity": "enterprises",
            "mapping": {
                "id":                          "external_id",
                "properties.name":             "name",
                "properties.industry":         "enterprise_subtype",
                "properties.phone":            "phone",
                "properties.website":          "website",
                "properties.city":             "city",
                "properties.country":          "country",
                "properties.numberofemployees": "employee_count",
                "properties.annualrevenue":    "annual_revenue",
                "properties.createdate":       "created_date",
            },
            "defaults": {
                "enterprise_type": "commercial",
                "status":          "active",
                "source":          "hubspot",
            },
        },
        "deals": {
            "entity": "transactions",
            "mapping": {
                "id":                       "external_id",
                "properties.dealname":      "description",
                "properties.amount":        "amount",
                "properties.closedate":     "due_date",
                "properties.createdate":    "date",
                "properties.dealstage":     "status",
                "properties.pipeline":      "pipeline",
                "properties.hs_deal_stage_probability": "probability",
            },
            "defaults": {
                "transaction_type": "sale_service",
                "source":           "hubspot",
            },
        },
        "engagements": {
            "entity": "tasks",
            "mapping": {
                "id":                    "external_id",
                "engagement.type":       "task_type",
                "engagement.timestamp":  "date",
                "metadata.subject":      "title",
                "metadata.body":         "description",
                "engagement.ownerId":    "assigned_to",
            },
            "defaults": {
                "status": "completed",
                "source": "hubspot",
            },
        },
    },

    # ── Salesforce ───────────────────────────────────────────────────────────
    "salesforce": {
        "Contact": {
            "entity": "people",
            "mapping": {
                "Id":           "external_id",
                "FirstName":    "first_name",
                "LastName":     "last_name",
                "Email":        "email",
                "Phone":        "phone",
                "Title":        "primary_role",
                "Department":   "department",
                "LeadSource":   "lead_source",
                "CreatedDate":  "created_date",
            },
            "defaults": {
                "person_type": "contact",
                "source":      "salesforce",
            },
        },
        "Account": {
            "entity": "enterprises",
            "mapping": {
                "Id":             "external_id",
                "Name":           "name",
                "Industry":       "enterprise_subtype",
                "Phone":          "phone",
                "Website":        "website",
                "BillingCity":    "city",
                "BillingCountry": "country",
                "NumberOfEmployees": "employee_count",
                "AnnualRevenue":  "annual_revenue",
                "Type":           "account_type",
            },
            "defaults": {
                "enterprise_type": "commercial",
                "source":          "salesforce",
            },
        },
        "Opportunity": {
            "entity": "transactions",
            "mapping": {
                "Id":          "external_id",
                "Name":        "description",
                "Amount":      "amount",
                "CloseDate":   "due_date",
                "CreatedDate": "date",
                "StageName":   "status",
                "Probability": "probability",
                "Type":        "deal_type",
            },
            "defaults": {
                "transaction_type": "sale_service",
                "source":           "salesforce",
            },
        },
        "Task": {
            "entity": "tasks",
            "mapping": {
                "Id":          "external_id",
                "Subject":     "title",
                "Description": "description",
                "ActivityDate": "due_date",
                "Status":      "status",
                "Priority":    "priority",
                "Type":        "task_type",
            },
            "defaults": {"source": "salesforce"},
        },
    },

    # ── QuickBooks ───────────────────────────────────────────────────────────
    "quickbooks": {
        "customers": {
            "entity": "people",
            "mapping": {
                "Id":                   "external_id",
                "DisplayName":          "full_name",
                "GivenName":            "first_name",
                "FamilyName":           "last_name",
                "PrimaryEmailAddr.Address": "email",
                "PrimaryPhone.FreeFormNumber": "phone",
                "Balance":              "outstanding_balance",
                "CreateTime":           "created_date",
            },
            "defaults": {
                "person_type":    "client",
                "person_subtype": "Customer",
                "source":         "quickbooks",
            },
        },
        "invoices": {
            "entity": "transactions",
            "mapping": {
                "Id":              "external_id",
                "DocNumber":       "invoice_number",
                "TxnDate":         "date",
                "DueDate":         "due_date",
                "TotalAmt":        "amount",
                "Balance":         "amount_outstanding",
                "CustomerRef.name": "primary_person",
                "PrivateNote":     "description",
            },
            "defaults": {
                "transaction_type": "sale_service",
                "status":           "posted",
                "source":           "quickbooks",
            },
        },
        "payments": {
            "entity": "transactions",
            "mapping": {
                "Id":           "external_id",
                "TxnDate":      "date",
                "TotalAmt":     "amount",
                "PaymentMethodRef.name": "payment_method",
                "CustomerRef.name": "primary_person",
            },
            "defaults": {
                "transaction_type": "payment",
                "payment_status":   "paid",
                "status":           "posted",
                "source":           "quickbooks",
            },
        },
        "employees": {
            "entity": "people",
            "mapping": {
                "Id":         "external_id",
                "GivenName":  "first_name",
                "FamilyName": "last_name",
                "PrimaryAddr.City": "city",
                "HiredDate":  "start_date",
            },
            "defaults": {
                "person_type":      "staff",
                "engagement_model": "employed",
                "source":           "quickbooks",
            },
        },
        "vendors": {
            "entity": "people",
            "mapping": {
                "Id":          "external_id",
                "DisplayName": "full_name",
                "GivenName":   "first_name",
                "FamilyName":  "last_name",
                "PrimaryEmailAddr.Address": "email",
                "PrimaryPhone.FreeFormNumber": "phone",
                "Balance":     "outstanding_balance",
            },
            "defaults": {
                "person_type":    "contact",
                "person_subtype": "Vendor",
                "source":         "quickbooks",
            },
        },
    },

    # ── Google Sheets ────────────────────────────────────────────────────────
    # Generic — column names in the sheet become field names.
    # User maps columns to Newsconseen fields via the Airbyte UI.
    "google-sheets": {
        "*": {  # wildcard — matches any sheet name
            "entity":   "people",    # operator sets this via /airbyte/mappings endpoint
            "mapping":  {},          # pass-through — columns used as-is
            "defaults": {"source": "google_sheets"},
        },
    },

    # ── MySQL / PostgreSQL (generic DB sources) ───────────────────────────────
    "mysql": {
        "*": {
            "entity":   "people",
            "mapping":  {},
            "defaults": {"source": "mysql"},
        },
    },
    "postgres": {
        "*": {
            "entity":   "people",
            "mapping":  {},
            "defaults": {"source": "postgres"},
        },
    },

    # ── Stripe ───────────────────────────────────────────────────────────────
    "stripe": {
        "customers": {
            "entity": "people",
            "mapping": {
                "id":      "external_id",
                "name":    "full_name",
                "email":   "email",
                "phone":   "phone",
                "created": "created_date",
                "description": "notes",
            },
            "defaults": {
                "person_type":    "client",
                "person_subtype": "Customer",
                "source":         "stripe",
            },
        },
        "charges": {
            "entity": "transactions",
            "mapping": {
                "id":                  "external_id",
                "amount":              "_amount_cents",   # needs /100 — handled in transform
                "currency":            "currency",
                "created":             "date",
                "description":         "description",
                "payment_method_details.type": "payment_method",
                "status":              "payment_status",
                "receipt_number":      "reference_number",
            },
            "defaults": {
                "transaction_type": "sale_service",
                "status":           "posted",
                "source":           "stripe",
            },
        },
        "subscriptions": {
            "entity": "transactions",
            "mapping": {
                "id":                "external_id",
                "created":           "date",
                "current_period_end": "due_date",
                "status":            "payment_status",
                "plan.amount":       "_amount_cents",
                "plan.currency":     "currency",
                "plan.nickname":     "description",
            },
            "defaults": {
                "transaction_type": "subscription",
                "source":           "stripe",
            },
        },
    },

    # ── WooCommerce ──────────────────────────────────────────────────────────
    "woocommerce": {
        "customers": {
            "entity": "people",
            "mapping": {
                "id":                     "external_id",
                "first_name":             "first_name",
                "last_name":              "last_name",
                "email":                  "email",
                "billing.phone":          "phone",
                "billing.city":           "city",
                "billing.country":        "country",
                "date_created":           "created_date",
            },
            "defaults": {
                "person_type":    "client",
                "person_subtype": "Customer",
                "source":         "woocommerce",
            },
        },
        "orders": {
            "entity": "transactions",
            "mapping": {
                "id":             "external_id",
                "number":         "reference_number",
                "date_created":   "date",
                "total":          "amount",
                "total_tax":      "tax_amount",
                "status":         "payment_status",
                "currency":       "currency",
                "billing.email":  "primary_person",
            },
            "defaults": {
                "transaction_type": "sale_service",
                "status":           "posted",
                "source":           "woocommerce",
            },
        },
    },

    # ── Zendesk ──────────────────────────────────────────────────────────────
    "zendesk-support": {
        "users": {
            "entity": "people",
            "mapping": {
                "id":           "external_id",
                "name":         "full_name",
                "email":        "email",
                "phone":        "phone",
                "role":         "primary_role",
                "created_at":   "created_date",
                "organization_id": "enterprise_id",
            },
            "defaults": {
                "person_type": "client",
                "source":      "zendesk",
            },
        },
        "tickets": {
            "entity": "tasks",
            "mapping": {
                "id":           "external_id",
                "subject":      "title",
                "description":  "description",
                "status":       "status",
                "priority":     "priority",
                "created_at":   "created_date",
                "due_at":       "due_date",
                "assignee_id":  "assigned_to",
            },
            "defaults": {
                "task_type": "support_ticket",
                "source":    "zendesk",
            },
        },
    },

    # ── Jira ─────────────────────────────────────────────────────────────────
    "jira": {
        "issues": {
            "entity": "tasks",
            "mapping": {
                "id":                    "external_id",
                "key":                   "reference_number",
                "fields.summary":        "title",
                "fields.description":    "description",
                "fields.status.name":    "status",
                "fields.priority.name":  "priority",
                "fields.issuetype.name": "task_type",
                "fields.created":        "created_date",
                "fields.duedate":        "due_date",
                "fields.assignee.displayName": "assigned_to",
            },
            "defaults": {"source": "jira"},
        },
    },

    # ── Mailchimp ────────────────────────────────────────────────────────────
    "mailchimp": {
        "list_members": {
            "entity": "people",
            "mapping": {
                "id":                      "external_id",
                "merge_fields.FNAME":      "first_name",
                "merge_fields.LNAME":      "last_name",
                "email_address":           "email",
                "status":                  "subscription_status",
                "timestamp_signup":        "created_date",
                "merge_fields.PHONE":      "phone",
            },
            "defaults": {
                "person_type":    "client",
                "person_subtype": "Subscriber",
                "source":         "mailchimp",
            },
        },
    },

    # ── Airtable ─────────────────────────────────────────────────────────────
    "airtable": {
        "*": {   # wildcard — any table
            "entity":   "people",
            "mapping":  {},
            "defaults": {"source": "airtable"},
        },
    },

    # ── GitHub (for tech teams using Newsconseen for project tracking) ────────
    "github": {
        "issues": {
            "entity": "tasks",
            "mapping": {
                "id":           "external_id",
                "number":       "reference_number",
                "title":        "title",
                "body":         "description",
                "state":        "status",
                "created_at":   "created_date",
                "closed_at":    "completed_date",
                "assignee.login": "assigned_to",
            },
            "defaults": {
                "task_type": "github_issue",
                "source":    "github",
            },
        },
    },
}


# ── AirbyteMapper ────────────────────────────────────────────────────────────

class AirbyteMapper:
    """
    Maps Airbyte raw stream data into Newsconseen's universal entity format.

    Reads from the airbyte.* PostgreSQL schema (where Airbyte writes its output),
    applies source-specific field mappings, and returns DataFrames ready to
    write into raw.* tables for ETL processing.
    """

    def __init__(self, company_id: str):
        self.company_id = company_id

    def get_mapping(self, source_name: str, stream_name: str) -> dict | None:
        """Return the mapping config for a source+stream, or None if unknown."""
        source = STREAM_MAPPINGS.get(source_name.lower())
        if not source:
            return None
        # Exact match first, then wildcard
        return source.get(stream_name) or source.get("*")

    def map_record(self, record: dict, mapping_config: dict) -> dict:
        """
        Apply a mapping config to a single Airbyte record.

        Handles:
        - Flat field rename: {"shopify_field": "newsconseen_field"}
        - Nested dot-notation: {"properties.email": "email"}
        - Defaults: always-set values
        - Special transforms: _amount_cents → amount (divide by 100)
        """
        result = {}

        # Apply field mapping
        for src_key, dst_key in mapping_config.get("mapping", {}).items():
            value = self._get_nested(record, src_key)
            if value is not None:
                result[dst_key] = value

        # Special transforms
        if "_amount_cents" in result:
            cents = result.pop("_amount_cents")
            try:
                result["amount"] = float(cents) / 100
            except (TypeError, ValueError):
                pass

        # Apply defaults (only if field not already set)
        for k, v in mapping_config.get("defaults", {}).items():
            result.setdefault(k, v)

        # Always stamp company_id and source timestamp
        result["company_id"]  = self.company_id
        result["_airbyte_at"] = datetime.utcnow().isoformat()

        return result

    def _get_nested(self, obj: dict, dotted_key: str) -> Any:
        """Resolve a dot-notation key like 'properties.email' from a nested dict."""
        parts = dotted_key.split(".")
        val = obj
        for part in parts:
            if isinstance(val, dict):
                val = val.get(part)
            else:
                return None
        return val

    def map_stream(
        self,
        source_name: str,
        stream_name: str,
        records: list[dict],
    ) -> tuple[str, pd.DataFrame]:
        """
        Map a full stream of Airbyte records to a Newsconseen entity DataFrame.

        Returns: (entity_name, mapped_dataframe)
        entity_name is one of: people, enterprises, products, transactions, tasks
        """
        config = self.get_mapping(source_name, stream_name)
        if not config:
            logger.warning(
                "AirbyteMapper: no mapping for %s/%s — skipping %d records",
                source_name, stream_name, len(records),
            )
            return "unknown", pd.DataFrame()

        mapped = [self.map_record(r, config) for r in records]
        df = pd.DataFrame(mapped)

        entity = config.get("entity", "people")
        logger.info(
            "AirbyteMapper: mapped %d records from %s/%s → %s",
            len(df), source_name, stream_name, entity,
        )
        return entity, df

    def list_supported_sources(self) -> list[dict]:
        """Return metadata about all supported source integrations."""
        out = []
        for source, streams in STREAM_MAPPINGS.items():
            stream_info = []
            for stream, config in streams.items():
                if stream == "*":
                    stream_info.append({"stream": "(any)", "entity": config.get("entity", "people")})
                else:
                    stream_info.append({"stream": stream, "entity": config.get("entity", "people")})
            out.append({
                "source":        source,
                "stream_count":  len([s for s in streams if s != "*"]),
                "streams":       stream_info,
            })
        return sorted(out, key=lambda x: x["source"])
