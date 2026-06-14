import { useEffect, useRef } from "react";
import * as THREE from "three";
import { loadSeamTelemetry, loadValidationHealth, type SeamStat, type ValidationHealth } from "../data";

// 3D seam map — the observability flow with depth. Adapted from Liz's three.js data-flow engine
// (Lizo-RoadTown/3ddataflowsimulation), but RESTYLED to the UX_CONTRACT (warm-black, desaturated
// semantics — no neon, no glow halos) and driven by REAL telemetry (validation_events). A
// COMPLEMENT to the 2D SeamMap: the 2D map carries the precise numbers; this carries the gestalt
// of data moving through the system. Drawers = nodes (in order), seams = bezier edges, packets =
// validation events flowing (rate ∝ count, color = outcome, the extract seam fans out).
// Honors prefers-reduced-motion (static frame, no packet animation).

// UX_CONTRACT palette as hex (index.css --color-*). Desaturated by design.
const C = {
  bg: 0x0a0d0e, edge: 0x2a2f31, faint: 0x8b9492,
  present: 0x8fa99b, attention: 0xd8b06a, active: 0x6fa8ac, invalid: 0xcf7f8a, lineage: 0x9d92c4,
};

interface Drawer { id: string; label: string; x: number; y: number; z: number; llm?: boolean }
interface Seam { from: number; to: number; label: string; point?: string; fanout?: boolean }

// Ordered flow: intake (left) → Library (right). z-stagger gives depth ("into the page").
const DRAWERS: Drawer[] = [
  { id: "source", label: "Source · PDF", x: -7, y: 0.3, z: -0.6 },
  { id: "filestore", label: "File store", x: -5, y: -0.3, z: 0.6 },
  { id: "queue", label: "Job queue", x: -3, y: 0.3, z: -0.6 },
  { id: "extractor", label: "Extractor (LLM)", x: -0.6, y: 0, z: 0.4, llm: true },
  { id: "located", label: "Located · assembled", x: 1.8, y: 0.4, z: -0.5 },
  { id: "database", label: "Database", x: 4, y: -0.3, z: 0.6 },
  { id: "human", label: "Human · review", x: 6, y: 0.3, z: -0.5 },
  { id: "library", label: "Library", x: 8, y: 0, z: 0.4 },
];

const SEAMS: Seam[] = [
  { from: 0, to: 1, label: "store PDF" },
  { from: 1, to: 2, label: "enqueue" },
  { from: 2, to: 3, label: "extract", point: "extract", fanout: true },
  { from: 3, to: 4, label: "locate", point: "locate" },
  { from: 4, to: 5, label: "store", point: "store" },
  { from: 5, to: 6, label: "verdict" },
  { from: 6, to: 7, label: "promote" },
];

function reduced(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Per-seam telemetry → visual properties. Mirrors the 2D SeamMap's binding.
function seamViz(s: Seam, stats: Record<string, SeamStat>, vh: ValidationHealth) {
  const stat = s.point ? stats[s.point] : undefined;
  let active = false, count = 0, color = C.edge;
  if (stat && stat.count > 0) {
    active = true; count = stat.count;
    color = stat.fail > 0 ? C.invalid : stat.flag > 0 ? C.attention : C.present;
  } else if (s.label === "store PDF" || s.label === "enqueue") {
    active = vh.extracted > 0; count = vh.extracted; color = C.present;
  } else if (s.label === "verdict") {
    active = vh.needsHuman + vh.verified > 0; count = vh.needsHuman + vh.verified; color = C.present;
  } else if (s.label === "promote") {
    active = vh.verified > 0; count = vh.verified; color = C.present;
  }
  // packet rate ∝ count (clamped); fanout carries more.
  const base = active ? 0.6 + Math.min(count, 24) / 12 : 0;
  const rate = s.fanout ? base * 2.2 : base;
  return { active, count, color, rate };
}

export function SeamMap3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let teardown = () => {};

    (async () => {
      const [stats, vh] = await Promise.all([loadSeamTelemetry(), loadValidationHealth()]);
      if (cancelled || !containerRef.current) return;
      teardown = build(containerRef.current, stats, vh);
    })();

    return () => { cancelled = true; teardown(); };
  }, []);

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-md border border-edge bg-inset">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-2 text-[11px] text-ink-faint">
        data flowing through the seams · color = outcome · the extract seam fans out
      </div>
    </div>
  );
}

