# Crystal GUI

## Overview

Crystal GUI is a desktop interface for running and interacting with the Crystal blockchain. It is built as a Tauri v2 application with a Rust backend and a React/TypeScript frontend, and it depends on the Crystal node/backend layer to function even though that layer is not contained in this repository.

The UI is responsible for presenting blockchain data and collecting user input. The backend is responsible for desktop integration, startup, persistence, and communicating with the node through Tauri-based IPC.

## Features

- First-run setup flow for configuring the app and initial node preferences.
- Wallet management for creating, importing, loading, unloading, and using wallets.
- UTXO and VM account views for balances, addresses, and transaction history.
- Mining and validator panels for PoW and staking-related workflows.
- Explorer, mempool, network, and RPC console views for inspecting node activity.
- Contract Gateway for deploying contracts, importing ABIs, and interacting with deployed contracts.
- In-app toast notifications for live feedback, with notification preferences available in settings.
- Light and dark theme support with a consistent Crystal Labs Facet visual style.

## Getting Started

### Prerequisites

- Rust toolchain
- Node.js and npm
- Tauri v2 system dependencies for your platform
- access to the companion `xtal` crate/backend during development

This repository currently depends on:

```toml
xtal = { path = ".." }
```

### Run Locally

Install dependencies:

```bash
npm install
```

Run the full desktop app in development:

```bash
npm run tauri dev
```

Build the desktop application bundle:

```bash
npm run tauri build
```

Optional verification:

```bash
cargo check
npm run build
```

## Architecture

### Frontend

The frontend lives under `src/` and is a React 18 application bundled with Vite. It renders the application shell, panels, forms, and feedback states, and it manages client-side state with Zustand.

Frontend responsibilities include:

- navigation and panel layout
- setup, wallet, mining, validator, gateway, explorer, network, console, and settings views
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

On first launch, the app walks the user through setup. After configuration is in place, the main application opens into a multi-panel desktop UI where users can move between wallet, mining, validator, gateway, explorer, network, console, and settings screens.

Typical usage includes:

- creating or loading a wallet, then sending, receiving, or reviewing activity
- monitoring node sync, peers, mempool state, and recent blockchain activity
- starting mining or managing validator stake and fruit production
- using the Gateway to load an ABI, inspect a contract, and execute read or write methods
- using settings to adjust theme, network/storage preferences, and toast behavior

### Screenshots

Screenshots coming soon.

## Notes

- The GUI cannot function without the separate `xtal` backend/library layer, which is not included directly in this repository.
- GUI configuration is stored in `~/.crystal/config.toml`.
- Node configuration is stored in `~/.crystal/config/config.json`.
- Some setup options are present in the UI but still marked as under development, including `Apple Only` shard selection and `Fast Sync`.
- Platform-specific build behavior may differ, especially around native Tauri and macOS integration.

## For Developers

If you want to contribute to Crystal GUI, see [CONTRIBUTING.md](CONTRIBUTING.md) for local workflow, repository boundaries, verification expectations, and contribution guidelines.

## License

MIT
