# FloorPlanLite — Progress Tracker

> Update this file as tasks are completed. It is the single source of truth for
> project status. For the full feature spec and architecture, see [`plan.md`](./plan.md).

---

## Current Status

**Active phase:** Phase 1 — The "Rigid" MVP  
**Next immediate task:** Fit-to-screen (`Ctrl+Shift+F`) and reset zoom (`Ctrl+0`)

---

## Phase 0 — Planning & Setup ✅

- [x] Write project blueprint (`plan.md`)
- [x] Decide tech stack: React + TypeScript + Konva.js + Zustand + Vite + Tailwind v4
- [x] Define Room type, JSON schema v1.0-MVP
- [x] Define net area formula: `Actual_Area = (W × H) − Σ(Overlapping_Cutter_Areas)`
- [x] Register domain: floorplanlite.com
- [x] Add business model, deployment plan, testing strategy to blueprint

---

## Phase 1 — The "Rigid" MVP 🚧 In Progress

### Infrastructure
- [x] Vite + React + TypeScript project scaffold
- [x] Tailwind v4 configured
- [x] Zustand store wired up
- [x] `.gitignore`, `tsconfig`, `package.json`

### Engine
- [x] `snapToGrid()` — quantize to 0.5 ft grid
- [x] `ftToPx()` / `pxToFt()` — coordinate conversion
- [x] `intersectionArea()` — partial overlap calculation
- [x] `computeNetArea()` — gross area minus cutter intersections
- [x] `isOverlapping()` — AABB collision check
- [x] Unit tests for all engine functions (12/12 passing)

### Canvas
- [x] Konva Stage renders rooms as Rect + Text groups
- [x] Scroll-to-zoom (10%–400%)
- [x] Space + drag to pan
- [x] Room drag with snap-to-grid on release
- [x] Room selection (click) / deselect (click canvas or Esc)
- [x] **Canvas inline resize** — click room → input overlay for W/H (Tab to switch)
- [x] Double-click label to rename inline on canvas
- [ ] Fit-to-screen (`Ctrl+Shift+F`)
- [ ] Reset zoom to 100% (`Ctrl+0`)
- [ ] PNG export (`Ctrl+E` / Snapshot button)

### Sidebar & UI
- [x] Floor tabs (Basement / Floor 1 / Floor 2)
- [x] Room list with colour swatch
- [x] Properties panel: label input, W/H inputs, net area display
- [x] Delete button in properties panel
- [x] Undo / Redo buttons
- [x] Save JSON / Open JSON (local file)
- [ ] Show/hide net area toggle
- [ ] Room colour picker

### Keyboard Shortcuts
- [x] `Delete` / `Backspace` — delete selected room
- [x] `Ctrl+Z` / `Cmd+Z` — undo
- [x] `Ctrl+Y` / `Cmd+Shift+Z` — redo
- [x] `Escape` — deselect
- [x] `Space + Drag` — pan canvas
- [x] `Tab` — switch W → H in resize input
- [x] `Enter` — confirm resize / rename
- [ ] `Ctrl+S` — save JSON
- [ ] `Ctrl+O` — open JSON
- [ ] `Ctrl+E` — export PNG
- [ ] `Ctrl+0` — reset zoom
- [ ] `Ctrl+Shift+F` — fit to screen

---

## Phase 2 — Boolean & Conflict System ⏳ Not Started

- [ ] Collision detection: red glow on overlapping rooms
- [ ] "Cutter" toggle on a room
- [ ] Cutter subtracts from parent net area (engine already supports this)
- [ ] `Shift + Drag` — Stamp Mode (auto-set as Cutter on drop)
- [ ] `Alt + Drag` — Sticky Push (push adjacent rooms)
- [ ] Conflict menu popup: [Cut] [Merge] [Layer]
- [ ] Multi-select (`Shift+Click`, rubber-band drag)

---

## Phase 3 — Openings & Verticals ⏳ Not Started

- [ ] Door / Window blocks that snap to wall perimeter
- [ ] Opening position stored as edge + offset (survives room resize)
- [ ] Multi-floor management (already has tab UI)
- [ ] Overlay / Ghosting mode (50% opacity of floor below)
- [ ] Dimension labels toggle (show W/H on room edges)
- [ ] PDF export at architectural scale (1/4" = 1')
- [ ] Linear foot totals in PDF (drywall/paint estimates)
- [ ] **Launch Free + Pro tiers** (Stripe integration)

---

## Phase 4 — Pro Export & Polish ⏳ Not Started

- [ ] Asset library: fixtures (toilets, sinks, stoves, stairs)
- [ ] Wall magnetization/snap for fixtures
- [ ] Wall thickness toggle (draft lines ↔ architectural walls)
- [ ] White-label logo on PDF export
- [ ] Cloud save (Supabase) for Pro users
- [ ] Shareable project links
- [ ] Version history (named snapshots)

---

## Infrastructure & Ops ⏳ Not Started

- [ ] Deploy to Vercel (floorplanlite.com)
- [ ] Set up staging environment (dev.floorplanlite.com)
- [ ] GitHub Actions CI (test + build on PR)
- [ ] Plausible Analytics
- [ ] Sentry error tracking
- [ ] Supabase project + schema (when cloud save is needed in Phase 3)

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | React + TypeScript | Ecosystem, react-konva bindings |
| Canvas engine | Konva.js | Native grouping, drag-and-drop, React bindings |
| State management | Zustand | Minimal boilerplate, works with Konva |
| Build tool | Vite | Fast HMR, TypeScript out of the box |
| Styling | Tailwind v4 | Utility-first, Vite plugin |
| Testing | Vitest + RTL + Playwright | Vitest is Vite-native |
| Data storage (MVP) | localStorage + JSON file export | No backend needed for Phase 1–2 |
| Data storage (Phase 3+) | Supabase (Postgres + Auth) | Row-level security, hosted |
| Payments | Stripe | Subscriptions + customer portal |
| Hosting | Vercel | Zero-config React/Vite, free tier |
| Analytics | Plausible | Privacy-first, GDPR-compliant |
| `cut_by` field | Derived at runtime | Avoid bi-directional sync bugs |
| `modifier_pressed` | Not persisted | Transient runtime state |
