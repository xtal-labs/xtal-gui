# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Crystal GUI is a Tauri v2 desktop application (Rust backend + React/TypeScript frontend) providing a Bitcoin-Qt style interface for the Crystal blockchain. It embeds a full blockchain node via the `xtal` crate (parent directory).

## Build & Development Commands

```bash
# Frontend dev server (Vite on :5173)
npm run dev

# Full Tauri dev app (frontend + native window)
npm run tauri dev

# Type-check and build frontend
npm run build

# Rust build (from this directory)
cargo build

# Rust linting and formatting
cargo clippy -- -D warnings
cargo fmt

# Run Rust tests
cargo test
```

The Cargo.toml is at the repo root (not inside `src-tauri/`). The binary entry point is `src-tauri/src/main.rs`.

## Architecture

### Two-Mode Startup

The app runs in one of two modes determined at launch:

1. **Setup Mode**: No node running. Shows a setup wizard for first-run configuration (network selection, wallet creation). Uses `SetupState`.
2. **Normal Mode**: Embeds a full blockchain node in a dedicated tokio runtime thread. Uses `AppState` with access to all node services.

Config is persisted at `~/.crystal/config.toml`.

### Frontend (src/)

- **React 18 + TypeScript** with Vite bundler
- **State management**: Zustand stores, one per domain (`blockchainStore`, `walletStore`, `miningStore`, `validatorStore`, `networkStore`, `uiStore`)
- **UI**: Radix UI primitives + Tailwind CSS + custom Crystal themes ("amethyst" dark, "celestite" light)
- **Path alias**: `@` maps to `./src`

**Communication with backend uses three channels:**
1. **Tauri Commands** (request/response): `invoke()` calls to Rust command handlers
2. **Tauri Events** (backend→frontend broadcast): `gui-event` with typed variants (WalletLoaded, IncomingTransaction, ChainReorg, etc.)
3. **WebSocket** (real-time streaming): node API port for blockchain_info, new_block, mining_stats, sync_progress, peer updates

### Backend (src-tauri/src/)

- `main.rs` — App entry, menu system, mode selection (setup vs normal)
- `state.rs` — `AppState` (node services, sync state, wallet) and `SetupState`
- `events.rs` — Event broadcaster monitoring blockchain/mempool/wallet changes
- `config.rs` — GuiConfig persistence (TOML)
- `commands/` — Tauri IPC command handlers (~70+ commands):
  - `blockchain.rs` — Chain info, blocks, sync status
  - `wallet.rs` — Wallet file ops, balances, transactions
  - `mining.rs` — Start/stop mining, stats
  - `validator.rs` — Staking, fruit production, earnings
  - `mempool.rs` — Pending transactions
  - `network.rs` — Peers, network status
  - `rpc_console.rs` — RPC method execution
  - `setup.rs` — Setup wizard commands

### Data Flow

```
Component → invoke() → Rust command handler → xtal services → JSON response
                                                    ↓
WebSocket stream ← node API          Event broadcaster → gui-event → useTauriEvent hook
       ↓                                                                    ↓
useNodeWebSocket hook                                              App.tsx listeners
       ↓                                                                    ↓
Zustand store update ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← store updates & toasts
       ↓
React re-render
```

### Crystal Blockchain Concepts

- **Stems** (🌿): Lightweight PoW blocks (~40s) — execute contracts, cache results
- **Leaves** (🍃): Heavyweight PoW blocks (~10min) — finalize state to disk
- **Fruits** (🍎🍊🍑): PoS blocks — parallel transaction sharding
- **XTAL**: Native currency (1 XTAL = 10^9 shards)
- Block summaries use a discriminated union: `BlockSummary = StemSummary | LeafSummary`

### Import Best Practices

Follow the same import rules as the parent `xtal` crate (see `../CLAUDE.md`):

- **Never use inline imports** inside function bodies — always add `use` statements at the top of the file
- Import ordering: std → external crates → `xtal::` → local `crate::`
- Prefer specific imports over globs

### Theming Protocol

The app supports two themes: **amethyst** (dark) and **celestite** (light). All UI must work correctly in both. Follow these rules to prevent theme bugs:

