# Crystal GUI — Code Quality Review

**Date:** 2026-06-05
**Scope:** Whole application, from the root. Lens: **resilience + idiomatic construction**
(error/panic handling, lock poisoning, silent failures, type-safety, idiomatic
Rust/React/TS). Structural refactors and tooling/CI gaps are out of scope for this pass —
see the appendix.
**Status:** Findings report only. No code was modified.

Every `file:line` below was opened and confirmed against source. Several items flagged by
an initial automated sweep were **dropped as false positives** after reading the guards
around them — those are listed at the end so the next pass doesn't re-chase them.

---

## Executive summary

The codebase is in good shape. Error handling is overwhelmingly idiomatic: backend
commands consistently return `Result<T, String>` with `.map_err`/`.ok_or`, locking uses
the defensive `if let Ok(guard) = lock()` pattern almost everywhere, and the frontend runs
under full TypeScript `strict` mode. The WebSocket layer (`useNodeWebSocket`) is genuinely
well-built (backoff, jitter, visibility-aware reconnect, clean teardown).

The findings that matter cluster in two places:

1. **A startup hang path (High).** Failures inside the embedded node thread can `panic`
   instead of reporting through the GUI's error channel, leaving the loading screen
   waiting forever.
2. **Inconsistent async error handling at the edges (Medium).** A few `invoke()` calls
   are either uncaught (unhandled rejection) or swallowed with an empty `.catch`, so a
   backend failure silently leaves stale/empty UI state.

Everything else is Low: a handful of idiom nits (`unwrap()` after an `is_some()` guard
that would read better as `if let Some`), theme-correctness violations, and a couple of
deliberate type escape-hatches at the IPC boundary.

| Severity | Count | Theme |
|---|---|---|
| High | 1 | Node-thread panic → GUI hang |
| Medium | 4 | Poison/fallback panics, silent async failures, IPC type-safety |
| Low | 4 | Guarded-unwrap idiom, theme violations, non-null asserts, static-mutex unwrap |

---

## Backend (Rust) — `src-tauri/src/`

### HIGH

#### H1 — Node-thread panics bypass the GUI error channel → indefinite hang
`main.rs:977`, `main.rs:681` (and the whole `rt.block_on` body)

The node runs on a dedicated `crystal-node` thread. The GUI main thread drives the loading
screen by waiting on three `std::sync::mpsc` channels (`services_rx`, `error_rx`,
`progress_rx`). Every *expected* failure inside the thread is funneled to the user via
`error_tx.send(msg)` and a clean `return` (e.g. `main.rs:987-994`, the `DirectoryConfig`
path).

But two failure points `panic` instead of sending:

```rust
// main.rs:977 — inside the spawned thread
let rt = Runtime::new().expect("Failed to create tokio runtime for node");
// main.rs:681 — after "node ready", still on the node thread
let sync_rx = services.subscribe_sync_state()
    .expect("Sync state must be available for GUI");
```

When either `expect` fires, the thread unwinds and dies. Nothing is sent on `error_tx` or
`services_tx`, so the main thread's loading screen has no error to show and no services to
proceed with — it **hangs indefinitely** with a spinner. This is the worst failure mode
for a desktop app: no crash, no message, no recovery.

**Why it matters:** resilience. The entire startup state machine is built around
"report failures through `error_tx`," and these two paths silently violate that contract.
`Runtime::new()` realistically fails under FD/thread-resource exhaustion;
`subscribe_sync_state()` is an invariant today but is exactly the kind of `expect` that
turns into a hang if an upstream `xtal` change ever makes it fallible.

**Direction (no fix yet):** ensure the thread can never die without first sending on
`error_tx` — e.g. convert these `expect`s into the same `match { Err => { error_tx.send;
return } }` shape used elsewhere, and/or wrap the thread body so a panic is caught and
translated into a `StartupErrorInfo`. Optionally have the main thread also treat
"`JoinHandle` finished without sending services" as an error.

### MEDIUM

#### M1 — ABI-cache fallback panics during `AppState` construction
`state.rs:96`

```rust
AbiCache::open(&std::env::temp_dir()).expect("temp dir must work")
```

The ABI cache is designed to degrade gracefully (primary dir → temp dir fallback). But the
fallback itself uses `.expect`, so if opening a cache in the temp dir fails, `AppState`
construction panics instead of continuing with a degraded/disabled cache. A non-critical
feature (ABI caching) can take down node startup.

**Direction:** make the final fallback non-fatal (log + run without a persistent ABI
cache) rather than `expect`.

#### M2 — `snapshot()` is the one non-defensive lock access in `state.rs`
`state.rs:274`

