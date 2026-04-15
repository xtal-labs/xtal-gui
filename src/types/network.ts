/**
 * Network-related types
 */

export interface NetworkStatus {
  isConnected: boolean;
  peerCount: number;
  inboundCount: number;
  outboundCount: number;
  networkType: NetworkType;
  localAddress?: string;
  externalAddress?: string;
}

export type NetworkType = "Mainnet" | "Testnet" | "Regtest";

export interface Peer {
  id: string;
  address: string;
  port: number;
  direction: PeerDirection;
  state: PeerState;
  version?: string;
  userAgent?: string;
  services?: string[];
  latency?: number; // ms
  connectedAt?: number;
  lastSeen?: number;
  bytesReceived?: number;
  bytesSent?: number;
  bestHeight?: number;
}

export type PeerDirection = "Inbound" | "Outbound";

export type PeerState =
  | "Connecting"
  | "Handshaking"
  | "Connected"
  | "Ready"  // Handshake complete, ready for protocol
  | "Disconnecting"
  | "Disconnected"
  | "Banned";

export interface PeerHistoryPoint {
  timestamp: number;
  totalPeers: number;
  inbound: number;
  outbound: number;
}

export interface BandwidthStats {
  bytesReceived: number;
  bytesSent: number;
  receivedPerSecond: number;
  sentPerSecond: number;
}