**Always use theme-aware color classes.** Never hardcode `text-white`, `text-black`, `bg-gray-*`, or any non-variable color for text/backgrounds. Use the CSS variable-backed Tailwind classes instead:

```tsx
// BAD — breaks on theme switch
<span className="text-white">Label</span>
<div className="bg-gray-900">...</div>

// GOOD — adapts to both themes
<span className="text-foreground">Label</span>
<div className="bg-background">...</div>
```

**Text color classes (most to least prominent):**
- `text-foreground` — primary text (near-black on light, near-white on dark)
- `text-foreground-secondary` — secondary labels
- `text-foreground-muted` — de-emphasized text
- `text-primary-foreground` — text on primary-colored backgrounds (buttons)
- `text-accent-foreground` — text on accent-colored backgrounds

**Background classes:** `bg-background`, `bg-background-secondary`, `bg-card`, `bg-card-elevated`, `bg-muted`

**Always set explicit text color on container elements** that establish a new stacking context (fixed overlays, sliding panels, portals). These elements escape the normal DOM inheritance chain:

```tsx
// Sliding panels — always include text-foreground
<div className="fixed top-0 right-0 bg-background text-foreground ...">

// Modal overlays — Card sets text-card-foreground, but be explicit on wrappers
<div className="fixed inset-0 bg-black/50 text-foreground ...">
```

**Button variants and icon colors:** The `ghost` variant uses `text-foreground`. Icons using `currentColor` (all lucide-react icons) inherit from their parent's text color. If you need an icon on a colored background, use the appropriate foreground class (`text-primary-foreground`, etc.).

**Theme is applied early.** An inline script in `index.html` reads from `localStorage('crystal-theme')` and sets the theme class on `<html>` before React mounts, preventing flash of wrong theme. The `ThemeProvider` component then syncs React state with this.

### Responsive Conventions

The app has **one minimum-width contract: 640px**, defined in a single place and mirrored across the stack. Never reintroduce competing minimums (an earlier `min-w-[800px]` vs a 480px window caused horizontal-scroll/layout-clamp bugs).

- `--app-min-width: 640px` / `--app-min-height: 480px` in `src/styles/globals.css` — the single source of truth. Full-screen shells use `min-w-[var(--app-min-width)]` / `min-h-[var(--app-min-height)]`, never hardcoded literals (`min-w-[800px]`, `min-h-[480px]`).
- `tauri.conf.json` window `minWidth: 640` / `minHeight: 480`; `src-tauri/src/main.rs` `MIN_USABLE_WINDOW_WIDTH = 640` / `MIN_USABLE_WINDOW_HEIGHT = 480` (and maximizes on displays smaller than that in either dimension, e.g. a Raspberry Pi panel). Keep all four numbers in lockstep.

Because the viewport never drops below 640, the meaningful breakpoints are stock Tailwind `md` (768) and `lg` (1024):

| Range | Tier | Sidebar | Grids |
|---|---|---|---|
| 640–767 | compact | overlay drawer (hamburger) | 1 col |
| 768–1023 | desktop | docked rail (240/64px) | 2 col |
| 1024+ | wide | docked rail | 3–4 col |

Rules:
- **Sidebar** auto-switches to an overlay drawer below `md` via `useMediaQuery("(max-width: 767px)")` in `App.tsx`; drawer state lives in `uiStore` (`mobileNavOpen`). Docked widths come from the `--sidebar-width` / `--sidebar-collapsed` CSS vars.
- **Heavy / side-by-side content** uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-N` (see `Dashboard.tsx` as the reference). Avoid static multi-col grids with no breakpoint.
- **Compact stat strips** of short values (≤3 items) may stay multi-col at all widths.
- **Side panels** (`SidePanelShell`) render at a fixed ~420–480px regardless of viewport, so their internal grids are sized by column count (cap at 3, loosen to 2 on mid widths with `grid-cols-2 lg:grid-cols-3`), **not** viewport breakpoints.

### Key Dependencies

- `xtal` (path = "..") — Core blockchain library
- `tauri` v2 — Desktop framework
- `tokio` — Async runtime
- `zustand` — Frontend state management
- `@radix-ui/*` — UI component primitives
