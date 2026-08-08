# Newsconseen Ontology SDK — architectural placeholder

Status: future extraction boundary; no SDK is implemented by this redesign.

```text
Newsconseen Ontology SDK
├── Object types
├── Link types
├── Action types
├── Functions
├── Permissions
└── Presentation metadata
```

The SDK will expose Newsconseen-owned, versioned definitions to forms, canonical
repositories, imports, graph construction, Idjwi, data quality and product
surfaces. It will not replace Supabase as the system of record, Python governance,
the relationship registry, or Idjwi Core. Provider-specific ontology runtimes are
not a dependency.

The current extraction seam is the canonical entity registry, ontology
relationship registry, graph authorization policy and Company Graph presentation
registry. Moving metadata into the SDK later must preserve tenant authorization,
field classification, evidence, assertion state, provenance and accessibility.
