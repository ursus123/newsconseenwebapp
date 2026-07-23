# Operational units and ontology relationship registry

**Status:** Implemented  
**Contracts:** `company-graph.v1`, `ontology-relationships.v1`  
**Migration:** `src/migrations/004_operational_units_and_relationship_registry.sql`  
**Updated:** 2026-07-22

## First-class operational units

An operational unit is an internal bounded operation. It is not an external
enterprise and must never be represented by an `enterprises` row merely to make
scope selection work.

`public.operational_units` owns unit identity, tenant organization identity,
unit type, parent hierarchy, manager, jurisdiction, permission policy, lifecycle
and temporal validity. Supported unit types are department, branch, warehouse,
pharmacy, field team, project, temporary operation and generic operational unit.

`public.operational_unit_memberships` binds authenticated users and/or people to
units with membership role, additional permissions and validity. A non-admin may
select a unit only when active membership or management authority is verified.
Admins may select any active unit in their tenant.

`public.operational_unit_relationships` represents governed cross-unit links.
Every unit-owned canonical table receives `operational_unit_id`. Enterprise
references remain counterparty, customer, supplier or other enterprise facts;
they no longer determine internal operational scope.

When a unit is selected, Company Graph includes:

- the selected unit;
- managed descendants, when the principal has management authority;
- ancestors needed to explain hierarchy;
- records owned by the selected/managed units;
- authorized members and relationships; and
- only enterprises actually referenced by those scoped records.

It excludes sibling-unit records, unrelated tenant enterprises and records
owned by other units. Scope selection is cached using a fingerprint that includes
the principal's allowed and managed unit IDs.

## Registry-driven relationship engine

`python_layer/ontology/relationship_registry.py` is the authoritative,
storage-independent relationship contract. Each `RelationshipRule` defines:

- carrier record type;
- possible source and target endpoint types;
- reference fields;
- predicate and direction;
- temporal behavior and fields;
- evidence requirement;
- sensitivity;
- canonicalization rule;
- inverse relationship;
- assertion class and confidence; and
- valid correction actions.

The graph engine iterates registry rules. It contains no per-entity relationship
extraction loop. New reference-backed ontology objects are registered in the
canonical entity registry and relationship registry; graph extraction, evidence,
Idjwi context and quality checks then follow automatically.

The tenant-authorized endpoint
`GET /company-graph/relationship-registry?company_id=...` publishes the versioned
contract for forms, import mapping, data quality and relationship editing.
Frontend consumers use `src/services/ontologyRelationshipRegistry.js`.

## Cross-layer consumers

- **Forms and editing:** endpoint shapes, predicates, inverses, evidence and
  correction actions.
- **Canonical repositories:** registered carrier/reference fields and unit
  ownership fields.
- **Company Graph:** nodes, edges, temporal state, evidence and provenance.
- **Idjwi:** rule ID, canonicalization evidence, sensitivity and valid actions on
  every graph edge.
- **Import mapping:** operational-unit objects and ownership fields are accepted
  by the ingestion schema registry.
- **Data quality:** missing required endpoints are reported as registry gaps.

## Deployment

Migration 004 must be applied to the same Supabase project used by the frontend
and Python backend before unit-scoped production requests are enabled. Existing
records remain organization-wide until assigned an `operational_unit_id`; unit
assignment should be performed through a governed migration or operator workflow.

## Acceptance boundary

Automated tests verify that Finance, HR, branches and warehouses remain distinct;
managed descendants are included without sibling leakage; membership controls
scope; unit nodes are not enterprises; owned records are bounded; and every
relationship rule exposes the complete shared contract.
