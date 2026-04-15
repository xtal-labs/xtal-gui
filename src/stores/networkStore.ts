import { create } from "zustand";
import type {
  NetworkStatus,
  NetworkType,
  Peer,
  PeerHistoryPoint,
  BandwidthStats,
} from "@/types";

interface NetworkState {
  // Connection status
  isConnected: boolean;
  peerCount: number;
  inboundCount: number;
  outboundCount: number;
  networkType: NetworkType | null;

  // Peers list
  peers: Peer[];

  // History for charts
  peerHistory: PeerHistoryPoint[];

  // Bandwidth
  bandwidth: BandwidthStats;

  // Actions
  setNetworkStatus: (status: NetworkStatus) => void;
  setPeers: (peers: Peer[]) => void;
  updatePeer: (id: string, updates: Partial<Peer>) => void;
  removePeer: (id: string) => void;
  setPeerCount: (count: number, inbound?: number, outbound?: number) => void;
  addHistoryPoint: (point: PeerHistoryPoint) => void;
  setBandwidth: (stats: BandwidthStats) => void;
  reset: () => void;
}

const initialBandwidth: BandwidthStats = {
  bytesReceived: 0,
  bytesSent: 0,
  receivedPerSecond: 0,
  sentPerSecond: 0,
};

const initialState = {
  isConnected: false,
  peerCount: 0,
  inboundCount: 0,
  outboundCount: 0,
  networkType: null,
  peers: [],
  peerHistory: [],
  bandwidth: initialBandwidth,
};

export const useNetworkStore = create<NetworkState>((set) => ({
  ...initialState,

  setNetworkStatus: (status) =>
    set({
      isConnected: status.isConnected,
      peerCount: status.peerCount,
      inboundCount: status.inboundCount,
      outboundCount: status.outboundCount,
      networkType: status.networkType,
    }),

  setPeers: (peers) =>
    set({
      peers,
      peerCount: peers.length,
      inboundCount: peers.filter((p) => p.direction === "Inbound").length,
      outboundCount: peers.filter((p) => p.direction === "Outbound").length,
      isConnected: peers.length > 0,
    }),

  updatePeer: (id, updates) =>
    set((state) => ({
      peers: state.peers.map((peer) =>
        peer.id === id ? { ...peer, ...updates } : peer
      ),
    })),

  removePeer: (id) =>
    set((state) => {
      const newPeers = state.peers.filter((peer) => peer.id !== id);
      return {
        peers: newPeers,
        peerCount: newPeers.length,
        inboundCount: newPeers.filter((p) => p.direction === "Inbound").length,
        outboundCount: newPeers.filter((p) => p.direction === "Outbound")
          .length,
        isConnected: newPeers.length > 0,
      };
    }),

  setPeerCount: (count, inbound, outbound) =>
    set((state) => ({
      peerCount: count,
      inboundCount: inbound ?? state.inboundCount,
      outboundCount: outbound ?? state.outboundCount,
      isConnected: count > 0,
      // Add to history
      peerHistory: [
        ...state.peerHistory,
        {
          timestamp: Date.now(),
          totalPeers: count,
          inbound: inbound ?? state.inboundCount,
          outbound: outbound ?? state.outboundCount,
        },
      ].slice(-60), // Keep last minute at 1/sec
    })),

  addHistoryPoint: (point) =>
    set((state) => ({
      peerHistory: [...state.peerHistory, point].slice(-60),
    })),

  setBandwidth: (stats) => set({ bandwidth: stats }),

  reset: () => set(initialState),
}));
