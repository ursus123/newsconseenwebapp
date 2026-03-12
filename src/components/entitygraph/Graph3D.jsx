import React, { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { NODE_CONFIG, LINK_COLORS } from "./graphConfig";

const NODE_R_3D = 8;

export default function Graph3D({ nodes, links, selected, onSelect }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const orbitRef = useRef({ theta: 0.3, phi: 1.1, radius: 350, dragging: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    const canvas = canvasRef.current;
    const W = canvas.clientWidth || 800;
    const H = canvas.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xf8fafc, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 1, 2000);
    camera.position.set(0, 0, orbitRef.current.radius);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(200, 300, 200);
    scene.add(dirLight);

    // Initialize positions on a sphere
    const pos = {};
    nodes.forEach((n, i) => {
      const phi = Math.acos(-1 + (2 * i) / nodes.length);
      const theta = Math.sqrt(nodes.length * Math.PI) * phi;
      const r = 120;
      pos[n.id] = { x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.sin(phi) * Math.sin(theta), z: r * Math.cos(phi), vx: 0, vy: 0, vz: 0 };
    });

    // Node meshes
    const nodeMeshes = {};
    const geo = new THREE.SphereGeometry(NODE_R_3D, 24, 24);
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

    // Lines
    const buildLines = () => {
      const pts = [], cols = [];
      links.forEach((link) => {
        const sp = pos[link.source], tp = pos[link.target];
        if (!sp || !tp) return;
        pts.push(sp.x, sp.y, sp.z, tp.x, tp.y, tp.z);
        const c = new THREE.Color(LINK_COLORS[link.label] || "#6366f1");
        cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
      });
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      lineGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
      const ls = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(ls);
      return ls;
    };
    let lineSegments = buildLines();

    // Force sim
    let tick = 0;
    const simulate = () => {
      if (tick > 300) return;
      tick++;
      const REPULSE = 2000, ATTRACT = 0.03, CENTER = 0.004, DAMPEN = 0.72;
      const ids = Object.keys(pos);
      ids.forEach((id) => { pos[id].fx = 0; pos[id].fy = 0; pos[id].fz = 0; });

      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          const na = pos[ids[a]], nb = pos[ids[b]];
          const dx = nb.x - na.x, dy = nb.y - na.y, dz = nb.z - na.z;
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
          const force = REPULSE / (dist * dist);
          na.fx -= (dx/dist)*force; na.fy -= (dy/dist)*force; na.fz -= (dz/dist)*force;
          nb.fx += (dx/dist)*force; nb.fy += (dy/dist)*force; nb.fz += (dz/dist)*force;
        }
      }
      links.forEach((link) => {
        const na = pos[link.source], nb = pos[link.target];
        if (!na || !nb) return;
        const dx = nb.x - na.x, dy = nb.y - na.y, dz = nb.z - na.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        const force = (dist - NODE_R_3D * 8) * ATTRACT;
        na.fx += (dx/dist)*force; na.fy += (dy/dist)*force; na.fz += (dz/dist)*force;
        nb.fx -= (dx/dist)*force; nb.fy -= (dy/dist)*force; nb.fz -= (dz/dist)*force;
      });
      ids.forEach((id) => {
        const n = pos[id];
        n.fx -= n.x * CENTER; n.fy -= n.y * CENTER; n.fz -= n.z * CENTER;
        n.vx = (n.vx + n.fx) * DAMPEN; n.vy = (n.vy + n.fy) * DAMPEN; n.vz = (n.vz + n.fz) * DAMPEN;
        n.x += n.vx * 0.1; n.y += n.vy * 0.1; n.z += n.vz * 0.1;
        if (nodeMeshes[id]) nodeMeshes[id].position.set(n.x, n.y, n.z);
      });

      const linePos = lineSegments.geometry.attributes.position;
      let li = 0;
      links.forEach((link) => {
        const sp = pos[link.source], tp = pos[link.target];
        if (!sp || !tp) { li += 6; return; }
        linePos.setXYZ(li/3, sp.x, sp.y, sp.z);
        linePos.setXYZ(li/3+1, tp.x, tp.y, tp.z);
        li += 6;
      });
      linePos.needsUpdate = true;
    };

    const updateCamera = () => {
      const { theta, phi, radius } = orbitRef.current;
      camera.position.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta));
      camera.lookAt(0, 0, 0);
    };

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const handleClick = (e) => {
      if (orbitRef.current._moved) { orbitRef.current._moved = false; return; }
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(Object.values(nodeMeshes));
      onSelect(hits.length > 0 ? hits[0].object.userData.nodeId : null);
    };

    const onMouseDown = (e) => { orbitRef.current.dragging = true; orbitRef.current.lastX = e.clientX; orbitRef.current.lastY = e.clientY; orbitRef.current._moved = false; };
    const onMouseMove = (e) => {
      if (!orbitRef.current.dragging) return;
      const dx = e.clientX - orbitRef.current.lastX, dy = e.clientY - orbitRef.current.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) orbitRef.current._moved = true;
      orbitRef.current.theta -= dx * 0.005;
      orbitRef.current.phi = Math.max(0.15, Math.min(Math.PI - 0.15, orbitRef.current.phi + dy * 0.005));
      orbitRef.current.lastX = e.clientX; orbitRef.current.lastY = e.clientY;
    };
    const onMouseUp = () => { orbitRef.current.dragging = false; };
    const onWheel = (e) => { orbitRef.current.radius = Math.max(80, Math.min(800, orbitRef.current.radius + e.deltaY * 0.3)); };

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: true });

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      simulate();
      updateCamera();
      // Highlight selected node
      nodes.forEach((n) => {
        const mesh = nodeMeshes[n.id];
        if (!mesh) return;
        const cfg = NODE_CONFIG[n.type];
        if (selected === n.id) {
          mesh.material.emissive = new THREE.Color(cfg.hex);
          mesh.material.emissiveIntensity = 0.4;
          mesh.scale.setScalar(1.4);
        } else {
          mesh.material.emissive = new THREE.Color(0x000000);
          mesh.material.emissiveIntensity = 0;
          mesh.scale.setScalar(1);
        }
      });
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const W2 = canvas.clientWidth, H2 = canvas.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener("resize", onResize);

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

  return (
    <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden relative bg-slate-50">
      {nodes.length === 0 ? null : null}
      <canvas ref={canvasRef} className="w-full h-full block" style={{ cursor: "grab" }} />
      <button
        onClick={resetCamera}
        className="absolute top-3 right-3 p-2 rounded-xl border border-slate-200 bg-white/90 hover:bg-white text-slate-500 text-xs shadow-sm"
        title="Reset camera"
      >
        ↺ Reset
      </button>
    </div>
  );
}