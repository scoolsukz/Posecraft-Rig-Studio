import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createAnimationPreset } from "@/lib/animation-presets";
import { CharacterSkin } from "@/components/character-skin";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RigLab — Interactive Animation Rigging Studio" },
      { name: "description", content: "Pose a skeleton, set keyframes and play back animation in a Blender-style rigging workspace." },
      { property: "og:title", content: "RigLab — Interactive Animation Rigging Studio" },
      { property: "og:description", content: "Pose bones, keyframe and animate a character rig in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RigLab,
});

type Bone = { id: string; name: string; parent: string | null; length: number; rest: number; width: number };

const BONES: Bone[] = [
  { id: "root", name: "root", parent: null, length: 0, rest: 0, width: 0 },
  { id: "spine", name: "spine", parent: "root", length: 40, rest: -90, width: 18 },
  { id: "chest", name: "chest", parent: "spine", length: 60, rest: 0, width: 30 },
  { id: "neck", name: "neck", parent: "chest", length: 22, rest: 0, width: 10 },
  { id: "head", name: "head", parent: "neck", length: 44, rest: 0, width: 30 },
  { id: "upperarm.L", name: "upperarm.L", parent: "chest", length: 62, rest: 105, width: 13 },
  { id: "forearm.L", name: "forearm.L", parent: "upperarm.L", length: 56, rest: -10, width: 11 },
  { id: "hand.L", name: "hand.L", parent: "forearm.L", length: 20, rest: 0, width: 10 },
  { id: "upperarm.R", name: "upperarm.R", parent: "chest", length: 62, rest: -105, width: 13 },
  { id: "forearm.R", name: "forearm.R", parent: "upperarm.R", length: 56, rest: 10, width: 11 },
  { id: "hand.R", name: "hand.R", parent: "forearm.R", length: 20, rest: 0, width: 10 },
  { id: "thigh.L", name: "thigh.L", parent: "root", length: 80, rest: 100, width: 16 },
  { id: "shin.L", name: "shin.L", parent: "thigh.L", length: 76, rest: -5, width: 13 },
  { id: "foot.L", name: "foot.L", parent: "shin.L", length: 26, rest: -80, width: 9 },
  { id: "thigh.R", name: "thigh.R", parent: "root", length: 80, rest: 80, width: 16 },
  { id: "shin.R", name: "shin.R", parent: "thigh.R", length: 76, rest: 5, width: 13 },
  { id: "foot.R", name: "foot.R", parent: "shin.R", length: 26, rest: -80, width: 9 },
];
const byId = Object.fromEntries(BONES.map((b) => [b.id, b])) as Record<string, Bone>;
const FRAMES = 60;
type Pose = Record<string, number>;
type Keys = Record<string, Record<number, number>>; // bone -> frame -> rot
const rad = (d: number) => (d * Math.PI) / 180;

function solve(pose: Pose, root: { x: number; y: number }) {
  const out: Record<string, { x: number; y: number; ex: number; ey: number; a: number }> = {};
  for (const b of BONES) {
    const p = b.parent ? out[b.parent]! : null;
    const x = p ? p.ex : root.x;
    const y = p ? p.ey : root.y;
    const base = p ? p.a : 0;
    const a = base + b.rest + (b.parent ? pose[b.id] ?? 0 : 0);
    out[b.id] = { x, y, a, ex: x + Math.cos(rad(a)) * b.length, ey: y + Math.sin(rad(a)) * b.length };
  }
  return out;
}

function sample(keys: Keys, frame: number): Pose {
  const pose: Pose = {};
  for (const [id, k] of Object.entries(keys)) {
    const fs = Object.keys(k).map(Number).sort((a, b) => a - b);
    if (!fs.length) continue;
    const first = fs[0]!, last = fs[fs.length - 1]!;
    let prev = first, next = last;
    for (const f of fs) { if (f <= frame) prev = f; if (f >= frame) { next = f; break; } }
    if (frame <= first) { pose[id] = k[first]!; continue; }
    if (frame >= last) { pose[id] = k[last]!; continue; }
    const t = next === prev ? 0 : (frame - prev) / (next - prev);
    const e = t * t * (3 - 2 * t); // bezier-ish ease
    pose[id] = k[prev]! + (k[next]! - k[prev]!) * e;
  }
  return pose;
}

