/**
 * WebSocket hook for connecting to the Crystal node API
 *
 * Connects to ws://localhost:{apiPort}/ws and handles:
 * - Automatic reconnection with exponential backoff + jitter
 * - Visibility-change listener for immediate reconnect on wake
 * - Message parsing and routing
 * - Connection state tracking
 */

import { useEffect, useRef, useCallback, useState } from "react";

export interface WebSocketMessage {
  type: string;
  data: unknown;
  timestamp?: number;
  status?: string;
}

export type ConnectionState = "connecting" | "connected" | "disconnected";

interface UseNodeWebSocketOptions {
  /** Callback for incoming messages */
  onMessage: (msg: WebSocketMessage) => void;
  /** Callback for connection state changes */
  onConnectionChange?: (state: ConnectionState) => void;
  /** Base reconnection delay in ms (default: 2000) */
  reconnectDelay?: number;
}

const MAX_RECONNECT_DELAY = 30_000;

/**
 * Hook to manage WebSocket connection to the Crystal node
 *
 * @param apiPort - The API port to connect to
 * @param options - Configuration options
 */
export function useNodeWebSocket(
  apiPort: number | null,
  options: UseNodeWebSocketOptions
) {
  const { onMessage, onConnectionChange, reconnectDelay = 2000 } = options;

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");

  // Store callbacks in refs to avoid reconnection on callback changes
  const onMessageRef = useRef(onMessage);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);

  const updateConnectionState = useCallback((state: ConnectionState) => {
    setConnectionState(state);
    onConnectionChangeRef.current?.(state);
  }, []);

  const connect = useCallback(() => {
    if (!apiPort) return;

    // Clear any existing reconnect timeout
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    // Close existing connection if any
    if (ws.current) {
      // Prevent the old socket's onclose from scheduling a spurious reconnect
      ws.current.onopen = null;
      ws.current.onmessage = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.close();
    }

    updateConnectionState("connecting");

    try {
      ws.current = new WebSocket(`ws://localhost:${apiPort}/ws`);

      ws.current.onopen = () => {
        console.log(`[WebSocket] Connected to port ${apiPort}`);
        reconnectAttempt.current = 0;
        updateConnectionState("connected");
      };

      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          try {
            onMessageRef.current(msg);
          } catch (handlerErr) {
            console.error("[WebSocket] Message handler error:", handlerErr, "message type:", msg?.type);
          }
        } catch (e) {
          console.error("[WebSocket] Failed to parse message:", e);
        }
      };

      ws.current.onclose = (event) => {
        console.log(
          `[WebSocket] Disconnected (code: ${event.code}, reason: ${event.reason})`
        );
        updateConnectionState("disconnected");

        // Schedule reconnection with exponential backoff + jitter
        const attempt = reconnectAttempt.current;
        reconnectAttempt.current = attempt + 1;
        const baseDelay = Math.min(reconnectDelay * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
        const jitter = baseDelay * 0.3 * Math.random();
        const delay = baseDelay + jitter;

        console.log(`[WebSocket] Reconnecting in ${Math.round(delay)}ms (attempt ${attempt + 1})`);
        reconnectTimeout.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.current.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };
    } catch (e) {
      console.error("[WebSocket] Failed to create connection:", e);
      updateConnectionState("disconnected");

      // Schedule reconnection on failure with backoff
      const attempt = reconnectAttempt.current;
      reconnectAttempt.current = attempt + 1;
      const baseDelay = Math.min(reconnectDelay * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
      const jitter = baseDelay * 0.3 * Math.random();
      reconnectTimeout.current = setTimeout(connect, baseDelay + jitter);
    }
  }, [apiPort, reconnectDelay, updateConnectionState]);

  // Connect when apiPort becomes available
  useEffect(() => {
    if (apiPort) {
      connect();
    }

    return () => {
      // Cleanup on unmount — null handlers to prevent spurious reconnects
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onclose = null;
        ws.current.onerror = null;
        ws.current.close();
      }
    };
  }, [apiPort, connect]);

  // Reconnect immediately when tab/window becomes visible (e.g. after sleep/wake)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const socket = ws.current;
        if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
          console.log("[WebSocket] Tab visible — forcing immediate reconnect");
          reconnectAttempt.current = 0;
          connect();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [connect]);

  // Method to send messages to the server
  const send = useCallback((message: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn("[WebSocket] Cannot send - not connected");
    }
  }, []);

  return {
    connectionState,
    send,
    reconnect: connect,
  };
}

export default useNodeWebSocket;
