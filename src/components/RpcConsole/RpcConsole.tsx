import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  Send,
  Trash2,
  Copy,
  Check,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTauriCommand } from "@/hooks";
import { copyToClipboard, cn } from "@/lib/utils";
import { useUiStore } from "@/stores";
import { RpcMethodsModal } from "./RpcMethodsModal";
import type { RpcConsoleResponse, RpcHistoryEntry, RpcRequest, RpcMethodInfo } from "@/types";

// Format params for display - handles both array and object formats
function formatParams(params: RpcRequest["params"]): string {
  if (!params) return "";
  if (Array.isArray(params)) {
    return params.map((p) => JSON.stringify(p)).join(" ");
  }
  return JSON.stringify(params);
}

export default function RpcConsole() {
  const [command, setCommand] = useState("");
  const { rpcHistory, addRpcEntry, clearRpcHistory } = useUiStore();
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMethodsModal, setShowMethodsModal] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { execute: executeRpc, error: rpcError } = useTauriCommand<RpcConsoleResponse>("execute_rpc");
  const { execute: getMethods, data: methods } = useTauriCommand<string[]>("get_rpc_methods");
  const { execute: getMethodDetails, data: methodDetails } = useTauriCommand<RpcMethodInfo[]>("get_rpc_method_details");

  useEffect(() => {
    getMethods();
    getMethodDetails();
  }, [getMethods, getMethodDetails]);

  useEffect(() => {
    // Scroll to bottom when history changes
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [rpcHistory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isExecuting) return;

    const trimmedCommand = command.trim();
    setIsExecuting(true);

    const startTime = Date.now();

    try {
      // Parse command: "method" or "method {json}" or "method arg1 arg2"
      const parts = trimmedCommand.split(/\s+/);
      const method = parts[0];
      const argsString = trimmedCommand.slice(method.length).trim();

      // Try to parse args as a single JSON object first (e.g., "getblock {"hash":"abc"}")
      // If that fails, fall back to space-separated values
      let params: unknown[] | Record<string, unknown> | undefined;
      if (argsString) {
        try {
          const parsed = JSON.parse(argsString);
          // If it's an object (not array), use it directly as params
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            params = parsed;
          } else {
            // For arrays or primitives, wrap in array
            params = [parsed];
          }
        } catch {
          // Fall back to space-separated args
          params = parts.slice(1).map((p) => {
            try {
              return JSON.parse(p);
            } catch {
              return p;
            }
          });
        }
      }

      // Convert empty array to undefined for cleaner requests
      const paramsObj = Array.isArray(params) && params.length === 0 ? undefined : params;

      const result = await executeRpc({ method, params: paramsObj });
      const duration = Date.now() - startTime;

      // Handle null response (command failed to execute)
      // Use the error from the hook if available for better diagnostics
      const response: RpcConsoleResponse = result ?? {
        success: false,
        error: rpcError || "Command execution failed - check if the node is running",
        execution_time_ms: duration,
      };

      const entry: RpcHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        request: { method, params },
        response,
        duration: response.execution_time_ms || duration,
      };

      addRpcEntry(entry);
    } catch (err) {
      const duration = Date.now() - startTime;
      const entry: RpcHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        request: { method: trimmedCommand, params: [] },
        response: {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          execution_time_ms: duration,
        },
        duration,
      };
      addRpcEntry(entry);
    } finally {
      setIsExecuting(false);
      setCommand("");
      setHistoryIndex(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const commands = rpcHistory.filter((h) => h.request.method);
      if (commands.length === 0) return;

      const newIndex =
        historyIndex < commands.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(newIndex);
      const cmd = commands[commands.length - 1 - newIndex];
      setCommand(
        `${cmd.request.method} ${formatParams(cmd.request.params)}`.trim()
      );
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const commands = rpcHistory.filter((h) => h.request.method);
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const cmd = commands[commands.length - 1 - newIndex];
        setCommand(
          `${cmd.request.method} ${formatParams(cmd.request.params)}`.trim()
        );
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand("");
      }
    }
  };

  const handleCopyOutput = async () => {
    const output = rpcHistory
      .map((h: RpcHistoryEntry) =>
        `> ${h.request.method} ${formatParams(h.request.params)}\n${JSON.stringify(h.response.success ? h.response.result : h.response.error, null, 2)}`
      )
      .join("\n\n");

    const success = await copyToClipboard(output);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-wide text-foreground">
            RPC CONSOLE
          </h1>
          <p className="text-foreground-secondary text-sm mt-1 font-heading tracking-wide">
            Execute blockchain RPC commands
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyOutput}
            disabled={rpcHistory.length === 0}
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearRpcHistory}
            disabled={rpcHistory.length === 0}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Output Area */}
      <Card variant="crystalline" className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 p-0 overflow-hidden">
          <div
            ref={outputRef}
            className="h-full overflow-auto p-4 font-mono text-sm bg-background"
          >
            {rpcHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-foreground-muted">
                <div className="text-center">
                  <div className="icon-hex mx-auto mb-4 bg-muted" style={{ width: '3rem', height: '3rem' }}>
                    <Terminal className="h-6 w-6 opacity-50" />
                  </div>
                  <p className="font-heading">Welcome to Crystal RPC Console</p>
                  <p className="text-xs mt-2">
                    Type a command and press Enter to execute
                  </p>
                  {methods && methods.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMethodsModal(true)}
                      className="text-xs mt-1 text-primary hover:text-primary/80 underline underline-offset-2 cursor-pointer transition-colors"
                    >
                      {methods.length} methods available
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {rpcHistory.map((entry: RpcHistoryEntry) => (
                  <div key={entry.id} className="space-y-2">
                    {/* Command */}
                    <div className="flex items-start gap-2">
                      <span className="text-primary shrink-0">&gt;</span>
                      <span className="text-foreground">
                        {entry.request.method}{" "}
                        {formatParams(entry.request.params)}
                      </span>
                      <Badge variant="outline" shape="chamfered" className="ml-auto text-[10px] shrink-0">
                        {entry.duration}ms
                      </Badge>
                    </div>

                    {/* Response */}
                    <div
                      className={cn(
                        "pl-4 border-l-2",
                        !entry.response.success
                          ? "border-destructive text-destructive"
                          : "border-success text-foreground-secondary"
                      )}
                    >
                      <pre className="whitespace-pre-wrap break-all text-xs">
                        {JSON.stringify(
                          entry.response.success ? entry.response.result : entry.response.error,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>

        {/* Input */}
        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-mono">
                &gt;
              </span>
              <Input
                ref={inputRef}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter RPC command (e.g., getblockchaininfo)"
                className="pl-8 font-mono chamfered-sm"
                disabled={isExecuting}
              />
            </div>
            <Button type="submit" variant="crystalline" disabled={!command.trim() || isExecuting}>
              <Send className="h-4 w-4 text-primary dark:text-primary-foreground" />
            </Button>
          </form>
          <div className="flex items-center justify-between mt-2 text-xs text-foreground-muted font-heading">
            <span>Use arrow keys for command history</span>
            {methods && (
              <button
                type="button"
                onClick={() => setShowMethodsModal(true)}
                className="text-primary hover:text-primary/80 underline underline-offset-2 cursor-pointer transition-colors"
              >
                {methods.length} methods available
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* RPC Methods Modal */}
      <RpcMethodsModal
        isOpen={showMethodsModal}
        onClose={() => setShowMethodsModal(false)}
        methods={methodDetails ?? []}
      />
    </div>
  );
}
