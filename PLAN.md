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
    * Bundled into a single JS file served by the internal local server.
    * **Join Flow:** Auto-capture `token` from URL; input Player Name; assign/reconnect player identity.
    * **Reconnect:** Store player identity in `localStorage` so refreshes can rejoin the same player.
* [ ] **Event contract (server is source of truth):**
    * Required events: `player_join`, `player_leave`, `player_update`, `initiative_prompt`, `initiative_submit`, `state_sync`, `turn_advanced`.
    * `player_leave` must fire on disconnect and explicit leave action; player is marked offline rather than deleted from combat state.
* [ ] **Initiative flow (auto-apply policy):**
    * On combat start, prompt each connected player for initiative.
    * Player submits **total initiative only** (single integer).
    * Server immediately applies each submission, re-sorts turn order, and broadcasts `state_sync` after every valid submit.
* [ ] **Combat HUD + controls:**
    * Show initiative list, full combat order, and active combatant marker during combat.
    * Use custom combatant name when present (fallback to base name).
    * Provide **End turn** button for players (active player intent routed through server).
    * Players may edit **only their own** `HP`, `Max HP`, `temp HP`, and `AC`.
* [ ] **Visibility/privacy rules:**
    * While encounter is **not running**, players only see player combatants and player status.
    * Monsters being prepared by DM must not be visible until combat starts.
* [ ] **HP obfuscation labels (player-facing combat view):**
    * Replace numeric HP for non-self combatants with status text:
      * `unscathed` (green): 100%
      * `healthy` (green): >60% and <100%
      * `hurt` (yellow): >40% and <=60%
      * `critically wounded` (red): >0% and <=40%
      * `down` (red): 0 HP with `dead=false`
      * `dead` (gray): 0 HP with `dead=true` (default fallback can be dead until explicit down-state exists)
* [ ] **Turn reminder UX:**
    * Subtle pulse/highlight when it becomes the player's turn.
    * No sound toggle and no banner/toast reminder.
* [ ] **Theme consistency with Obsidian:**
    * Extract core Obsidian CSS variables on DM side.
    * Send a minimal theme payload in `state_sync`.
    * Apply mapped CSS variables in player app so visuals match the DM vault theme.

### Phase 5 implementation checklist (concrete)
* [ ] **Add shared event/state types**
    * File: `src/network/player-events.ts` (new)
    * Define:
      * `PlayerId`, `CombatantId`
      * `PlayerPresence` (`online`/`offline`)
      * `InitiativeSubmitPayload` (`initiativeTotal: number`)
      * Event payload map:
        * `player_join`
        * `player_leave`
        * `player_update`
        * `initiative_prompt`
        * `initiative_submit`
        * `turn_advanced`
        * `state_sync`
* [ ] **Define player-facing view state and obfuscated HP model**
    * File: `src/network/player-view-state.ts` (new)
    * Define:
      * `PlayerFacingCombatant`
      * `HpStatusLabel = "unscathed" | "healthy" | "hurt" | "critically wounded" | "down" | "dead"`
      * `PlayerFacingState`
    * Export helpers:
      * `computeHpStatusLabel(current, max, deadFlag)`
      * `buildPlayerViewState(fullState, viewerPlayerId, encounterRunning)`
* [ ] **Server: websocket session + auth + event routing**
    * File: `src/network/combat-server.ts`
    * Tasks:
      * Add websocket handling with token validation.
      * Track connected players and socket-to-player mapping.
      * Emit `player_join` / `player_leave` on connect/disconnect.
      * Accept `initiative_submit` (total only), validate ownership/range.
      * Auto-apply and re-sort on valid initiative submit.
      * Broadcast `state_sync` after all mutation events.
* [ ] **Server: pre-combat filtering and combat visibility**
    * File: `src/network/combat-server.ts`
    * Tasks:
      * Use `buildPlayerViewState` for player broadcasts.
      * If `encounterRunning === false`: include only player combatants.
      * If `encounterRunning === true`: include full order with HP labels.
      * DM continues to use unfiltered/full state.
* [ ] **Server: player self-update permissions**
    * Files:
      * `src/network/combat-server.ts`
      * `src/encounter/combat-session.ts`
    * Tasks:
      * Add/update intents for `hpCurrent`, `hpMax`, `tempHp`, `ac`.
      * Enforce self-only edits for player clients.
      * Reject unauthorized combatant updates.
* [ ] **Server: turn advancement intent**
    * Files:
      * `src/network/combat-server.ts`
      * `src/encounter/combat-session.ts`
    * Tasks:
      * Add player `end_turn` intent handling.
      * Allow only active player (or configured override).
      * Emit `turn_advanced` + `state_sync`.
* [ ] **DM bridge: trigger initiative prompt on combat start**
    * File: `src/main.ts`
    * Tasks:
      * On transition into running combat, ask server to emit `initiative_prompt`.
      * Keep existing DM controls as authoritative trigger points.
* [ ] **Player app shell + join flow**
    * Files:
      * `src/player/player-app.tsx` (new)
      * `src/player/player-join.tsx` (new)
      * `src/player/player-socket.ts` (new)
    * Tasks:
      * Parse `token` from URL.
      * Prompt for player name.
      * Persist/reuse player identity in `localStorage`.
      * Send `player_join`, handle reconnects.
* [ ] **Player combat HUD + controls**
    * Files:
      * `src/player/player-combat-view.tsx` (new)
      * `src/player/player.css` (new)
    * Tasks:
      * Render order + active marker + initiative values.
      * Show name/custom name policy.
      * Render obfuscated HP labels for others.
      * Render editable self fields (HP/max/temp/AC).
      * Add `End turn` button.
      * Add active-turn pulse class only (no audio/banner).
* [ ] **Theme sync (Obsidian -> player UI)**
    * Files:
      * `src/main.ts`
      * `src/network/combat-server.ts`
      * `src/player/player.css`
    * Tasks:
      * Capture selected Obsidian CSS vars in DM runtime.
      * Include theme payload in player `state_sync`.
      * Map to player CSS custom props.
* [ ] **Acceptance checks**
    * File: `PLAN.md` (this checklist)
    * Validate:
      * Joining works from invite link token.
      * `player_leave` fires and updates presence.
      * Initiative totals reorder immediately (auto-apply).
      * Monsters hidden pre-combat for players.
      * End turn and self-updates enforce permissions.
      * HP labels and pulse reminder behavior are correct.

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