const DEMO: Keys = {
  "upperarm.L": { 0: -40, 30: 40, 59: -40 }, "upperarm.R": { 0: 40, 30: -40, 59: 40 },
  "forearm.L": { 0: -30, 30: -10, 59: -30 }, "forearm.R": { 0: 10, 30: 30, 59: 10 },
  "thigh.L": { 0: 25, 30: -25, 59: 25 }, "thigh.R": { 0: -25, 30: 25, 59: -25 },
  "shin.L": { 0: 0, 15: -35, 30: 0, 45: -5, 59: 0 }, "shin.R": { 0: -5, 15: 0, 30: 0, 45: 35, 59: -5 },
  head: { 0: -5, 30: 5, 59: -5 },
};

// Jump: crouch (0-12), launch (12-18), airborne (18-34), land (34-42), recover (42-59).
// "root" key = vertical offset in px (negative = up).
const JUMP: Keys = {
  root: { 0: 0, 12: 40, 18: -20, 26: -110, 34: -20, 38: 45, 46: 10, 59: 0 },
  spine: { 0: 0, 12: 18, 18: -5, 26: 0, 34: 0, 38: 20, 46: 5, 59: 0 },
  chest: { 0: 0, 12: 8, 18: -5, 26: 0, 38: 10, 59: 0 },
  head: { 0: 0, 12: -15, 18: -10, 26: 0, 38: -15, 59: 0 },
  "upperarm.L": { 0: 0, 12: -70, 18: 120, 26: 140, 34: 60, 38: -50, 46: -10, 59: 0 },
  "upperarm.R": { 0: 0, 12: 70, 18: -120, 26: -140, 34: -60, 38: 50, 46: 10, 59: 0 },
  "forearm.L": { 0: 0, 12: -20, 18: 0, 26: -10, 38: -30, 59: 0 },
  "forearm.R": { 0: 0, 12: 20, 18: 0, 26: 10, 38: 30, 59: 0 },
  "thigh.L": { 0: 0, 12: -55, 18: 5, 26: -45, 34: -10, 38: -60, 46: -15, 59: 0 },
  "thigh.R": { 0: 0, 12: 55, 18: -5, 26: 45, 34: 10, 38: 60, 46: 15, 59: 0 },
  "shin.L": { 0: 0, 12: 95, 18: 0, 26: 80, 34: 15, 38: 105, 46: 25, 59: 0 },
  "shin.R": { 0: 0, 12: -95, 18: 0, 26: -80, 34: -15, 38: -105, 46: -25, 59: 0 },
  "foot.L": { 0: 0, 12: -40, 18: 30, 26: 10, 34: 20, 38: -40, 59: 0 },
  "foot.R": { 0: 0, 12: 40, 18: -30, 26: -10, 34: -20, 38: 40, 59: 0 },
};

