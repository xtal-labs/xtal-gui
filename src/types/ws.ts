/**
 * Node WebSocket message types.
 *
 * The node API streams JSON frames over ws://localhost:{apiPort}/ws. Each frame
 * is an envelope `{ type, data, ... }`. `NodeWsMessage` is the discriminated
 * union of every frame the GUI handles, so a `switch (msg.type)` narrows
 * `msg.data` to the matching payload without per-case casts.
 *
 * Field casing matches the wire format exactly: some payloads arrive snake_case
 * (straight from Rust serde), others camelCase (already adapted by the API
 * layer). Do not "normalize" these — they mirror what the node actually sends.
 */

import type { MiningStats, FruitProductionStats } from "@/types";

/** Common envelope fields present on every frame. */
interface WsEnvelope<T extends string, D> {
  type: T;
  data: D;
  timestamp?: number;
  status?: string;
}

/** `blockchain_info` payload (snake_case from the Rust API). */
export interface WsBlockchainInfo {
  leaf_height: number;
  height: number;
  latest_leaf?: {
    hash: string;
    leaf_height: number;
  };
  stem_work_info?: {
    stems_since_last_leaf: number;
  };
}

/** `stem_provider_info` payload (snake_case from the Rust API). */
export interface WsStemProviderInfo {
  latest_stem_hash?: string;
  current_epoch: number;
  stems_since_last_leaf: Array<{
    hash: string;
    nonce: number;
    timestamp: number;
  }>;
}

/** `new_block` payload (camelCase). */
export interface WsNewBlock {
  hash: string;
  height: number;
  leafHeight: number;
  blockType: string;
  timestamp: number;
  txCount?: number;
  fruitCount?: number;
}

/** `sync_progress` payload (snake_case). */
export interface WsSyncProgress {
  phase: string;
  progress_percent: number;
  started_at?: number;
  // Headers phase
  headers_received?: number;
  target_headers?: number;
  // Stem bodies phase
  stems_pending?: number;
  stems_complete?: number;
  // Leaves phase
  leaves_received?: number;
  total_leaves?: number;
  current_epoch?: number;
  // State sync
  pivot_height?: number;
  state_root?: string;
  downloaded_chunks?: number;
  total_chunks?: number;
  // Execution
  blocks_executed?: number;
  target_height?: number;
  // Speed/ETA
  items_per_second?: number;
  estimated_seconds_remaining?: number;
  bytes_downloaded?: number;
  bytes_total?: number;
  // Error
  failure_reason?: string;
  // Peer info
  sync_peer?: string;
  peer_count?: number;
}

/** `peer_update` payload (lightweight count-only update). */
export interface WsPeerUpdate {
  peer_count: number;
}

/** A single peer entry inside a `peers_update` payload (snake_case). */
export interface WsPeerStats {
  peer_id: string;
  addresses: string[];
  direction: string;
  state: string;
  connected_at?: number;
  last_seen: number;
  bytes_sent: number;
  bytes_received: number;
  latency: number;
  best_height: number;
  protocol_version?: number;
  user_agent?: string;
}

/** `peers_update` payload (camelCase wrapper around snake_case peer entries). */
export interface WsPeersUpdate {
  peerCount: number;
  inboundCount: number;
  outboundCount: number;
  peers: WsPeerStats[];
}

/** `fruit_produced` payload (camelCase). */
export interface WsFruitProduced {
  fruitHash: string;
  fruitType: string;
  transactionCount: number;
  timestamp: number;
  stemHash: string;
}

/** `validator_network_stats` payload (camelCase). */
export interface WsValidatorNetworkStats {
  currentEpoch: number;
  totalStaked: string;
  validatorCount: number;
  productionStats?: FruitProductionStats[];
}

/** A locally mined `new_block` also carries this top-level flag. */
export interface WsNewBlockMessage extends WsEnvelope<"new_block", WsNewBlock> {
  mined_by_local_node?: boolean;
}

/**
 * Discriminated union of every node WebSocket frame the GUI handles.
 * Switch on `type` to narrow `data`.
 */
export type NodeWsMessage =
  | WsEnvelope<"blockchain_info", WsBlockchainInfo>
  | WsEnvelope<"stem_provider_info", WsStemProviderInfo>
  | WsNewBlockMessage
  | WsEnvelope<"mining_stats", MiningStats>
  | WsEnvelope<"sync_progress", WsSyncProgress>
  | WsEnvelope<"peer_update", WsPeerUpdate>
  | WsEnvelope<"peers_update", WsPeersUpdate>
  | WsEnvelope<"fruit_produced", WsFruitProduced>
  | WsEnvelope<"validator_network_stats", WsValidatorNetworkStats>
  | WsEnvelope<"connection", unknown>
  | WsEnvelope<"test", unknown>;
