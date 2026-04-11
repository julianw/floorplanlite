# FloorPlanLite — Claude Code Context

## What this project is
A web-based 2D floor plan builder for small contractors and homeowners.
Users arrange room blocks on a canvas and resize them by typing numbers.
Target: generate an accurate schematic in under 5 minutes with no learning curve.

- **Domain:** floorplanlite.com
- **Repo:** julianw/floorplanlite
- **Full blueprint:** [`plan.md`](./plan.md)
- **Task status & next steps:** [`PROGRESS.md`](./PROGRESS.md)  ← check this first

---

## Tech stack (all decisions are final)

| Concern | Choice |
|---------|--------|
| Framework | React 18 + TypeScript |
| Canvas | Konva.js + react-konva |
| State | Zustand |
| Build | Vite |
| Styling | Tailwind v4 (`@tailwindcss/vite` plugin) |
| Tests | Vitest (unit) · React Testing Library (component) · Playwright (e2e) |
| Hosting | Vercel |
| DB (Phase 3+) | Supabase |
| Payments | Stripe |

---

## Running the project

```bash
npm install       # first time only
npm run dev       # dev server → http://localhost:5173
npm test          # run unit tests (Vitest)
npm run build     # production build
```

---

## Folder structure

```
src/
├── types/index.ts                  # Room, Opening, AppState interfaces
├── engine/
│   ├── geometry.ts                 # pure math: snap, scale, area, collision
│   └── geometry.test.ts            # 12 unit tests (all passing)
├── store/
│   └── useFloorPlanStore.ts        # Zustand store — single source of truth
├── components/
│   ├── Canvas/FloorPlanCanvas.tsx  # Konva Stage: render, drag, zoom, pan
│   └── Sidebar/Sidebar.tsx         # Floor tabs, room list, properties panel
└── App.tsx                         # Layout shell (Sidebar + Canvas)
```

---

## Core conventions

**Units:** All room data (`x`, `y`, `w`, `h`) is stored in **feet**. Konva renders in pixels. Convert with `ftToPx(ft, ppf)` / `pxToFt(px, ppf)`. Default: 40 px = 1 ft.

**Snap:** All positions and sizes are quantized to 0.5 ft via `snapToGrid()`. Apply on drag-end and resize-confirm, not during live drag.

**Room fields:** Use `w`/`h` (not `width`/`height`) — matches Konva's API and the JSON schema.

**Net area formula:** `Actual_Area = (W × H) − Σ(Overlapping_Cutter_Areas)`  
Use `intersectionArea()` not full cutter area — handles partial overlaps correctly.

**Cutter relationship:** Store only `targetParent` on the cutter room. Derive `cut_by` at runtime. Never store both directions — it creates sync bugs.

**Undo/Redo:** The store keeps `past` and `future` as `Room[][]` snapshots (not full AppState). Every mutation that should be undoable calls `pushHistory(past, rooms)` before updating.

**Rename vs update:** `renameRoom(id, label)` does NOT push to history (live keystroke updates). `updateRoom(id, patch)` DOES push to history (position/size changes).

**What NOT to persist in JSON:** `modifier_pressed` (transient), `viewport_zoom` (reset on load). Only persist `show_net_area`, `active_floor`, `selected_id` in `ui_state`.

---

## Key data shape

```typescript
interface Room {
  id: string;           // crypto.randomUUID()
  label: string;
  floor: string;        // e.g. "Floor 1"
  x: number;            // feet, top-left origin
  y: number;            // feet
  w: number;            // feet (grows right)
  h: number;            // feet (grows down)
  color: string;        // hex
  isCutter: boolean;
  targetParent: string | null;
  openings: Opening[];
}
```

JSON save format version: `"1.0-MVP"` — see `plan.md` Section 6 for the full schema.

---

## Current phase & next task

See [`PROGRESS.md`](./PROGRESS.md) for the full checklist.  
**Right now:** Phase 1 in progress. Next task = **canvas inline resize** (click room → W/H input overlay appears on canvas, Tab to switch dimensions, Enter to confirm).

Phase order: 1 → MVP canvas · 2 → Collision/Boolean · 3 → Openings/PDF + launch · 4 → Pro features

---

## Branch & PR convention

- Development branch: `claude/review-floorplan-project-GLzqk`
- Always push to this branch; open a PR into `main`
- Keep `PROGRESS.md` up to date: tick `[x]` when done, update the "Next immediate task" line
