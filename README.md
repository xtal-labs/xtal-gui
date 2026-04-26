# Crystal GUI

## Overview

Crystal GUI is a desktop interface for running and interacting with the Crystal blockchain. It is built as a Tauri v2 application with a Rust backend and a React/TypeScript frontend, and it depends on the parent `xtal` node/backend layer that lives in the same workspace.

The UI is responsible for presenting blockchain data and collecting user input. The backend is responsible for desktop integration, startup, persistence, and communicating with the node through Tauri-based IPC.

## Features

- First-run setup flow for configuring the app and initial node preferences.
- Wallet management for creating, importing, loading, unloading, and using wallets.
- UTXO and VM account views for balances, addresses, and transaction history.
- Mining and validator panels for PoW and staking-related workflows.
- Block explorer, mempool viewer, network stats, and RPC console views for inspecting node activity.
- Contract Gateway for deploying contracts, importing ABIs, and interacting with deployed contracts.
- In-app toast notifications for live feedback, with notification preferences available in settings.
- Light and dark theme support with a consistent Crystal Labs Facet visual style.

## Getting Started

### Required Layout

`crystal-gui` is not a standalone Rust package. Its backend depends on the parent `xtal` crate:

```toml
xtal = { path = ".." }
```

That means the directory above `crystal-gui/` must be the `xtal` crate root.

Use this layout:

```text
xtal/
├── Cargo.toml
├── src/
├── crystal-cli/
└── crystal-gui/
```

In practice:

- place `crystal-gui/` directly inside the `xtal/` repository root
- do not place `crystal-gui/` beside `xtal/` as a sibling checkout
- do not move `crystal-gui/` out of the workspace unless you also update its Cargo dependency paths

If `crystal-gui/` is checked out somewhere else, `cargo` will fail because `..` will not contain the `xtal` crate.

### Prerequisites

- Rust stable toolchain
- Node.js and npm
- Tauri v2 system dependencies for your platform

The frontend dependencies are tracked in `package.json`, and the Rust workspace is defined by the parent `xtal/Cargo.toml`.

### Run Locally

Install dependencies:

```bash
npm install
```

Run the full desktop app in development:

```bash
npm run tauri dev
```

This starts:

- the Vite frontend dev server
- the Tauri desktop shell
- the Rust backend linked against the parent `xtal` crate

Build the desktop application bundle:

```bash
npm run tauri build
```

This builds the frontend bundle and then produces the native desktop application through Tauri.

Useful verification:

```bash
cargo check -p crystal-gui
npm run build
```

What these verify:

- `cargo check -p crystal-gui` verifies the Rust/Tauri side and the `xtal` linkage
- `npm run build` verifies the React/TypeScript frontend bundle

### Common Layout Mistakes

If you see an error about the `xtal` dependency path, check the directory structure first.

This is wrong:

```text
projects/
├── xtal/
└── crystal-gui/
```

In that layout, `crystal-gui` resolves `..` to `projects/`, not to the `xtal` crate.

This is correct:

```text
projects/
└── xtal/
    ├── Cargo.toml
    └── crystal-gui/
```

### Current Workspace Notes

In this workspace, the expected layout is already present:

```text
/Users/cm8/Desktop/xtal26/
├── Cargo.toml
└── crystal-gui/
```

The frontend build succeeds from `crystal-gui/` with:

```bash
npm run build
```

## Architecture

### Frontend

The frontend lives under `src/` and is a React 18 application bundled with Vite. It renders the application shell, panels, forms, and feedback states, and it manages client-side state with Zustand.

Frontend responsibilities include:

- navigation and panel layout
- setup, wallet, mining, validator, gateway, block explorer, network, console, and settings views
- local UI state, modals, toasts, and loading/error handling
- presenting real-time blockchain, wallet, and network data

### Backend

The backend lives under `src-tauri/` and provides the native desktop side of the application. It handles startup flow, configuration, app state, and the Tauri command surface used by the frontend.

Backend responsibilities include:

- setup-mode versus normal-mode startup behavior
- configuration loading and persistence
- wallet, mining, validator, explorer, network, RPC, and contract command handling
- communication with the Crystal node/backend layer through Tauri-based IPC

### Communication Model

The frontend and backend communicate through three main channels:

- Tauri commands for request/response actions
- Tauri events for application notifications
- a WebSocket connection to the node API for live blockchain, sync, mining, and peer updates

## Usage

On first launch, the app walks the user through setup. After configuration is in place, the main application opens into a multi-panel desktop UI where users can interact with the node and view relevant statistics.

Typical usage includes:

- creating or loading a wallet, then sending, receiving, or reviewing activity
- monitoring node sync, peers, mempool state, and recent blockchain activity
- starting mining or managing validator stake and fruit production
- using the Gateway to load an ABI, inspect a contract, and execute read or write methods
- using settings to adjust theme, network/storage preferences, and toast behavior

### Screenshots

Screenshots coming soon.

## Notes

- The GUI cannot function without the parent `xtal` backend/library layer.
- GUI configuration is stored in `~/.crystal/config.toml`.
- Node configuration is stored in `~/.crystal/config/config.json`.
- Some setup options are present in the UI but still marked as under development, including `Apple Only` shard selection and `Fast Sync`.
- Platform-specific build behavior may differ, especially around native Tauri and macOS integration.

## For Developers

If you want to contribute to Crystal GUI, see [CONTRIBUTING.md](CONTRIBUTING.md) for local workflow, repository boundaries, verification expectations, and contribution guidelines.

## License

MIT
