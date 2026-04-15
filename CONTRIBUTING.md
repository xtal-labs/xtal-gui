# Contributing to Crystal GUI

Thanks for your interest in improving Crystal GUI.

There are useful ways to contribute at every level, whether you are working on Rust, TypeScript, UX polish, documentation, or bug reports. No contribution is too small, and clear incremental improvements are valued.

This guide is meant to make contribution easier, not heavier.

## Where This Repo Fits

Crystal GUI is the desktop application layer for the Crystal ecosystem. It includes the Tauri app, the React frontend, and the native integration layer under `src-tauri/`.

Crystal GUI depends on the separate Crystal node/backend layer to function. That distinction matters when deciding where a change belongs:

- changes to UI, desktop workflows, frontend state, Tauri-facing integration, and app-level configuration belong in this repository
- changes to core node behavior, protocol logic, blockchain execution, or backend library behavior belong in the separate `xtal` layer

If a change crosses that boundary, call it out clearly in the issue or pull request.

## Ways to Contribute

You can contribute by:

- opening a GitHub issue for a bug, usability problem, or missing capability
- adding context to an existing issue, such as reproduction steps, screenshots, logs, or implementation notes
- opening a pull request with a focused change
- improving documentation when it directly supports a behavioral or developer workflow change

Please surface bugs and feature requests through GitHub issues, and submit concrete code or documentation changes through pull requests.

## Before You Start

Make sure your local environment can build and run the app.

### Prerequisites

- Rust toolchain
- Node.js and npm
- Tauri v2 system dependencies for your platform
- access to the companion `xtal` crate/backend during development

This repository currently depends on:

```toml
xtal = { path = ".." }
```

### Local Workflow

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run tauri dev
```

Build the desktop bundle:

```bash
npm run tauri build
```

Useful verification commands:

```bash
cargo check
npm run build
```

## Contribution Guidelines

Keep changes focused and easy to review.

- prefer small, targeted pull requests over broad mixed-purpose changes
- update documentation when behavior, workflow, or expectations change
- preserve the separation between the GUI layer and the separate node/backend layer
- do not move core node logic into the frontend just because the UI needs the result
- treat setup, startup, wallet, validator, and settings flows carefully because they cross important app boundaries

For UI work:

- keep the existing Crystal Labs visual language consistent
- make sure changes work in both light and dark themes
- preserve clear loading, error, and empty states
- keep toast behavior and other live feedback understandable and proportional

## Reporting Bugs And Requesting Changes

When reporting a bug or proposing a change, include as much concrete detail as you can.

Useful information includes:

- platform and environment
- what you expected to happen
- what actually happened
- clear reproduction steps
- screenshots or logs when relevant

For larger changes, opening an issue first is usually the fastest way to align on direction before implementation starts.

## Verification

Before opening a pull request, run the checks that match the area you changed.

For most code changes, start with:

```bash
cargo check
npm run build
```

Also manually validate the flows you touched. Examples:

- setup and startup behavior
- wallet create/load/send/receive flows
- mining or validator actions
- contract gateway interactions
- settings changes, including theme and toast-related behavior

If a change alters behavior, it should come with enough validation to make regressions obvious during review.

## Pull Requests

When opening a pull request:

- explain the problem being solved
- describe the approach briefly
- call out any dependency on the separate `xtal` layer
- mention the checks and manual testing you performed
- note any follow-up work that is intentionally left out

If the change is large or still taking shape, a draft pull request is preferred over surprising reviewers with a big final diff.

## Review Expectations

Reviews should help move the codebase forward and help contributors succeed.

- focus first on correctness, architecture, regressions, and missing validation
- keep feedback concrete and respectful
- treat incremental improvement as valuable even when follow-up work remains
- avoid blocking on minor polish when the main change is sound and reviewable
