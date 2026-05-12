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

function arePeersEqual(a: Peer[], b: Peer[]) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const prev = a[i];
    const next = b[i];

    if (
      prev.id !== next.id ||
      prev.address !== next.address ||
      prev.port !== next.port ||
      prev.direction !== next.direction ||
      prev.state !== next.state ||
      prev.version !== next.version ||
      prev.userAgent !== next.userAgent ||
      prev.latency !== next.latency ||
      prev.connectedAt !== next.connectedAt ||
      prev.lastSeen !== next.lastSeen ||
      prev.bytesReceived !== next.bytesReceived ||
      prev.bytesSent !== next.bytesSent ||
      prev.bestHeight !== next.bestHeight
    ) {
      return false;
    }
  }

  return true;
}

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
    set((state) => {
      if (arePeersEqual(state.peers, peers)) {
        return state;
      }

      return {
        peers,
        peerCount: peers.length,
        inboundCount: peers.filter((p) => p.direction === "Inbound").length,
        outboundCount: peers.filter((p) => p.direction === "Outbound").length,
        isConnected: peers.length > 0,
      };
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
    set((state) => {
      const inboundCount = inbound ?? state.inboundCount;
      const outboundCount = outbound ?? state.outboundCount;
      const lastPoint = state.peerHistory[state.peerHistory.length - 1];
      const now = Date.now();
      const countsUnchanged =
        state.peerCount === count &&
        state.inboundCount === inboundCount &&
        state.outboundCount === outboundCount &&
        state.isConnected === (count > 0);
      const shouldAppendHistory =
        !lastPoint ||
        now - lastPoint.timestamp >= 1_000 ||
        lastPoint.totalPeers !== count ||
        lastPoint.inbound !== inboundCount ||
        lastPoint.outbound !== outboundCount;

      if (countsUnchanged && !shouldAppendHistory) {
        return state;
      }

      return {
        peerCount: count,
        inboundCount,
        outboundCount,
        isConnected: count > 0,
        peerHistory: shouldAppendHistory
          ? [
              ...state.peerHistory,
              {
                timestamp: now,
                totalPeers: count,
                inbound: inboundCount,
                outbound: outboundCount,
              },
            ].slice(-60)
          : state.peerHistory,
      };
    }),

  addHistoryPoint: (point) =>
    set((state) => ({
      peerHistory: [...state.peerHistory, point].slice(-60),
    })),

  setBandwidth: (stats) => set({ bandwidth: stats }),

  reset: () => set(initialState),
}));
