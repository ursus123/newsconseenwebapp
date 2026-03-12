import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as THREE from "three";
import { base44 } from "@/api/base44Client";
import { Network, RefreshCw, Info, RotateCcw } from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────
const NODE_CONFIG = {
  enterprise: { color: 0x6366f1, hex: "#6366f1", bg: "#eef2ff", icon: "🏢", label: "Enterprise" },
  person:     { color: 0x0ea5e9, hex: "#0ea5e9", bg: "#f0f9ff", icon: "👤", label: "Person" },
  service:    { color: 0x10b981, hex: "#10b981", bg: "#f0fdf4", icon: "⚙️", label: "Service" },
};

const LINK_COLORS = {
  "employs":          "#6366f1",
  "provides service": "#10b981",
  "linked service":   "#f59e0b",
  "relationship":     "#ec4899",
  "works at":         "#0ea5e9",
};

const NODE_R = 8;

// ─── Build graph data ─────────────────────────────────────────────────────────
function buildGraph(enterprises, people, services, relationships, filter) {
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

  // Deduplicate links
  const seen = new Set();
  const uniqueLinks = links.filter((l) => {
    const key = [l.source, l.target].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes, links: uniqueLinks };
}

// ─── 3D Scene ─────────────────────────────────────────────────────────────────
function useThreeGraph(canvasRef, nodes, links, onSelectNode) {
  const sceneRef = useRef(null);
  const positionsRef = useRef({});
  const nodeMeshesRef = useRef({});
  const frameRef = useRef(null);
  const orbitRef = useRef({ theta: 0.3, phi: 1.1, radius: 350, dragging: false, lastX: 0, lastY: 0 });

  // Build / rebuild scene when nodes/links change
  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    const canvas = canvasRef.current;
    const W = canvas.clientWidth || 800;
    const H = canvas.clientHeight || 600;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xf8fafc, 1);

    // Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 1, 2000);
    camera.position.set(0, 0, orbitRef.current.radius);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 300, 200);
    scene.add(dirLight);

    // Initialize node positions in a sphere
    const pos = {};
    nodes.forEach((n, i) => {
      const phi = Math.acos(-1 + (2 * i) / nodes.length);
      const theta = Math.sqrt(nodes.length * Math.PI) * phi;
      const r = 120;
      pos[n.id] = {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        vx: 0, vy: 0, vz: 0,
      };
    });
    positionsRef.current = pos;

    // Node meshes
    const nodeMeshes = {};
    const geo = new THREE.SphereGeometry(NODE_R, 24, 24);
    nodes.forEach((n) => {
      const cfg = NODE_CONFIG[n.type];
      const mat = new THREE.MeshPhongMaterial({ color: cfg.color, shininess: 60 });
      const mesh = new THREE.Mesh(geo, mat);
      const p = pos[n.id];
      mesh.position.set(p.x, p.y, p.z);
      mesh.userData = { nodeId: n.id };
      scene.add(mesh);
      nodeMeshes[n.id] = mesh;
    });
    nodeMeshesRef.current = nodeMeshes;

    // Link lines (LineSegments for perf)
    let lineSegments = null;
    const buildLines = () => {
      if (lineSegments) scene.remove(lineSegments);
      const pts = [];
      const cols = [];
      links.forEach((link) => {
        const sp = pos[link.source], tp = pos[link.target];
        if (!sp || !tp) return;
        pts.push(sp.x, sp.y, sp.z, tp.x, tp.y, tp.z);
        const hex = LINK_COLORS[link.label] || "#6366f1";
        const c = new THREE.Color(hex);
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      });
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
      lineSegments = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lineSegments);
      return lineSegments;
    };
    let lines = buildLines();

    // Force simulation ticks
    let tick = 0;
    const simulate = () => {
      if (tick > 300) return;
      tick++;
      const REPULSE = 2000, ATTRACT = 0.03, CENTER = 0.004, DAMPEN = 0.72;
      const ids = Object.keys(pos);

      ids.forEach((id) => { pos[id].fx = 0; pos[id].fy = 0; pos[id].fz = 0; });

      // Repulsion
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const na = pos[ids[a]], nb = pos[ids[b]];
          const dx = nb.x - na.x, dy = nb.y - na.y, dz = nb.z - na.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
          const force = REPULSE / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force, fz = (dz / dist) * force;
          na.fx -= fx; na.fy -= fy; na.fz -= fz;
          nb.fx += fx; nb.fy += fy; nb.fz += fz;
        }
      }

      // Attraction
      links.forEach((link) => {
        const na = pos[link.source], nb = pos[link.target];
        if (!na || !nb) return;
        const dx = nb.x - na.x, dy = nb.y - na.y, dz = nb.z - na.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        const ideal = NODE_R * 8;
        const force = (dist - ideal) * ATTRACT;
        const fx = (dx / dist) * force, fy = (dy / dist) * force, fz = (dz / dist) * force;
        na.fx += fx; na.fy += fy; na.fz += fz;
        nb.fx -= fx; nb.fy -= fy; nb.fz -= fz;
      });

      // Center gravity
      ids.forEach((id) => {
        pos[id].fx -= pos[id].x * CENTER;
        pos[id].fy -= pos[id].y * CENTER;
        pos[id].fz -= pos[id].z * CENTER;
      });

      // Integrate
      ids.forEach((id) => {
        const n = pos[id];
        n.vx = (n.vx + n.fx) * DAMPEN;
        n.vy = (n.vy + n.fy) * DAMPEN;
        n.vz = (n.vz + n.fz) * DAMPEN;
        n.x += n.vx * 0.1;
        n.y += n.vy * 0.1;
        n.z += n.vz * 0.1;
      });

      // Update mesh positions
      ids.forEach((id) => {
        if (nodeMeshes[id]) nodeMeshes[id].position.set(pos[id].x, pos[id].y, pos[id].z);
      });

      // Update lines
      const linePos = lines.geometry.attributes.position;
      let li = 0;
      links.forEach((link) => {
        const sp = pos[link.source], tp = pos[link.target];
        if (!sp || !tp) { li += 6; return; }
        linePos.setXYZ(li / 3, sp.x, sp.y, sp.z);
        linePos.setXYZ(li / 3 + 1, tp.x, tp.y, tp.z);
        li += 6;
      });
      linePos.needsUpdate = true;
    };

    // Orbit camera
    const updateCamera = () => {
      const { theta, phi, radius } = orbitRef.current;
      camera.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(0, 0, 0);
    };

    // Raycaster for click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const meshes = Object.values(nodeMeshes);
      const hits = raycaster.intersectObjects(meshes);
      if (hits.length > 0) {
        onSelectNode(hits[0].object.userData.nodeId);
      } else {
        onSelectNode(null);
      }
    };

    // Mouse orbit
    const onMouseDown = (e) => {
      orbitRef.current.dragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    };
    const onMouseMove = (e) => {
      if (!orbitRef.current.dragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.theta -= dx * 0.005;
      orbitRef.current.phi = Math.max(0.15, Math.min(Math.PI - 0.15, orbitRef.current.phi + dy * 0.005));
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    };
    const onMouseUp = () => { orbitRef.current.dragging = false; };
    const onWheel = (e) => {
      orbitRef.current.radius = Math.max(80, Math.min(800, orbitRef.current.radius + e.deltaY * 0.3));
    };

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    // Render loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      simulate();
      updateCamera();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const W2 = canvas.clientWidth, H2 = canvas.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener("resize", onResize);

    sceneRef.current = { renderer, scene, camera, nodeMeshes, lines };

    return () => {
      cancelAnimationFrame(frameRef.current);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [nodes.length, links.length]);

  const resetCamera = useCallback(() => {
    orbitRef.current.theta = 0.3;
    orbitRef.current.phi = 1.1;
    orbitRef.current.radius = 350;
  }, []);

  return { resetCamera };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EntityGraph() {
  const [enterprises, setEnterprises] = useState([]);
  const [people, setPeople] = useState([]);
  const [services, setServices] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ enterprise: true, person: true, service: true });
  const canvasRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [ents, ppl, svcs, rels] = await Promise.all([
        base44.entities.Enterprise.list("-created_date", 500),
        base44.entities.Person.list("-created_date", 500),
        base44.entities.Service.list("-created_date", 500),
        base44.entities.Relationship.list("-created_date", 1000),
      ]);
      setEnterprises(ents);
      setPeople(ppl);
      setServices(svcs);
      setRelationships(rels);
      setLoading(false);
    };
    load();
  }, []);

  const { nodes, links } = useMemo(
    () => buildGraph(enterprises, people, services, relationships, filter),
    [enterprises, people, services, relationships, filter]
  );

  const { resetCamera } = useThreeGraph(canvasRef, nodes, links, setSelected);

  const selectedNode = selected ? nodes.find((n) => n.id === selected) : null;
  const connectedLinks = selected ? links.filter((l) => l.source === selected || l.target === selected) : [];

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Network className="w-6 h-6 text-indigo-500" />
            Entity Graph <span className="ml-2 text-xs font-normal bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">3D</span>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Interactive 3D network — drag to orbit · scroll to zoom · click a node to inspect</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
            <button
              key={type}
              onClick={() => setFilter((f) => ({ ...f, [type]: !f[type] }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                filter[type] ? "text-white border-transparent shadow-sm" : "bg-white text-slate-400 border-slate-200"
              }`}
              style={filter[type] ? { backgroundColor: cfg.hex, borderColor: cfg.hex } : {}}
            >
              <span>{cfg.icon}</span> {cfg.label}
            </button>
          ))}
          <button
            onClick={resetCamera}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
            title="Reset camera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
        {/* 3D Canvas */}
        <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden relative bg-slate-50">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-sm text-slate-400">Loading entity data…</p>
              </div>
            </div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Network className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No data to display</p>
                <p className="text-slate-300 text-sm mt-1">Add Enterprises, People, or Services first</p>
              </div>
            </div>
          ) : null}
          <canvas ref={canvasRef} className="w-full h-full block" style={{ cursor: "grab" }} />
        </div>

        {/* Side panel */}
        <div className="w-64 shrink-0 space-y-3 overflow-y-auto">
          {/* Stats */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Graph Stats</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Enterprises", value: enterprises.length, color: "#6366f1" },
                { label: "People",      value: people.length,      color: "#0ea5e9" },
                { label: "Services",    value: services.length,    color: "#10b981" },
                { label: "Links",       value: links.length,       color: "#ec4899" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold" style={{ color }}>{value}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Selected node detail */}
          {selectedNode ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-100" style={{ backgroundColor: NODE_CONFIG[selectedNode.type].bg }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{NODE_CONFIG[selectedNode.type].icon}</span>
                  <div>
                    <p className="font-bold text-sm" style={{ color: NODE_CONFIG[selectedNode.type].hex }}>{selectedNode.label}</p>
                    <p className="text-[11px] text-slate-400 capitalize">{selectedNode.type}</p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Details</p>
                {selectedNode.type === "enterprise" && (
                  <>
                    {selectedNode.raw.enterprise_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Type: </span>{selectedNode.raw.enterprise_type}</p>}
                    {selectedNode.raw.status && <p className="text-xs text-slate-600"><span className="text-slate-400">Status: </span>{selectedNode.raw.status}</p>}
                    {selectedNode.raw.city && <p className="text-xs text-slate-600"><span className="text-slate-400">City: </span>{selectedNode.raw.city}</p>}
                  </>
                )}
                {selectedNode.type === "person" && (
                  <>
                    {selectedNode.raw.primary_role && <p className="text-xs text-slate-600"><span className="text-slate-400">Role: </span>{selectedNode.raw.primary_role}</p>}
                    {selectedNode.raw.person_type && <p className="text-xs text-slate-600"><span className="text-slate-400">Type: </span>{selectedNode.raw.person_type}</p>}
                    {selectedNode.raw.status && <p className="text-xs text-slate-600"><span className="text-slate-400">Status: </span>{selectedNode.raw.status}</p>}
                  </>
                )}
                {selectedNode.type === "service" && (
                  <>
                    {selectedNode.raw.category && <p className="text-xs text-slate-600"><span className="text-slate-400">Category: </span>{selectedNode.raw.category}</p>}
                    {selectedNode.raw.pricing_model && <p className="text-xs text-slate-600"><span className="text-slate-400">Pricing: </span>{selectedNode.raw.pricing_model}</p>}
                    {selectedNode.raw.price != null && <p className="text-xs text-slate-600"><span className="text-slate-400">Price: </span>{selectedNode.raw.price}</p>}
                  </>
                )}
              </div>
              {connectedLinks.length > 0 && (
                <div className="px-4 pb-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Connections ({connectedLinks.length})</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {connectedLinks.map((l, i) => {
                      const otherId = l.source === selectedNode.id ? l.target : l.source;
                      const other = nodes.find((n) => n.id === otherId);
                      const dir = l.source === selectedNode.id ? "→" : "←";
                      return (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                          <span className="text-slate-400">{dir}</span>
                          <span className="font-medium truncate flex-1">{other?.label}</span>
                          <span className="text-[10px] text-slate-300 shrink-0">{l.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <Info className="w-7 h-7 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-medium">Click any node to inspect its connections</p>
            </div>
          )}

          {/* Legend */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Node Types</p>
            {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
              <div key={type} className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cfg.hex }} />
                {cfg.icon} {cfg.label}
              </div>
            ))}
            <div className="border-t border-slate-100 mt-2 pt-2 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Link Types</p>
              {Object.entries(LINK_COLORS).map(([label, color]) => (
                <div key={label} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="w-5 h-0.5 rounded shrink-0" style={{ backgroundColor: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3">
            <p className="text-[11px] text-indigo-700 font-medium mb-1">💡 3D Controls</p>
            <ul className="text-[10px] text-indigo-600 space-y-1 list-disc list-inside">
              <li>Drag to orbit the graph</li>
              <li>Scroll to zoom in/out</li>
              <li>Click a node to inspect</li>
              <li>Toggle filters above</li>
              <li>Reset camera with ↺ button</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}