export const NODE_CONFIG = {
  enterprise: { color: 0x6366f1, hex: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "🏢", label: "Enterprise" },
  person:     { color: 0x0ea5e9, hex: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", icon: "👤", label: "Person" },
  service:    { color: 0x10b981, hex: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", icon: "⚙️", label: "Service" },
};

export const LINK_COLORS = {
  "employs":          "#6366f1",
  "provides service": "#10b981",
  "linked service":   "#f59e0b",
  "relationship":     "#ec4899",
  "works at":         "#0ea5e9",
};

export const NODE_R = 36;

export function buildGraph(enterprises, people, services, relationships, filter) {
  const nodes = [];
  const links = [];

  const enterpriseByName = {};
  enterprises.forEach((e) => { if (e.enterprise_name) enterpriseByName[e.enterprise_name.toLowerCase()] = e; });
  const personByName = {};
  people.forEach((p) => {
    const name = `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase();
    if (name) personByName[name] = p;
  });

  if (filter.enterprise) enterprises.forEach((e) => nodes.push({ id: `ent_${e.id}`, type: "enterprise", label: e.enterprise_name || "Enterprise", raw: e }));
  if (filter.person)     people.forEach((p) => nodes.push({ id: `per_${p.id}`, type: "person", label: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Person", raw: p }));
  if (filter.service)    services.forEach((s) => nodes.push({ id: `svc_${s.id}`, type: "service", label: s.name || "Service", raw: s }));

  const nodeIds = new Set(nodes.map((n) => n.id));

  relationships.forEach((rel) => {
    if (rel.status === "archived") return;
    if (rel.relationship_type === "person_enterprise" && rel.person_name && rel.enterprise_name) {
      const person = personByName[rel.person_name.toLowerCase()];
      const enterprise = enterpriseByName[rel.enterprise_name.toLowerCase()];
      if (person && enterprise) {
        const src = `per_${person.id}`, tgt = `ent_${enterprise.id}`;
        if (nodeIds.has(src) && nodeIds.has(tgt))
          links.push({ id: `rel_${rel.id}`, source: src, target: tgt, label: rel.role || "works at" });
      }
    }
  });

  enterprises.forEach((e) => {
    (e.linked_employee_ids || []).forEach((pId) => {
      const src = `ent_${e.id}`, tgt = `per_${pId}`;
      if (nodeIds.has(src) && nodeIds.has(tgt))
        links.push({ id: `emp_${src}_${tgt}`, source: src, target: tgt, label: "employs" });
    });
    (e.employee_docs || []).forEach((doc) => {
      if (doc.person_id) {
        const src = `ent_${e.id}`, tgt = `per_${doc.person_id}`;
        if (nodeIds.has(src) && nodeIds.has(tgt))
          links.push({ id: `edoc_${src}_${tgt}`, source: src, target: tgt, label: "employs" });
      }
    });
    (e.linked_service_ids || []).forEach((svcId) => {
      const src = `ent_${e.id}`, tgt = `svc_${svcId}`;
      if (nodeIds.has(src) && nodeIds.has(tgt))
        links.push({ id: `svc_${src}_${tgt}`, source: src, target: tgt, label: "linked service" });
    });
  });

  services.forEach((s) => {
    (s.linked_enterprises || []).forEach((le) => {
      if (le.enterprise_name) {
        const matchEnt = enterpriseByName[le.enterprise_name.toLowerCase()];
        if (matchEnt) {
          const src = `svc_${s.id}`, tgt = `ent_${matchEnt.id}`;
          if (nodeIds.has(src) && nodeIds.has(tgt))
            links.push({ id: `sle_${src}_${tgt}`, source: src, target: tgt, label: "provides service" });
        }
      }
    });
  });

  const seen = new Set();
  const uniqueLinks = links.filter((l) => {
    const key = [l.source, l.target].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes, links: uniqueLinks };
}