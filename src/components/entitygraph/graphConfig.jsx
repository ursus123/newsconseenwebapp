export const NODE_CONFIG = {
  enterprise:  { color: 0x6366f1, hex: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "🏢", label: "Enterprise" },
  person:      { color: 0x0ea5e9, hex: "#0ea5e9", bg: "#f0f9ff", border: "#bae6fd", icon: "👤", label: "Person" },
  service:     { color: 0x10b981, hex: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", icon: "⚙️", label: "Service" },
  product:     { color: 0xf59e0b, hex: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "📦", label: "Product" },
  task:        { color: 0xf97316, hex: "#f97316", bg: "#fff7ed", border: "#fed7aa", icon: "✅", label: "Task" },
  transaction: { color: 0xdc2626, hex: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "💳", label: "Transaction" },
  address:     { color: 0x8b5cf6, hex: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", icon: "📍", label: "Address" },
};

export const LINK_CONFIG = {
  "employs":           { color: "#6366f1", style: "solid",  width: 2, label: "Employs" },
  "works at":          { color: "#0ea5e9", style: "solid",  width: 2, label: "Works At" },
  "provides service":  { color: "#10b981", style: "solid",  width: 1.5, label: "Provides Service" },
  "linked service":    { color: "#f59e0b", style: "solid",  width: 1.5, label: "Linked Service" },
  "relationship":      { color: "#ec4899", style: "solid",  width: 1.5, label: "Relationship" },
  "owns":              { color: "#f59e0b", style: "solid",  width: 2, label: "Owns/Item" },
  "task for":          { color: "#f97316", style: "dashed", width: 1, label: "Task For" },
  "assigned to":       { color: "#0ea5e9", style: "dashed", width: 1, label: "Assigned To" },
  "financial":         { color: "#16a34a", style: "solid",  width: 2, label: "Transaction" },
  "located at":        { color: "#8b5cf6", style: "dotted", width: 1, label: "Located At" },
};

export const LINK_COLORS = Object.fromEntries(
  Object.entries(LINK_CONFIG).map(([k, v]) => [k, v.color])
);

// Base radius — actual rendering uses node-specific sizing
export const NODE_R = 32;

// Get dynamic node radius based on data
export function getNodeRadius(node, allNodes, allLinks) {
  const base = NODE_R;
  const connections = allLinks.filter(l => l.source === node.id || l.target === node.id).length;
  switch (node.type) {
    case "enterprise": return Math.max(base, Math.min(base + connections * 3, base * 2));
    case "person": {
      const taskCount = allLinks.filter(l => (l.source === node.id || l.target === node.id) && l.edgeType === "task").length;
      return Math.max(base * 0.8, Math.min(base + taskCount * 4, base * 1.8));
    }
    case "product": {
      const qty = node.raw?.stock_quantity || 0;
      return Math.max(base * 0.6, Math.min(base + Math.log1p(qty) * 3, base * 1.6));
    }
    case "task": return base * 0.7;
    case "transaction": {
      const amt = node.raw?.amount || 0;
      return Math.max(base * 0.6, Math.min(base + Math.log1p(amt) * 2, base * 1.5));
    }
    case "address": return base * 0.75;
    default: return base;
  }
}

// Get node color based on encoding mode
export function getNodeColor(node, colorBy) {
  const cfg = NODE_CONFIG[node.type];
  if (!cfg) return "#94a3b8";

  if (colorBy === "status") {
    switch (node.type) {
      case "task": {
        const s = node.raw?.status;
        if (s === "completed") return "#16a34a";
        if (s === "in_progress") return "#f97316";
        if (s === "cancelled") return "#6b7280";
        // Check overdue
        if (node.raw?.due_date && new Date(node.raw.due_date) < new Date()) return "#dc2626";
        return "#3b82f6";
      }
      case "person": {
        const a = node.raw?.availability_status;
        if (a === "available") return "#16a34a";
        if (a === "busy") return "#f59e0b";
        if (a === "unavailable" || a === "on_leave") return "#dc2626";
        return cfg.hex;
      }
      case "enterprise": {
        const s = node.raw?.status;
        if (s === "active") return "#16a34a";
        if (s === "inactive") return "#f59e0b";
        if (s === "archived") return "#6b7280";
        return cfg.hex;
      }
      case "product": {
        const qty = node.raw?.stock_quantity ?? Infinity;
        const min = node.raw?.min_stock_level ?? 0;
        if (qty < min) return "#dc2626";
        return "#16a34a";
      }
      default: return cfg.hex;
    }
  }

  if (colorBy === "health") {
    if (node.type === "enterprise") {
      const score = computeEnterpriseHealth(node.raw);
      if (score >= 80) return "#16a34a";
      if (score >= 50) return "#f59e0b";
      return "#dc2626";
    }
    if (node.type === "product") {
      const qty = node.raw?.stock_quantity ?? Infinity;
      const min = node.raw?.min_stock_level ?? 0;
      return qty < min ? "#dc2626" : "#16a34a";
    }
    return cfg.hex;
  }

  if (colorBy === "activity") {
    // color by recency of updated_date
    if (node.raw?.updated_date) {
      const daysSince = (Date.now() - new Date(node.raw.updated_date)) / 86400000;
      if (daysSince < 7) return "#16a34a";
      if (daysSince < 30) return "#f59e0b";
      return "#dc2626";
    }
    return cfg.hex;
  }

  return cfg.hex;
}

export function computeEnterpriseHealth(e) {
  if (!e) return 50;
  let score = 50;
  if (e.status === "active") score += 20;
  if (e.operating_status === "open") score += 10;
  if (e.email) score += 5;
  if (e.phone) score += 5;
  if (e.city) score += 5;
  if (e.registration_number) score += 5;
  return Math.min(100, score);
}

export const VIEW_PRESETS = {
  "Enterprise Overview": { enterprise: true,  person: false, service: false, product: false, task: false, transaction: false, address: false },
  "Staff Network":       { enterprise: true,  person: true,  service: false, product: false, task: false, transaction: false, address: false },
  "Operations View":     { enterprise: true,  person: true,  service: false, product: false, task: true,  transaction: false, address: false },
  "Inventory View":      { enterprise: true,  person: false, service: false, product: true,  task: false, transaction: false, address: false },
  "Financial View":      { enterprise: true,  person: false, service: false, product: false, task: false, transaction: true,  address: false },
  "Healthcare View":     { enterprise: true,  person: true,  service: false, product: true,  task: false, transaction: false, address: false },
  "Full Network":        { enterprise: true,  person: true,  service: true,  product: true,  task: true,  transaction: false, address: false },
};

export function buildGraph(enterprises, people, services, products, tasks, transactions, addresses, relationships, filter, colorBy = "default") {
  const nodes = [];
  const links = [];

  // Index lookups
  const enterpriseByName = {};
  enterprises.forEach((e) => { if (e.enterprise_name) enterpriseByName[e.enterprise_name.toLowerCase()] = e; });
  const personByName = {};
  people.forEach((p) => {
    const name = `${p.first_name || ""} ${p.last_name || ""}`.trim().toLowerCase();
    if (name) personByName[name] = p;
  });
  const productByName = {};
  products.forEach((pr) => { if (pr.name) productByName[pr.name.toLowerCase()] = pr; });

  // Add nodes by type
  if (filter.enterprise) enterprises.forEach((e) => nodes.push({ id: `ent_${e.id}`, type: "enterprise", label: e.enterprise_name || "Enterprise", raw: e }));
  if (filter.person)     people.forEach((p) => nodes.push({ id: `per_${p.id}`, type: "person", label: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Person", raw: p }));
  if (filter.service)    services.forEach((s) => nodes.push({ id: `svc_${s.id}`, type: "service", label: s.name || "Service", raw: s }));
  if (filter.product)    products.forEach((pr) => nodes.push({ id: `prd_${pr.id}`, type: "product", label: pr.name || "Product", raw: pr }));
  if (filter.task)       tasks.forEach((t) => nodes.push({ id: `tsk_${t.id}`, type: "task", label: (t.title || "Task").slice(0, 20), raw: t }));
  if (filter.transaction) transactions.filter(t => t.status === "posted").forEach((t) => nodes.push({ id: `txn_${t.id}`, type: "transaction", label: `${t.transaction_type || ""} ${t.date || ""}`.trim().slice(0, 20), raw: t }));
  if (filter.address)    addresses.forEach((a) => nodes.push({ id: `adr_${a.id}`, type: "address", label: [a.city, a.country].filter(Boolean).join(", ") || a.label || "Address", raw: a }));

  const nodeIds = new Set(nodes.map((n) => n.id));

  const addLink = (src, tgt, label, edgeType) => {
    if (nodeIds.has(src) && nodeIds.has(tgt)) links.push({ id: `${src}_${tgt}_${label}`, source: src, target: tgt, label, edgeType });
  };

  // Relationships
  relationships.forEach((rel) => {
    if (rel.status === "archived") return;
    if (rel.relationship_type === "person_enterprise" && rel.person_name && rel.enterprise_name) {
      const person = personByName[rel.person_name.toLowerCase()];
      const enterprise = enterpriseByName[rel.enterprise_name.toLowerCase()];
      if (person && enterprise) addLink(`per_${person.id}`, `ent_${enterprise.id}`, rel.role || "works at", "employment");
    }
    if (rel.relationship_type === "item_enterprise" && rel.item_name && rel.enterprise_name) {
      const product = productByName[rel.item_name.toLowerCase()];
      const enterprise = enterpriseByName[rel.enterprise_name.toLowerCase()];
      if (product && enterprise) addLink(`prd_${product.id}`, `ent_${enterprise.id}`, "owns", "ownership");
    }
    if (rel.relationship_type === "item_person" && rel.item_name && rel.person_name) {
      const product = productByName[rel.item_name.toLowerCase()];
      const person = personByName[rel.person_name.toLowerCase()];
      if (product && person) addLink(`prd_${product.id}`, `per_${person.id}`, "assigned to", "assignment");
    }
  });

  // Enterprise → people, services
  enterprises.forEach((e) => {
    (e.linked_employee_ids || []).forEach((pId) => addLink(`ent_${e.id}`, `per_${pId}`, "employs", "employment"));
    (e.employee_docs || []).forEach((doc) => { if (doc.person_id) addLink(`ent_${e.id}`, `per_${doc.person_id}`, "employs", "employment"); });
    (e.linked_service_ids || []).forEach((svcId) => addLink(`ent_${e.id}`, `svc_${svcId}`, "linked service", "service"));
  });

  // Services → enterprises
  services.forEach((s) => {
    (s.linked_enterprises || []).forEach((le) => {
      if (le.enterprise_name) {
        const matchEnt = enterpriseByName[le.enterprise_name.toLowerCase()];
        if (matchEnt) addLink(`svc_${s.id}`, `ent_${matchEnt.id}`, "provides service", "service");
      }
    });
  });

  // Tasks → enterprises, people, products
  tasks.forEach((t) => {
    if (t.enterprise) {
      const ent = enterpriseByName[t.enterprise.toLowerCase()];
      if (ent) addLink(`tsk_${t.id}`, `ent_${ent.id}`, "task for", "task");
    }
    if (t.related_person) {
      const person = personByName[t.related_person.toLowerCase()];
      if (person) addLink(`tsk_${t.id}`, `per_${person.id}`, "assigned to", "task");
    }
    if (t.assigned_to_name) {
      const person = personByName[t.assigned_to_name.toLowerCase()];
      if (person) addLink(`tsk_${t.id}`, `per_${person.id}`, "assigned to", "task");
    }
    if (t.related_item) {
      const prod = productByName[t.related_item.toLowerCase()];
      if (prod) addLink(`tsk_${t.id}`, `prd_${prod.id}`, "task for", "task");
    }
  });

  // Transactions → enterprises, people
  transactions.filter(t => t.status === "posted").forEach((t) => {
    if (t.enterprise) {
      const ent = enterpriseByName[t.enterprise.toLowerCase()];
      if (ent) addLink(`txn_${t.id}`, `ent_${ent.id}`, "financial", "financial");
    }
    if (t.primary_person) {
      const person = personByName[t.primary_person.toLowerCase()];
      if (person) addLink(`txn_${t.id}`, `per_${person.id}`, "financial", "financial");
    }
  });

  // Addresses → enterprises, people
  addresses.forEach((a) => {
    (a.linked_enterprises || []).forEach((le) => {
      if (le.enterprise_name) {
        const ent = enterpriseByName[le.enterprise_name.toLowerCase()];
        if (ent) addLink(`adr_${a.id}`, `ent_${ent.id}`, "located at", "location");
      }
    });
    (a.linked_people || []).forEach((lp) => {
      if (lp.person_name) {
        const person = personByName[lp.person_name.toLowerCase()];
        if (person) addLink(`adr_${a.id}`, `per_${person.id}`, "located at", "location");
      }
    });
  });

  // Deduplicate links
  const seen = new Set();
  const uniqueLinks = links.filter((l) => {
    const key = [l.source, l.target].sort().join("|") + "|" + l.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes, links: uniqueLinks };
}

// BFS shortest path
export function findShortestPath(nodes, links, fromId, toId) {
  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  links.forEach(l => {
    adj[l.source]?.push({ id: l.target, link: l });
    adj[l.target]?.push({ id: l.source, link: l });
  });

  const visited = new Set([fromId]);
  const queue = [{ id: fromId, path: [fromId] }];
  while (queue.length) {
    const { id, path } = queue.shift();
    if (id === toId) return path;
    for (const neighbor of (adj[id] || [])) {
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        queue.push({ id: neighbor.id, path: [...path, neighbor.id] });
      }
    }
  }
  return null;
}

// Graph analytics
export function computeGraphAnalytics(nodes, links) {
  const degree = {};
  nodes.forEach(n => degree[n.id] = 0);
  links.forEach(l => { degree[l.source] = (degree[l.source] || 0) + 1; degree[l.target] = (degree[l.target] || 0) + 1; });

  const isolated = nodes.filter(n => (degree[n.id] || 0) === 0);
  const sortedByDegree = [...nodes].sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0));
  const mostConnected = sortedByDegree[0];
  const possibleEdges = nodes.length * (nodes.length - 1) / 2;
  const density = possibleEdges > 0 ? ((links.length / possibleEdges) * 100).toFixed(1) : "0";

  return { isolated, mostConnected, density, degreeMap: degree };
}