# Project Blueprint: FloorPlanLite — 2D Floor Plan Builder

> **Domain:** floorplanlite.com | **Repo:** julianw/floorplanlite

---

## 1. Core Vision & Strategy

**The Concept:** A web-based "Room-Block" floor plan builder prioritizing speed and numerical precision over complex CAD drafting. Users arrange rooms like blocks and resize them by typing numbers.

**The Target Audience:** Small contractors and homeowners who need to generate accurate, 2D black-and-white schematics in under 5 minutes without a learning curve.

**The Tech Stack (Decided):**
- **Frontend:** React + TypeScript (component-based state management, large ecosystem, easier to hire for)
- **Canvas Engine:** Konva.js (native Rectangle+Text grouping, drag-and-drop, transformer handles, and strong React bindings via `react-konva`)
- **State Management:** Zustand (lightweight, works well with Konva's imperative API)
- **Data Format:** A single JSON "Source of Truth" to manage state and parent-child room relationships
- **Styling:** Tailwind CSS for the sidebar/UI shell
- **Build Tool:** Vite (fast HMR, TypeScript support out of the box)

---

## 2. Development Phases

### Phase 1: The "Rigid" MVP (The Foundation)
*Goal: Create, resize, and connect basic rooms using text input.*

- **Block Creation:** Users drag a "Generic Room" (rectangle) from a sidebar onto an infinite canvas (0.5 ft snap-to-grid).
- **The "Type-to-Resize" Engine:**
  - Clicking a room activates "Right-Down" growth mode. The top-left corner `(x, y)` remains anchored.
  - A small input box appears: Typing a number updates the width; hitting `Tab` switches to height.
- **Auto-Labeling & Calculation:** Room name and calculated Net Area (`Width × Height`) stay centered inside the block.
- **Room Rename:** Double-click a room label to edit its name inline.
- **Delete Room:** `Delete` / `Backspace` key removes the selected room. Confirm dialog if the room has children.
- **Undo / Redo:** `Ctrl+Z` / `Ctrl+Y` (or `Cmd+Z` / `Cmd+Shift+Z` on macOS) with a capped history stack of 50 states. State snapshots stored as immutable JSON diffs.
- **Pan & Zoom:** Middle-mouse drag to pan; scroll-wheel to zoom (10%–400%). On touch devices: two-finger pinch-to-zoom and one-finger pan.
- **Simple Export:** A "Snapshot" button to download the canvas as a clean PNG (canvas clipped to content bounds).
- **Local Save (JSON):** "Save" button exports the JSON source file to the user's machine; "Open" imports it back. No account needed.

### Phase 2: The "Boolean & Conflict" System (The Engine)
*Goal: Handle complex shapes (L-shapes) and room intersections cleanly.*

- **Collision Detection:** Implement Axis-Aligned Bounding Box (AABB) checks. If a resized/dragged room overlaps another, the intersection glows transparent red (a "Soft Collision").
- **The "Cutter" Toggle:** A room (e.g., a closet) can be marked as a "Cutter." When placed over a standard room, its area is automatically subtracted from the parent room's Net Area calculation.
- **Modifier Hotkeys (Smart Drag):**
  - `Shift + Drag`: "Stamp Mode" — automatically sets the dragged room as a Cutter and resolves the conflict on release.
  - `Alt + Drag`: "Sticky Push" — pushes adjacent rooms out of the way instead of overlapping.
- **Conflict Menu:** Clicking a red overlap opens a 3-button pop-up: `[Cut]`, `[Merge]`, or `[Layer]`.
- **Multi-Select:** `Shift + Click` or rubber-band drag to select multiple rooms; move/delete as a group.

### Phase 3: Openings & Verticals (The Contractor Utility)
*Goal: Make the 2D plan functional for a walkthrough and estimating.*

- **Wall "Punching":** Drag a "Door" or "Window" block onto a wall. It snaps to the perimeter and maintains its relative position even if the room is resized.
- **Floor Management:** Simple UI tabs for "Basement," "Floor 1," "Floor 2."
- **Overlay Mode ("Ghosting"):** When viewing Level 2, display a 50% opacity outline of Level 1 to easily align load-bearing walls and plumbing stacks.
- **PDF Export:** Export the plan to architectural scale (e.g., 1/4" = 1') with a measurement legend and linear foot totals (crucial for drywall/paint estimates).
- **Measurements Display:** Toggle on/off dimension labels (width/height) on each room's edges.

### Phase 4: Pro Export & Polish (Monetization & Scaling)
*Goal: Add professional polish to turn the tool into a viable side-project revenue stream.*

- **Asset Library:** Draggable fixtures (toilets, sinks, stoves, stairs) that magnetize/snap to walls.
- **Wall Thickness Toggle:** Switch between "Thin Draft Lines" and "Thick Architectural Walls."
- **White-Labeling:** Allow users to add their company logo to exported PDFs.
- **Cloud Save (Gated):** Paid users get cloud-hosted project storage (auto-save, shareable links). Free users remain on local JSON export.
- **Version History:** For paid users — named snapshots with restore capability.

---

## 3. Mathematical Constraints & Engine Logic

### 3.1 The Anchor & Growth Logic
- Origin is always `(x, y)` (top-left corner).
- Only `width` and `height` change on user input.
- *Rule:* "Don't move points, move planes."

### 3.2 Collision Detection (AABB)

```typescript
const isOverlapping = (rectA: Rect, rectB: Rect): boolean => {
  return (
    rectA.x < rectB.x + rectB.w &&
    rectA.x + rectA.w > rectB.x &&
    rectA.y < rectB.y + rectB.h &&
    rectA.y + rectA.h > rectB.y
  );
};
```

### 3.3 Snap-to-Grid

All `x`, `y`, `width`, and `height` values are quantized to the nearest grid unit (0.5 ft):

```typescript
const GRID_FT = 0.5; // feet per grid cell

const snapToGrid = (value: number): number =>
  Math.round(value / GRID_FT) * GRID_FT;
```

### 3.4 Pixel ↔ Feet Scale Conversion

The canvas renders at a configurable pixels-per-foot ratio (`PPF`). Default: 40 px = 1 ft.

```typescript
const PPF = 40; // pixels per foot

const ftToPx = (ft: number): number => ft * PPF;
const pxToFt = (px: number): number => px / PPF;
```

All internal state is stored in **feet**; Konva renders in pixels. Zoom adjusts the Konva `Stage` scale without changing the stored ft values.

### 3.5 Net Area Calculation with Cutters

```typescript
interface Room {
  id: string;
  name: string;
  x: number;       // feet
  y: number;       // feet
  width: number;   // feet
  height: number;  // feet
  isCutter: boolean;
  parentId: string | null;
}

const computeNetArea = (room: Room, allRooms: Room[]): number => {
  const gross = room.width * room.height;
  const cutters = allRooms.filter(
    (r) => r.isCutter && r.parentId === room.id
  );
  const cutArea = cutters.reduce((sum, c) => sum + c.width * c.height, 0);
  return gross - cutArea;
};
```

### 3.6 Wall-Snap for Doors & Windows

An opening block (door/window) snaps to the nearest wall edge of its parent room. The snap logic finds which of the four edges is closest to the opening's center and locks it there:

```typescript
type Edge = 'top' | 'right' | 'bottom' | 'left';

const snapToEdge = (opening: Rect, parent: Room): { edge: Edge; offset: number } => {
  const cx = opening.x + opening.w / 2;
  const cy = opening.y + opening.h / 2;

  const distances = {
    top:    Math.abs(cy - parent.y),
    bottom: Math.abs(cy - (parent.y + parent.height)),
    left:   Math.abs(cx - parent.x),
    right:  Math.abs(cx - (parent.x + parent.width)),
  };

  const edge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0] as Edge;
  const offset = edge === 'top' || edge === 'bottom'
    ? cx - parent.x   // distance from left wall
    : cy - parent.y;  // distance from top wall

  return { edge, offset };
};
```

`offset` is stored in feet so openings stay correctly positioned when the parent room is resized.

### 3.7 Undo / Redo Stack

State snapshots use a simple command stack. Each user action pushes a full state clone (using `structuredClone`) onto the history array:

```typescript
const MAX_HISTORY = 50;

interface HistoryStore {
  past: AppState[];
  future: AppState[];
  push: (state: AppState) => void;
  undo: () => AppState | undefined;
  redo: () => AppState | undefined;
}
```

---

## 4. Business Model & Monetization

| Tier        | Price          | Features |
|-------------|----------------|----------|
| **Free**    | $0 / forever   | Up to 3 saved projects (local JSON), PNG export, unlimited rooms |
| **Pro**     | $9 / month or $79 / year | Unlimited cloud projects, PDF export (scaled), multi-floor, asset library, white-label PDF logo |
| **Team**    | $29 / month (up to 5 seats) | Everything in Pro + shared project workspace, version history |

**Revenue Path:**
- Launch Free + Pro tiers at Phase 3 completion.
- Offer a **14-day Pro trial** with no credit card required.
- Annual billing discount drives LTV.
- Payment processor: **Stripe** (subscriptions + customer portal).

**Pricing Strategy:** Undercut Planner 5D ($14.99/mo) and RoomSketcher ($49/mo) significantly. Position as "fast & precise for contractors" rather than "pretty for homeowners."

---

## 5. Deployment & Infrastructure

| Concern         | Solution |
|-----------------|----------|
| **Hosting**     | Vercel (free tier covers MVP; zero-config React/Vite deploys) |
| **Domain**      | floorplanlite.com → Vercel nameservers |
| **CDN**         | Vercel Edge Network (global, included) |
| **Analytics**   | Plausible Analytics (privacy-first, GDPR-compliant, $9/mo) |
| **Error Tracking** | Sentry (free tier, React integration) |
| **CI/CD**       | GitHub Actions → Vercel auto-deploy on merge to `main` |

**Environments:**
- `main` branch → `floorplanlite.com` (production)
- `dev` branch → `dev.floorplanlite.com` (staging preview)
- PR branches → Vercel preview URLs (automatic)

---

## 6. Data & Persistence Roadmap

| Phase | Storage Model | Notes |
|-------|--------------|-------|
| Phase 1–2 | Browser `localStorage` + JSON file export | No backend needed |
| Phase 3 | Add Supabase (Postgres + Auth) for paid cloud save | Row-level security per user |
| Phase 4 | Supabase Storage for PDF blobs; version history table | Keep JSON as portable backup format |

**JSON Schema (v1):**
```json
{
  "version": 1,
  "meta": { "name": "My House", "createdAt": "ISO8601", "updatedAt": "ISO8601" },
  "settings": { "ppf": 40, "gridFt": 0.5, "floors": ["Basement", "Floor 1"] },
  "rooms": [
    {
      "id": "uuid",
      "name": "Living Room",
      "floor": "Floor 1",
      "x": 0, "y": 0, "width": 20, "height": 15,
      "isCutter": false, "parentId": null,
      "openings": [{ "id": "uuid", "type": "door", "edge": "left", "offset": 3, "width": 3 }]
    }
  ]
}
```

---

## 7. Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|----------------|
| Unit (engine logic) | Vitest | Collision, snap, area math — 90%+ |
| Component | React Testing Library | Sidebar interactions, input resize |
| E2E (golden paths) | Playwright | Create room → resize → export PNG |

**Critical test cases for Phase 1:**
- Snap-to-grid quantizes correctly at boundaries
- Undo/redo restores exact state
- Net area updates instantly on resize
- PNG export captures all rooms within bounds

---

## 8. Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Delete` / `Backspace` | Delete selected room |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo |
| `Ctrl+A` | Select all rooms |
| `Escape` | Deselect / close menu |
| `Tab` | (in resize input) Switch width → height |
| `Enter` | Confirm resize or rename |
| `Shift+Drag` | Stamp Mode (set as Cutter on drop) |
| `Alt+Drag` | Sticky Push (push adjacent rooms) |
| `Space+Drag` | Pan canvas |
| `Ctrl+Scroll` | Zoom in/out |
| `Ctrl+0` | Reset zoom to 100% |
| `Ctrl+Shift+F` | Fit all rooms to screen |
| `Ctrl+S` | Save / export JSON |
| `Ctrl+O` | Open JSON file |
| `Ctrl+E` | Export PNG |

---

## 9. Open Questions & Decisions Log

| Question | Decision | Date |
|----------|----------|------|
| React vs Vue? | **React** (TypeScript ecosystem, react-konva) | — |
| Konva.js vs Fabric.js? | **Konva.js** (better performance for many shapes, native grouping) | — |
| State manager? | **Zustand** (minimal boilerplate, works with Konva) | — |
| Auth provider? | **Supabase Auth** (when cloud save is added in Phase 3) | — |
| Mobile support? | Desktop-first MVP; tablet (landscape) in Phase 3 | — |
| Accessibility? | Keyboard-navigable sidebar; canvas interactions are pointer-only for MVP | — |