function RigLab() {
  const [keys, setKeys] = useState<Keys>(DEMO);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState("upperarm.L");
  const [override, setOverride] = useState<Pose>({});
  const [mode, setMode] = useState<"pose" | "object">("pose");
  const [showMesh, setShowMesh] = useState(true);
  const [onion, setOnion] = useState(false);
  const [autoKey, setAutoKey] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [animationName, setAnimationName] = useState("");
  const [customAnimations, setCustomAnimations] = useState<Array<{ name: string; keys: Keys }>>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<string | null>(null);

  const pose = useMemo(() => ({ ...sample(keys, frame), ...override }), [keys, frame, override]);
  const rootAt = (p: Pose) => ({ x: 400, y: 330 + (p["root"] ?? 0) });
  const world = useMemo(() => solve(pose, rootAt(pose)), [pose]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => { setOverride({}); setFrame((f) => (f + 1) % FRAMES); }, 1000 / 24);
    return () => clearInterval(t);
  }, [playing]);

  const insertKey = useCallback((id = sel) => {
    setKeys((k) => ({ ...k, [id]: { ...(k[id] ?? {}), [frame]: pose[id] ?? 0 } }));
    setOverride((o) => { const n = { ...o }; delete n[id]; return n; });
  }, [sel, frame, pose]);

  const setRot = (id: string, v: number) => {
    if (autoKey) setKeys((k) => ({ ...k, [id]: { ...(k[id] ?? {}), [frame]: v } }));
    else setOverride((o) => ({ ...o, [id]: v }));
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (createOpen) return;
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === "i" || e.key === "k") insertKey();
      if (e.key === "ArrowRight") setFrame((f) => Math.min(FRAMES - 1, f + 1));
      if (e.key === "ArrowLeft") setFrame((f) => Math.max(0, f - 1));
      if (e.key === "Tab") { e.preventDefault(); setMode((m) => (m === "pose" ? "object" : "pose")); }
      if (e.altKey && e.key === "r") setRot(sel, 0);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
    const id = drag.current, b = byId[id]!, w = world[id]!;
    const parentA = b.parent ? world[b.parent]!.a : 0;
    const target = (Math.atan2(p.y - w.y, p.x - w.x) * 180) / Math.PI;
    let r = target - parentA - b.rest;
    r = ((r + 540) % 360) - 180;
    setRot(id, Math.round(r * 10) / 10);
  };

  const ghostFrames = onion ? [frame - 6, frame - 3, frame + 3, frame + 6].filter((f) => f >= 0 && f < FRAMES) : [];
  const depth = (id: string): number => (byId[id]!.parent ? 1 + depth(byId[id]!.parent!) : 0);
  const keyedFrames = new Set(Object.values(keys).flatMap((k) => Object.keys(k).map(Number)));

  return (
    <div className="flex h-screen flex-col text-xs" onPointerUp={() => (drag.current = null)}>
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b bg-panel px-3 py-1.5">
        <span className="font-mono font-semibold text-primary">◆ RigLab</span>
        <div className="ml-auto flex gap-1">
          {(["object", "pose"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-sm px-2 py-0.5 capitalize ${mode === m ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>
              {m} mode
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Viewport */}
        <main className="relative flex-1 bg-viewport">
          <div className="absolute left-3 top-2 z-10 font-mono text-muted-foreground">
            User Ortho · Armature · <span className="text-foreground">{sel}</span> · Frame {frame}
          </div>
          <div className="absolute right-3 top-2 z-10 flex gap-1">
            <Toggle on={showMesh} set={setShowMesh} label="Mesh" />
            <Toggle on={onion} set={setOnion} label="Onion skin" />
            <Toggle on={autoKey} set={setAutoKey} label="● Auto key" />
          </div>
          <svg ref={svgRef} viewBox="0 0 800 560" className="h-full w-full" onPointerMove={onMove}>
            <defs>
              <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" className="stroke-grid" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect x="-2000" y="-2000" width="5000" height="5000" fill="url(#g)" />
            <line x1="-2000" x2="3000" y1="500" y2="500" className="stroke-axis-x" strokeOpacity={0.6} />
            <line y1="-2000" y2="3000" x1="400" x2="400" className="stroke-axis-y" strokeOpacity={0.6} />

            {ghostFrames.map((f) => (
              <Skeleton key={f} world={(() => { const gp = sample(keys, f); return solve(gp, rootAt(gp)); })()} ghost mesh={false} sel="" />
            ))}
            <Skeleton world={world} mesh={showMesh} sel={mode === "pose" ? sel : ""}
              onDown={(id) => { if (mode !== "pose") return; setSel(id); drag.current = id; setPlaying(false); }} />
          </svg>
          <div className="absolute bottom-2 left-3 font-mono text-muted-foreground">
            Drag a bone to rotate · I insert key · Space play · ←/→ step · Tab mode · Alt+R clear rotation
          </div>
        </main>

        {/* Right side: outliner + properties */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l bg-panel">
          <Section title="Outliner">
            <div className="max-h-72 overflow-auto font-mono">
              {BONES.filter((b) => b.length).map((b) => (
                <button key={b.id} onClick={() => setSel(b.id)}
                  style={{ paddingLeft: depth(b.id) * 10 }}
                  className={`flex w-full items-center gap-1 py-0.5 text-left ${sel === b.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
                  <span className="text-bone">⟡</span>{b.name}
                  {keys[b.id] && Object.keys(keys[b.id]!).length > 0 && <span className="ml-auto pr-2 text-key">◆</span>}
                </button>
              ))}
            </div>
          </Section>
          <Section title={`Bone · ${sel}`}>
            <label className="text-muted-foreground">Rotation Z</label>
            <div className="mt-1 flex items-center gap-2">
              <input type="range" min={-180} max={180} step={0.5} value={pose[sel] ?? 0}
                onChange={(e) => setRot(sel, +e.target.value)} className="flex-1 accent-primary" />
              <span className="w-12 text-right font-mono">{(pose[sel] ?? 0).toFixed(1)}°</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-muted-foreground">
              <span>Length</span><span className="text-foreground">{byId[sel]!.length}</span>
              <span>Parent</span><span className="text-foreground">{byId[sel]!.parent}</span>
              <span>Keys</span><span className="text-foreground">{Object.keys(keys[sel] ?? {}).length}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1">
              <Btn onClick={() => insertKey()}>◆ Insert Key</Btn>
              <Btn onClick={() => setKeys((k) => { const n = { ...k, [sel]: { ...(k[sel] ?? {}) } }; delete n[sel]![frame]; return n; })}>Delete Key</Btn>
              <Btn onClick={() => setRot(sel, 0)}>Reset Bone</Btn>
              <Btn onClick={() => BONES.forEach((b) => b.length && insertKey(b.id))}>Key All</Btn>
            </div>
          </Section>
          <Section title="Scene">
            <div className="flex flex-col gap-1">
              <div className="flex gap-[10px]">
                <Btn onClick={() => { setKeys(DEMO); setOverride({}); setFrame(0); setPlaying(true); }}>Load Walk</Btn>
                <Btn onClick={() => { setKeys(JUMP); setOverride({}); setFrame(0); setPlaying(true); }}>Load Jump</Btn>
              </div>
              <div className="flex gap-[10px]">
                <Btn onClick={() => { setKeys(DEMO); setOverride({}); setFrame(0); setPlaying(true); }}>Walk Anim</Btn>
                <Btn onClick={() => { setKeys(JUMP); setOverride({}); setFrame(0); setPlaying(true); }}>Jump Anim</Btn>
              </div>
              <div className="flex gap-[10px]">
                <Btn onClick={() => { setKeys({}); setOverride({}); setFrame(0); setPlaying(false); }}>Clear Anim</Btn>
                <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (open) { setAnimationName(""); setPlaying(false); } }}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" size="sm" className="h-auto rounded-sm px-2 py-1 text-xs">Create Anim</Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg bg-panel" aria-describedby={undefined}>
                    <DialogHeader>
                      <DialogTitle className="text-base tracking-normal">Create Anim</DialogTitle>
                    </DialogHeader>
                    <form className="flex flex-col gap-4" onSubmit={(event) => {
                      event.preventDefault();
                      const saved = createAnimationPreset(animationName, keys, override, frame);
                      if (!saved) return;
                      setCustomAnimations((animations) => [...animations, saved]);
                      setCreateOpen(false);
                    }}>
                      <div className="space-y-2">
                        <label htmlFor="animation-name" className="text-sm text-muted-foreground">Animation name</label>
                        <Input id="animation-name" value={animationName} onChange={(event) => setAnimationName(event.target.value)} autoFocus />
                      </div>
                      <div className="flex justify-end">
                        <Button type="submit" size="sm" disabled={!animationName.trim()}>Save</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              {customAnimations.map((animation, index) => (
                <Button key={index} variant="secondary" size="sm" className="h-auto min-h-6 w-full justify-start whitespace-normal break-all rounded-sm px-2 py-1 text-left text-xs" onClick={() => {
                  setKeys(createAnimationPreset(animation.name, animation.keys, {}, 0)?.keys ?? {});
                  setOverride({}); setFrame(0); setPlaying(true);
                }}>{animation.name}</Button>
              ))}
            </div>
          </Section>
        </aside>
      </div>

      {/* Timeline / dopesheet */}
      <footer className="border-t bg-panel">
        <div className="flex items-center gap-2 border-b px-3 py-1">
          <Btn onClick={() => setFrame(0)}>⏮</Btn>
          <Btn onClick={() => setPlaying((p) => !p)}>{playing ? "⏸ Pause" : "▶ Play"}</Btn>
          <Btn onClick={() => setFrame(FRAMES - 1)}>⏭</Btn>
          <span className="font-mono text-muted-foreground">Dope Sheet · 24 fps · {FRAMES} frames</span>
          <span className="ml-auto font-mono">Frame <span className="text-primary">{frame}</span></span>
        </div>
        <div className="relative h-40 overflow-y-auto">
          <Ruler frame={frame} keyed={keyedFrames} setFrame={(f) => { setOverride({}); setFrame(f); setPlaying(false); }} />
          {BONES.filter((b) => b.length).map((b) => (
            <div key={b.id} className={`flex h-5 items-center ${sel === b.id ? "bg-muted" : ""}`} onClick={() => setSel(b.id)}>
              <div className="w-28 shrink-0 truncate px-3 font-mono text-muted-foreground">{b.name}</div>
              <div className="relative h-full flex-1">
                {Object.keys(keys[b.id] ?? {}).map((f) => (
                  <span key={f} onClick={() => setFrame(+f)}
                    className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-pointer border border-border bg-key"
                    style={{ left: `${(+f / (FRAMES - 1)) * 100}%` }} />
                ))}
                <span className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${(frame / (FRAMES - 1)) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

function Skeleton({ world, sel, onDown, ghost, mesh }: {
  world: ReturnType<typeof solve>; sel: string; ghost?: boolean; mesh: boolean; onDown?: (id: string) => void;
}) {
  return (
    <g opacity={ghost ? 0.18 : 1}>
      {mesh && <CharacterSkin bones={BONES} world={world} />}
      {BONES.filter((b) => b.length).map((b) => {
        const w = world[b.id]!;
        const s = Math.min(b.width * 0.5, b.length * 0.18);
        const nx = Math.cos(rad(w.a + 90)), ny = Math.sin(rad(w.a + 90));
        const mx = w.x + Math.cos(rad(w.a)) * b.length * 0.18, my = w.y + Math.sin(rad(w.a)) * b.length * 0.18;
        const pts = `${w.x},${w.y} ${mx + nx * s},${my + ny * s} ${w.ex},${w.ey} ${mx - nx * s},${my - ny * s}`;
        const active = sel === b.id;
        return (
          <g key={b.id} onPointerDown={() => onDown?.(b.id)} className={onDown ? "cursor-grab" : ""} opacity={mesh ? (active ? 0.8 : 0.16) : 1}>
            <polygon points={pts} className={active ? "fill-primary stroke-primary-foreground" : "fill-bone stroke-border"}
              fillOpacity={active ? 0.9 : 0.75} strokeWidth={1} />
            <circle cx={w.x} cy={w.y} r={3} className={active ? "fill-primary" : "fill-bone"} />
            <circle cx={w.ex} cy={w.ey} r={2.5} className="fill-bone" />
          </g>
        );
      })}
    </g>
  );
}

function Ruler({ frame, keyed, setFrame }: { frame: number; keyed: Set<number>; setFrame: (f: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrub = (e: React.PointerEvent) => {
    if (e.buttons !== 1 && e.type !== "pointerdown") return;
    const r = ref.current!.getBoundingClientRect();
    setFrame(Math.max(0, Math.min(FRAMES - 1, Math.round(((e.clientX - r.left) / r.width) * (FRAMES - 1)))));
  };
  return (
    <div className="sticky top-0 z-10 flex h-5 bg-card">
      <div className="w-28 shrink-0" />
      <div ref={ref} className="relative flex-1 cursor-ew-resize" onPointerDown={scrub} onPointerMove={scrub}>
        {Array.from({ length: FRAMES }, (_, f) => f % 5 === 0 && (
          <span key={f} className="absolute top-0 -translate-x-1/2 font-mono text-muted-foreground" style={{ left: `${(f / (FRAMES - 1)) * 100}%` }}>
            {f}
          </span>
        ))}
        {[...keyed].map((f) => (
          <span key={f} className="absolute bottom-0 h-1 w-px bg-key" style={{ left: `${(f / (FRAMES - 1)) * 100}%` }} />
        ))}
        <span className="absolute top-0 -translate-x-1/2 rounded-sm bg-primary px-1 font-mono text-primary-foreground" style={{ left: `${(frame / (FRAMES - 1)) * 100}%` }}>
          {frame}
        </span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b">
      <h3 className="bg-card px-3 py-1 font-semibold">▾ {title}</h3>
      <div className="p-3">{children}</div>
    </section>
  );
}
function Btn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-sm bg-secondary px-2 py-1 text-secondary-foreground hover:bg-accent">{children}</button>;
}
function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => set(!on)} className={`rounded-sm px-2 py-0.5 ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
      {label}
    </button>
  );
}
