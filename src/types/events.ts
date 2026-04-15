/**
 * Tauri GUI Event types
 *
 * These are wallet-specific events emitted from the Rust Tauri backend.
 * Node-level events (blocks, mining, sync, peers) come via WebSocket.
 */

// Union type of all possible Tauri GUI events
export type GuiEvent =
  | ChainReorgEvent
  | WalletLoadedEvent
  | WalletUnloadedEvent
  | IncomingTransactionEvent
  | OutgoingTransactionEvent
  | ShuttingDownEvent;

// Base event interface
interface BaseEvent<T extends string, D = unknown> {
  type: T;
  data: D;
}

// Chain reorganization occurred - important for wallet users
export interface ChainReorgEvent
  extends BaseEvent<
    "ChainReorg",
    {
      oldTip: string;
      newTip: string;
      depth: number;
      removedCount: number;
      addedCount: number;
    }
  > {}

// Wallet loaded
export interface WalletLoadedEvent
  extends BaseEvent<
    "WalletLoaded",
    {
      name: string;
    }
  > {}

// Wallet unloaded
export interface WalletUnloadedEvent extends BaseEvent<"WalletUnloaded", null> {}

// Incoming transaction detected in mempool
export interface IncomingTransactionEvent
  extends BaseEvent<
    "IncomingTransaction",
    {
      txid: string;
      amount: number;
      timestamp: number;
    }
  > {}

// Outgoing transaction submitted to mempool
export interface OutgoingTransactionEvent
  extends BaseEvent<
    "OutgoingTransaction",
    {
      txid: string;
      amount: number;
      timestamp: number;
    }
  > {}

// Node shutting down
export interface ShuttingDownEvent extends BaseEvent<"ShuttingDown", null> {}

// Helper type to extract event data by type
export type EventData<T extends GuiEvent["type"]> = Extract<
  GuiEvent,
  { type: T }
>["data"];
