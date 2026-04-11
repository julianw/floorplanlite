# Project Blueprint: Snap-Sketcher 2D Floor Plan Builder

## 1. Core Vision & Strategy
**The Concept:** A web-based "Room-Block" floor plan builder prioritizing speed and numerical precision over complex CAD drafting. Users arrange rooms like blocks and resize them by typing numbers.
**The Target Audience:** Small contractors and homeowners who need to generate accurate, 2D black-and-white schematics in under 5 minutes without a learning curve.
**The Tech Stack:** * **Frontend:** React or Vue.js (for UI/Sidebar management).
* **Canvas Engine:** Konva.js or Fabric.js. This is an ideal fit for a JavaScript/TypeScript architecture, handling the "Rectangle + Text" grouping and dragging natively.
* **Data Format:** A single JSON "Source of Truth" to manage state and parent-child room relationships.

---

## 2. Development Phases

### Phase 1: The "Rigid" MVP (The Foundation)
*Goal: Create, resize, and connect basic rooms using text input.*
* **Block Creation:** Users drag a "Generic Room" (rectangle) from a sidebar onto an infinite canvas (0.5ft snap-to-grid).
* **The "Type-to-Resize" Engine:**
    * Clicking a room activates "Right-Down" growth mode. The top-left corner `(x,y)` remains anchored.
    * A small input box appears: Typing a number updates the width; hitting `Tab` switches to height.
* **Auto-Labeling & Calculation:** Room name and calculated Net Area (`Width * Height`) stay centered inside the block.
* **Simple Export:** A "Snapshot" button to download the canvas as a clean PNG.

### Phase 2: The "Boolean & Conflict" System (The Engine)
*Goal: Handle complex shapes (L-shapes) and room intersections cleanly.*
* **Collision Detection:** Implement Axis-Aligned Bounding Box (AABB) checks. If a resized/dragged room overlaps another, the intersection glows transparent red (a "Soft Collision").
* **The "Cutter" Toggle:** A room (e.g., a closet) can be marked as a "Cutter." When placed over a standard room, its area is automatically subtracted from the parent room's Net Area calculation.
* **Modifier Hotkeys (Smart Drag):**
    * `Shift + Drag`: "Stamp Mode" (Automatically sets the dragged room as a Cutter and resolves the conflict on release).
    * `Alt + Drag`: "Sticky Push" (Pushes adjacent rooms out of the way instead of overlapping).
* **Conflict Menu:** Clicking a red overlap opens a 3-button pop-up: `[Cut]`, `[Merge]`, or `[Layer]`.

### Phase 3: Openings & Verticals (The Contractor Utility)
*Goal: Make the 2D plan functional for a walkthrough and estimating.*
* **Wall "Punching":** Drag a "Door" or "Window" block onto a wall. It snaps to the perimeter and maintains its relative position even if the room is resized.
* **Floor Management:** Simple UI tabs for "Basement," "Floor 1," "Floor 2."
* **Overlay Mode ("Ghosting"):** When viewing Level 2, display a 50% opacity outline of Level 1 to easily align load-bearing walls and plumbing stacks.
* **PDF Export:** Export the plan to architectural scale (e.g., 1/4" = 1') with a measurement legend and linear foot totals (crucial for drywall/paint estimates).

### Phase 4: Pro Export & Polish (Monetization & Scaling)
*Goal: Add professional polish to turn the tool into a viable side-project revenue stream.*
* **Asset Library:** Draggable fixtures (toilets, sinks, stoves, stairs) that magnetize/snap to walls.
* **Wall Thickness Toggle:** Switch between "Thin Draft Lines" and "Thick Architectural Walls."
* **White-Labeling & Saving:** Allow users to add their company logo to exported PDFs. Enable importing/exporting of the JSON "Source of Truth" file so users can save their work locally without needing a database right away.

---

## 3. Mathematical Constraints & Engine Logic

**1. The Anchor & Growth Logic:**
* Origin is always `(x, y)`.
* Only `width` and `height` change on user input. 
* *Rule:* "Don't move points, move planes."

**2. Collision Detection (AABB):**
```javascript
const isOverlapping = (rectA, rectB) => {
  return rectA.x < rectB.x + rectB.w && 
         rectA.x + rectA.w > rectB.x &&
         rectA.y < rectB.y + rectB.h && 
         rectA.h + rectA.y > rectB.y;
}