// Build the scene; returns a teardown fn. Plain three.js (ported + restyled from the engine).
function build(container: HTMLElement, stats: Record<string, SeamStat>, vh: ValidationHealth): () => void {
  const animate = !reduced();
  const W = container.clientWidth || 800;
  const H = container.clientHeight || 420;

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.setClearColor(C.bg, 1);

  const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.bg, 18, 40);

  // Lighting — soft, desaturated. Higher ambient (we don't lean on emissive glow).
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.PointLight(C.active, 1.1, 40); key.position.set(2, 8, 12); scene.add(key);
  const fill = new THREE.PointLight(C.lineage, 0.5, 36); fill.position.set(-8, -4, -6); scene.add(fill);

  // Faint floor grid (edge color), well below the flow.
  const grid = new THREE.GridHelper(34, 17, C.edge, C.edge);
  grid.position.y = -2.6;
  (grid.material as THREE.Material).opacity = 0.35;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  // Nodes (drawers) + HTML labels projected each frame.
  const sphereGeo = new THREE.SphereGeometry(0.3, 24, 24);
  const ringGeo = new THREE.TorusGeometry(0.46, 0.018, 8, 40);
  const nodePos: THREE.Vector3[] = [];
  const labels: HTMLDivElement[] = [];
  DRAWERS.forEach((d) => {
    const pos = new THREE.Vector3(d.x, d.y, d.z);
    nodePos.push(pos);
    // a drawer is "active" if any seam touching it has telemetry; approximate via the chain.
    const col = d.llm ? C.active : C.present;
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.18, metalness: 0.3, roughness: 0.5 });
    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos); ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    const label = document.createElement("div");
    label.textContent = d.label;
    label.style.cssText = "position:absolute;transform:translate(-50%,-50%);font:500 10px/1.2 'JetBrains Mono',monospace;color:#c4ccca;white-space:nowrap;pointer-events:none;text-shadow:0 1px 3px #0a0d0e";
    container.appendChild(label);
    labels.push(label);
  });

  // Edges (seams) as bezier curves; opacity/color from telemetry.
  const curves: (THREE.QuadraticBezierCurve3 | null)[] = [];
  const seamData = SEAMS.map((s) => seamViz(s, stats, vh));
  SEAMS.forEach((s, i) => {
    const a = nodePos[s.from], b = nodePos[s.to];
    const mid = a.clone().lerp(b, 0.5); mid.y += 0.9;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    curves.push(curve);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
    const v = seamData[i];
    const mat = new THREE.LineBasicMaterial({ color: v.color, transparent: true, opacity: v.active ? 0.4 : 0.12 });
    scene.add(new THREE.Line(geo, mat));
  });

  // Packets along the curves.
  interface Pkt { mesh: THREE.Mesh; seam: number; t: number; speed: number; lateral: number }
  const pkts: Pkt[] = [];
  const pktGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const lastSpawn: number[] = SEAMS.map(() => 0);
  const MAX_PKTS = 140;

  function spawn(i: number, now: number) {
    const v = seamData[i];
    if (!v.active || v.rate <= 0 || pkts.length >= MAX_PKTS) return;
    const interval = 1000 / v.rate;
    if (now - lastSpawn[i] < interval) return;
    lastSpawn[i] = now;
    const mat = new THREE.MeshStandardMaterial({ color: v.color, emissive: v.color, emissiveIntensity: 0.4, roughness: 0.4 });
    const mesh = new THREE.Mesh(pktGeo, mat);
    scene.add(mesh);
    // fanout → spread packets laterally so 1→many reads as a burst.
    const lateral = SEAMS[i].fanout ? (Math.sin(pkts.length * 1.7) * 0.5) : 0;
    pkts.push({ mesh, seam: i, t: 0, speed: 0.35 + v.rate * 0.06, lateral });
  }

  function placePkt(p: Pkt) {
    const curve = curves[p.seam];
    if (!curve) return;
    const pos = curve.getPoint(Math.min(p.t, 1));
    pos.z += p.lateral;
    p.mesh.position.copy(pos);
  }

  // Static (reduced-motion): seed a few packets mid-curve so the flow still reads.
  if (!animate) {
    seamData.forEach((v, i) => {
      if (!v.active) return;
      [0.33, 0.66].forEach((t) => { spawn(i, 1e9); const p = pkts[pkts.length - 1]; if (p) { p.t = t; placePkt(p); } });
    });
  }

  // Camera: 3/4 view down the flow; gentle orbit unless reduced-motion.
  const center = new THREE.Vector3(0.5, 0, 0);
  function setCamera(theta: number) {
    camera.position.set(0.5 + Math.sin(theta) * 16, 5.5, Math.cos(theta) * 16);
    camera.lookAt(center);
  }
  setCamera(0);

  let raf = 0;
  let last = performance.now();
  const t0 = last;
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const t = (now - t0) / 1000;

    SEAMS.forEach((_, i) => spawn(i, now));
    for (let k = pkts.length - 1; k >= 0; k--) {
      const p = pkts[k];
      p.t += p.speed * dt;
      if (p.t >= 1) {
        scene.remove(p.mesh); (p.mesh.material as THREE.Material).dispose();
        pkts.splice(k, 1); continue;
      }
      placePkt(p);
    }
    setCamera(Math.sin(t * 0.08) * 0.22); // gentle sweep
    projectLabels();
    renderer.render(scene, camera);
  }

  function projectLabels() {
    const rect = { w: container.clientWidth, h: container.clientHeight };
    nodePos.forEach((pos, i) => {
      const p = pos.clone().project(camera);
      const x = (p.x * 0.5 + 0.5) * rect.w;
      const y = (-p.y * 0.5 + 0.5) * rect.h + 22; // nudge below the node
      const vis = p.z < 1;
      labels[i].style.left = `${x}px`;
      labels[i].style.top = `${y}px`;
      labels[i].style.opacity = vis ? "1" : "0";
    });
  }

  if (animate) {
    frame();
  } else {
    setCamera(0.18); projectLabels(); renderer.render(scene, camera);
  }

  const onResize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!animate) { projectLabels(); renderer.render(scene, camera); }
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(container);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    labels.forEach((l) => l.remove());
    renderer.dispose();
    sphereGeo.dispose(); ringGeo.dispose(); pktGeo.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    });
    canvas.remove();
  };
}