```rust
pub fn snapshot(&self) -> StartupStatusInner {
    self.0.read().unwrap().clone()
}
```

Every writer in this same file uses `if let Ok(mut inner) = self.0.write()` (e.g.
`set_progress` `:226`, `set_ready` `:248`, `set_failed` `:261`) specifically to survive a
poisoned lock. `snapshot()` breaks that pattern and `unwrap()`s, so a single poisoned
`RwLock` turns every subsequent status read into a panic — and status reads drive the
loading UI, so this compounds H1.

**Why it matters:** idiomatic consistency + resilience. Today the write closures only do
infallible field assignments so poison is unlikely, but the asymmetry is a latent footgun.

**Direction:** return a sensible default (or `Option`) on a poisoned/err lock, matching
the file's existing style.

### LOW

#### L1 — `unwrap()` immediately after an `is_some()` guard (idiom)
`blockchain.rs:630`, `wallet.rs:3025`

```rust
if tx_type_has_maturity(&tx_type) && leaf_height_opt.is_some() {
    let creation_height = leaf_height_opt.unwrap();   // safe today
```

These are **correct** — the `is_some()` guard makes them panic-free — so this is purely an
idiom note: `if let Some(creation_height) = leaf_height_opt { ... }` expresses the same
thing without an `unwrap` that a future edit to the guard could silently invalidate. Same
shape with the length-guarded slice at `tx_detail_utils.rs:221`
(`if cc_tx.data.len() >= 66 { ...data[32..64].try_into().unwrap() }`).

#### L2 — `static Mutex` unwraps in platform code
`platform.rs:25`, `platform.rs:65`

```rust
let mut guard = MINING_ACTIVITY.lock().unwrap();
```

Low risk (the guarded critical sections only `take`/assign an `Option` and can't panic, so
poison is effectively impossible), but for consistency with the rest of the backend an
`if let Ok(mut guard) = ...` would remove the last few `.lock().unwrap()`s outside test/
debug code.

---

## Frontend (React / TypeScript) — `src/`

### MEDIUM

#### M3 — Inconsistent async error handling on `invoke()` calls
`VmSendModal.tsx:53` (uncaught), `Mining.tsx:71-79` (swallowed)

Three patterns coexist for the same operation (fetch-config-on-mount):

```ts
// VmSendModal.tsx:53 — NO .catch → genuine unhandled rejection, gasConfig stays null
tauriCommand<GasConfig>("get_gas_config").then(setGasConfig);

// Mining.tsx:71 — empty .catch → error swallowed, no user feedback, state stays stale
tauriCommand<MiningStatus>("get_mining_status").then(setStatus).catch(() => {});

// MempoolTransactionDetailPanel.tsx:260 — the GOOD pattern: catch + cancelled flag
tauriCommand(...).then(r => !cancelled && setDetail(r))
                 .catch(e => !cancelled && setError(String(e)));
```

In the `VmSendModal` case a rejected command (e.g. node not ready) becomes an unhandled
promise rejection and the modal silently renders with `gasConfig === null` — no error, no
retry, possibly a broken fee/gas form. The `Mining` case at least won't throw, but the
user is never told the fetch failed.

**Why it matters:** resilience + idiomatic consistency. The project already has a
`useTauriCommand` hook that standardizes `{ data, error, isLoading }`; the ad-hoc `.then`
loaders bypass it.

**Direction:** standardize config-on-mount loaders on `useTauriCommand` (or at least a
`.catch` that surfaces a toast / sets a fallback), using the Mempool panel as the
reference pattern.

#### M4 — Type-safety escape hatches at the IPC / event boundary
`App.tsx` (~40 `as` casts in the WS dispatch; `window as any` ×16 at `:1046-1107`)

WebSocket messages and the native-menu callback bridge are typed with `as` casts and
`(window as any).openWalletCreate = …`. These are deliberate boundary escape hatches
(untyped JSON in; menu IPC out) and are isolated, but they defeat `strict` mode exactly
where malformed/renamed payloads would otherwise be caught at compile time.

**Direction (optional, boundary hardening):**
- Replace the `window as any` bridge with a `declare global { interface Window { … } }`
  augmentation so the callbacks are typed in one place.
- Model WS messages as a discriminated union + a single narrowing function, removing the
  per-branch `as` casts.

### LOW

#### L3 — Hardcoded non-theme colors (theme-correctness)
`FruitCard.tsx:286,294,296,302,304,313,324,333,339…` plus SetupWizard steps
(`ImportPasswordStep.tsx`, `CompleteStep.tsx`, `NodeTypeStep.tsx`) — 24 hardcoded
occurrences across `.tsx`.

