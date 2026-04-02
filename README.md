# Encounter Cast

Encounter Cast is an Obsidian plugin for DMs that lets you:

- write encounters in Markdown code blocks
- run and manage combat in a dedicated DM dashboard
- host a local LAN player client so players can join from their phones/devices

It is designed for an offline-first tabletop workflow inside your vault.

## Features

### Encounter code block

Use fenced `encounter` code blocks directly in notes:

```encounter
Goblin Ambush
4x Goblin
1x Bugbear 'Boss'
```

Supported line format:
- first line can be title or monster
- `<quantity>x <monster name>`
- optional custom name: `<quantity>x <monster name> 'Custom name'`
- empty custom names like `''` are ignored

What you get:

- parsed and resolved monsters from Fantasy Statblocks
- optimized input schema with fuzzy search
- unresolved monsters are clearly shown
- inline controls for quantity and adding/removing entries
- run encounter or add encounter entries to the current dashboard session
- encounter difficulty preview (based on party settings)
- Hover preview monsters by hovering over the name

### DM dashboard

The dashboard is the DM control center for active combat:

- start/stop encounter
- initiative ordering and turn progression
- set active combatant
- edit monster combat values
- context menu actions (set active, rename, duplicate, delete, kick players, damage/heal flow for monsters)
- multi-select support for batch operations
- optional dashboard keyboard shortcuts
- invite link copy and QR modal
- optional automatic statblock opening on next turn

### Player client

When the local server is running, players can join via invite link/QR and get:

- join flow with initial stats
- live state sync via server-sent events
- initiative submission flow on combat start
- current turn/combat order visibility
- personal bottom sheet for stats, damage/heal, death saves, end turn
- server shutdown and kick handling screens
- Obsidian theme colors reflected in the client UI
- HP obfuscation for monsters and other players
- Only shows custom names - hiding monster names - if in use.

## Installation

### Requirements

- Obsidian desktop (plugin is desktop-only)
- Fantasy Statblocks plugin
  - plugin id: `obsidian-5e-statblocks`
  - required for monster data and statblock rendering
- Dice Roller plugin
  - plugin id: `obsidian-dice-roller`
  - used for rolling monster HP from formulas
  - used when pre-rolling dice in opened statblocks

### BRAT

1. Install and enable BRAT in your vault.
2. In BRAT, choose **Add beta plugin**.
3. Enter this repository URL:
   - `https://github.com/Zyon900/obsidian-encounter-cast`
4. Select the latest tagged release and install.

## Networking disclaimer

Encounter Cast starts a local HTTP server bound to `0.0.0.0` when you click Start server in the dashboard.

Important notes:

- The server is intended for trusted local networks (LAN).
- Transport is HTTP (no TLS).
- Access is gated by a room token in the invite link (query token or bearer token).
- The plugin exposes only its combat/player API endpoints and static player client assets.
- It does not expose arbitrary filesystem access.
- Players can only interact through defined endpoints (join, leave, initiative, update self stats, death saves, end turn, stream/state reads).
- If your network is untrusted, do not run the server.

Current endpoint surface (token-protected):

- `GET /`
- `GET /api/session`
- `GET /api/invite-qr`
- `GET /api/player/state`
- `GET /api/player/stream`
- `POST /api/player/join`
- `POST /api/player/leave`
- `POST /api/player/initiative`
- `POST /api/player/update`
- `POST /api/player/death-saves`
- `POST /api/player/end-turn`

## Development

### Local test vault sync

To auto-copy build outputs into your test vault plugin folder, create a local `.env` file in the repo root:

```bash
OBSIDIAN_PLUGINS_DIR="C:\\dev\\repos\\your-vault\\.obsidian\\plugins"
```

Notes:

- The plugin id folder is appended automatically (`obsidian-encounter-cast`).
- `.env` is gitignored in this repo.

```bash
bun install
bun run dev
```

### Production builds

Production build:

```bash
bun run build
```

Lint:

```bash
bun run lint
```

### Trigger a release

Releases are created by the GitHub Actions workflow when you push a tag.

1. Bump the version in both files:
   - `manifest.json` (`"version"`)
   - `versions.json` (add/update the matching version key)
2. Commit your changes.
3. Create a tag that exactly matches `manifest.json` version (no `v` prefix).
4. Push branch and tag.

Example for `0.1.3`:

```bash
git add -A
git commit -m "release 0.1.3"
git tag 0.1.3
git push
git push origin 0.1.3
```

## Acknowledgments

- Fantasy Statblocks plugin: https://github.com/javalent/fantasy-statblocks
- Dice Roller plugin: https://github.com/valentine195/obsidian-dice-roller

## Support
- Buy me a coffee: https://buymeacoffee.com/zyon900
