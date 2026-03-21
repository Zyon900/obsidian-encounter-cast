# EncounterCast: D&D Encounter Manager Plugin Plan

## 1. Project Architecture & Stack
* **Host:** Obsidian (Electron/Node.js).
* **UI Framework:** **Preact** (High performance, small footprint).
* **Networking:** Node.js `http` + `express` + `ws` (WebSockets), bound to `0.0.0.0`.
* **Security:** Cryptographically secure 32-char hex tokens (via Node `crypto`) encoded in QR codes/Invite Links.
* **Data Source:** **Fantasy Statblocks API** integration (The "Beastiarium Index").
* **Naming Logic:** Automatic "A, B, C" suffixing for duplicate monsters; support for custom NPC names via `"Quotes"`.

---

## 2. Phase 1: Foundation & Build Pipeline
* [ ] Initialize plugin boilerplate (`main.ts`).
* [ ] Configure `esbuild` for **Preact** support (JSX/TSX).
* [ ] Implement strict `onunload()` cleanup:
    * Shut down Express/WebSocket servers.
    * Unmount Preact components from the DOM.
    * Clean up all event listeners and debounce timers.
* [ ] Setup Obsidian CSS variable-based styling (e.g., `var(--background-primary)`) for theme compatibility.

---

## 3. Phase 2: The Beastiarium Index (Fantasy Statblocks Integration)
**Goal:** Create a high-performance bridge to existing monster data.
* [ ] Create `MonsterManager.ts` to interface with the `obsidian-5e-statblocks` API.
* [ ] Define stable app-level `MonsterRecord` shape:
    * Required fields: `id`, `name`, `challenge` (CR), `hp`, `ac`, `dex`, and a preview locator (`source`).
    * Optional field: `raw` for temporary adapter internals.
    * Keep dashboard/initiative/network code dependent on `MonsterRecord`, not direct Fantasy Statblocks object shapes.
* [ ] Add `MonsterManager` readiness state:
    * `ready`: API is available and cache is valid for search/use.
    * `error`: API plugin missing/unavailable/failed; store actionable error reason for UI notice/reporting.
* [ ] **Cheap Check Cache Strategy:**
    * Store a local `cachedNames` array to avoid re-mapping thousands of objects on every keystroke.
    * **Lazy load:** Build cache at startup; if startup load fails, lazily build cache on first function that needs it.
    * No automatic cache validation after load (no count/fingerprint checks).
    * Manual refresh via user command (`refresh-monster-cache`) when source data changes.
* [ ] Implement `searchMonsters(query)` using Obsidian's native `prepareFuzzySearch` for typo-tolerant, blazing-fast results.
    * Keep `searchMonsters(query)` pure and synchronous over cached data only (no async/network/plugin lookups inside search).
    * Apply hard result cap of **7** matches.
    * Debounce at caller boundaries (e.g. `EditorSuggest`), not inside `searchMonsters`.

---

## 4. Phase 3: The Editor Experience
**Goal:** Fast, frictionless encounter building directly in notes.
* [ ] **Implementation order:** parser first, renderer second, EditorSuggest third.
* [ ] **Syntax:** `[Quantity]x [Monster Name] '[Optional Custom Name]'` (e.g., `4x Goblin 'Sneaky Git'`).
    * Accept missing custom names and return per-line parse errors instead of failing the whole block.
* [ ] **On-demand parse flow:**
    * Keep encounter block content as raw text while editing.
    * Parse and resolve monster references only when user clicks **Run encounter** or **Add to encounter**.
    * If parsing fails, show line-specific errors and abort the action.
* [ ] **Live Preview Renderer:**
    * Register `MarkdownCodeBlockProcessor` for the `encounter` tag.
    * Replace text with a Preact widget showing raw block summary and action buttons (**Run encounter**, **Add to encounter**).
* [ ] **EncounterSuggest (EditorSuggest API):**
    * Detect if cursor is inside an `encounter` code block.
    * Trigger only for `Nx ` style lines (avoid plain prose).
    * Use cached `MonsterManager.searchMonsters()` results only.
* [ ] **Performance guardrails:**
    * Debounce input at suggest/render boundaries.
    * Avoid repeated API calls per keystroke/render.
    * Reuse parsed state where possible.

---

## 5. Phase 4: DM Dashboard & Secure Networking
**Goal:** A real-time control center for the DM.
* [ ] **Combat session core:**
    * Define stable `CombatState` / encounter session model before expanding the dashboard UI.
    * Convert **Run encounter** into real session creation that materializes parsed monsters into combatants.
    * Keep initiative order, HP, AC, turn state, and player-facing sync derived from the same session state.
* [ ] **DM View (ItemView + Preact):**
    * Start with a read-only session view, then add mutation controls once the combat state is stable.
    * Server Controls: Start/Stop toggle, IP display, QR Code, "Copy Invite Link".
    * Initiative Tracker: Drag-and-drop or reorderable list, HP/AC inputs, active turn marker.
    * Monster details are handled by opening Fantasy Statblocks' existing monster pane; do not implement a custom statblock pane in EncounterCast.
* [ ] **Networking & Security:**
    * Generate secure `roomToken` on server start via `crypto.randomBytes`.
    * Require token validation on all non-health HTTP/WebSocket requests before the server is considered usable.
    * Treat auth gating as part of the minimum Phase 4 server implementation, not follow-up polish.
* [ ] **DM actions:**
    * Add core turn-management and combatant update actions first: next turn, HP changes, AC edits, reorder.
    * Open monster details in Fantasy Statblocks from the selected combatant rather than embedding a duplicate renderer.

---

## 6. Phase 5: Player Experience (Mobile Web App)
**Goal:** Responsive, zero-install interface for players.
* [ ] **Single Page App (Preact):**
    * Bundled into a single JS file served by the internal Express server.
    * **Join Flow:** Auto-capture `token` from URL; input Name, Max HP, AC.
    * **Combat HUD:** Real-time turn order list broadcast from the DM.
    * **Interactive Prompts:** Modals for Initiative rolls that relay results back to the DM.
* [ ] **State Sync:** Implement WebSocket event handlers (`state_sync`, `player_update`, `prompt_init`) on top of the Phase 4 `CombatState` model.

---

## 7. Phase 6: DM Workflow Enhancements
**Goal:** Speed up DM interaction once the core combat loop and player sync are stable.
* [ ] **Context Hotkeys (Scope API):** Map `ArrowRight` (Next Turn), `D` (Damage/Heal), etc., active only when DM view is focused.
* [ ] **Add on the Fly:** `FuzzySuggestModal` (Ctrl+P) using `MonsterManager` to inject monsters into active combat.

---

## 8. Phase 7: Polish & Performance
* [ ] **Persistence:** Option to save current combat state back to note frontmatter or a JSON file.
* [ ] **Reconnection Logic:** Use `localStorage` to allow players to refresh their browsers without losing their character link.
* [ ] **Standard Compliance:** Ensure all UI notifications use the Obsidian `Notice` system.
