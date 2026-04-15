/**
 * RPC Console types
 */

export interface RpcMethod {
  name: string;
  description?: string;
  params?: RpcParam[];
}

export interface RpcParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface RpcRequest {
  method: string;
  params: unknown[] | Record<string, unknown> | undefined;
}

/**
 * Response from execute_rpc Tauri command
 * Matches backend RpcConsoleResponse struct
 */
export interface RpcConsoleResponse {
  success: boolean;
  result?: unknown;
  error?: string;  // Backend sends string, not RpcError object
  execution_time_ms: number;
}

/**
 * Legacy RpcResponse for backwards compatibility
 * @deprecated Use RpcConsoleResponse instead
 */
export interface RpcResponse {
  result?: unknown;
  error?: RpcError;
}

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface RpcHistoryEntry {
  id: string;
  timestamp: number;
  request: RpcRequest;
  response: RpcConsoleResponse;
  duration: number; // ms
}

/**
 * Detailed RPC method information from get_rpc_method_details
 * Matches backend RpcMethodInfo struct
 */
export interface RpcMethodInfo {
  name: string;
  description: string;
  category: string;
  requires_auth: boolean;
  params: RpcParamInfo[];
}

/**
 * RPC parameter information
 * Matches backend RpcParamInfo struct
 */
export interface RpcParamInfo {
  name: string;
  param_type: string;
  required: boolean;
  description: string;
}