`FruitCard` uses translucent `text-white/90`, `text-white/50`, `text-white/80`,
`border-white/[0.08]`. Per the theming protocol in `CLAUDE.md` these must be theme-aware
classes — on the **celestite (light)** theme white-on-light renders near-invisible.

**Direction:** swap to `text-foreground` / `text-foreground-secondary` /
`text-foreground-muted` / `border-border` and verify against both themes. (Mechanical;
good candidate for the first follow-up fix pass.)

#### L4 — Non-null assertions (`!`) — mostly safe, idiom only
`toast.tsx:46,60`, `useContractDashboard.ts:56-108`, `Mempool.tsx:128`, others

Spot-checked the heaviest users and they are **guarded**: `toast.fruitType!` is gated by
`isFruitToast = toast.type === "fruit" && toast.fruitType` (`toast.tsx:41`), and
`m.returns!.*` is gated by the `&& m.returns` filter that builds `dashboardMethods`
(`useContractDashboard.ts:45`). So these are safe today; a typed guard/predicate (e.g. a
type guard that narrows `returns` to non-optional) would let the `!`s go away. `main.tsx:7`
`getElementById('root')!` is the conventional React-root assertion — leave it.

---

## What's already done well (acknowledged)

- **Defensive locking** via `if let Ok(guard) = lock()` across `state.rs` and the
  `abi_cache.lock()` sites in `contract.rs`.
- **Uniform command error contract:** `Result<T, String>` with explicit `.map_err`
  throughout `commands/`.
- **`useNodeWebSocket`** — exponential backoff + jitter, visibility-aware reconnect, and
  correct ref/listener cleanup.
- **`MempoolTransactionDetailPanel`** — the model async pattern (`.catch` + `cancelled`
  cleanup flag); worth replicating elsewhere (see M3).
- **TypeScript `strict` mode** fully enabled (`noUnusedLocals/Parameters`,
  `noFallthroughCasesInSwitch`, `isolatedModules`).
- **Secret hygiene:** `zeroize` on sensitive backend types; **accessibility:**
  `prefers-reduced-motion` honored in `globals.css`.

---

## False positives filtered out (do not re-chase)

These were flagged by automated grep/exploration but are **correct** on inspection:

- `tx_detail_utils.rs:221` slice `try_into().unwrap()` — guarded by `if data.len() >= 66`.
- `blockchain.rs:630`, `wallet.rs:3025` `unwrap()` — guarded by preceding `is_some()`.
- `ipfs.rs:306,350`, `wallet.rs:4870-5096`, `contract.rs:738`, `config.rs:269` `unwrap`/
  `expect` — all inside `#[test]` / `#[cfg(test)]` modules.
- `Mining.tsx:72-79` — has `.catch(() => {})` (swallow, not an unhandled rejection; noted
  under M3, not a separate bug).
- `MempoolTransactionDetailPanel.tsx:264` — has a proper `.catch` + `cancelled` flag (it's
  the *good* example).
- `toast.tsx:46/60`, `useContractDashboard.ts:*` non-null `!` — guarded (see L4).

---

## Prioritized shortlist (for a follow-up fix pass)

1. **H1** — make node-thread failures unhangable (route every panic/`expect` through
   `error_tx` or catch the thread body). *Highest impact.*
2. **M3** — standardize the uncaught/empty-catch `invoke()` loaders (`VmSendModal`,
   `Mining`) on `useTauriCommand` / surface errors.
3. **M1, M2** — make the ABI-cache fallback non-fatal; make `snapshot()` poison-safe.
4. **L3** — mechanical theme-class sweep in `FruitCard` + SetupWizard steps.
5. **M4, L1, L2, L4** — idiom/boundary hardening, opportunistic.

---

## Appendix — beyond this lens (not reviewed here)

The user scoped this to resilience + idiom, so the following were noted but **not**
assessed in depth; flagging only so they're on record:

- **Structural:** `commands/wallet.rs` (~5.4k LOC; `get_transaction_history` ~777 LOC) and
  `components/Wallet/Wallet.tsx` (~2.2k LOC, ~39 `useState`) / `Validator.tsx` are large
  enough to warrant decomposition; duplicated modal-transaction and fee-estimation logic
  across Send/Withdraw/VmSend modals.
- **Tooling/CI:** no ESLint/Prettier; zero frontend tests (116 `.ts(x)` files); backend
  has ~29 unit tests; CI `cargo fmt --check` is `continue-on-error: true`; no PR-level CI
  (release-only workflow).
