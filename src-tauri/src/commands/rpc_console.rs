//! RPC Console commands
//!
//! Pass-through to the existing RPC handler system.
//! This ensures all RPC methods are automatically available without
//! hard-coding, and updates when the RPC system changes.

use serde::Serialize;
use serde_json::Value as JsonValue;
use std::sync::Arc;
use tauri::State;

use xtal::rpc::{get_all_methods, get_method, handle_rpc_request, JsonRpcRequest, RpcAuth};

use crate::state::AppState;

/// RPC response to frontend
#[derive(Debug, Clone, Serialize)]
pub struct RpcConsoleResponse {
    pub success: bool,
    pub result: Option<JsonValue>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
}

/// RPC method information for the methods popup
#[derive(Debug, Clone, Serialize)]
pub struct RpcMethodInfo {
    pub name: String,
    pub description: String,
    pub category: String,
    pub requires_auth: bool,
    pub params: Vec<RpcParamInfo>,
}

/// RPC parameter information
#[derive(Debug, Clone, Serialize)]
pub struct RpcParamInfo {
    pub name: String,
    pub param_type: String,
    pub required: bool,
    pub description: String,
}

/// Parse a parameter value based on expected type
///
/// Handles type conversion (string -> u64/bool) and strips embedded quotes.
fn parse_param_value(value: &JsonValue, param_type: &str) -> JsonValue {
    // If already the correct type, return as-is
    if value.is_number() && (param_type == "u64" || param_type == "usize") {
        return value.clone();
    }
    if value.is_boolean() && param_type == "bool" {
        return value.clone();
    }

    // For string values, try to parse based on expected type
    if let Some(s) = value.as_str() {
        // Strip any embedded quote characters (defensive fix for double-quoted input)
        let cleaned = s.trim_matches('"');

        match param_type {
            "u64" | "usize" => {
                if let Ok(n) = cleaned.parse::<u64>() {
                    return JsonValue::Number(n.into());
                }
            }
            "bool" => {
                if let Ok(b) = cleaned.parse::<bool>() {
                    return JsonValue::Bool(b);
                }
            }
            _ => {
                // For string type, return cleaned version if quotes were stripped
                if cleaned != s {
                    return JsonValue::String(cleaned.to_string());
                }
            }
        }
    }

    value.clone()
}

/// Convert positional array parameters to named object parameters
///
/// Uses method metadata to map array indices to parameter names.
/// If params is already an object or the method is unknown, returns as-is.
fn convert_positional_to_named(method_name: &str, params: &JsonValue) -> JsonValue {
    // Pass through non-arrays unchanged (already object/null/etc)
    if !params.is_array() {
        return params.clone();
    }

    let array = match params.as_array() {
        Some(arr) => arr,
        None => return params.clone(),
    };

    // Look up method metadata for parameter names and types
    let method_meta = match get_method(method_name) {
        Some(m) => m,
        None => return params.clone(), // Unknown method, pass through unchanged
    };

    // Build named object from positional parameters
    let mut obj = serde_json::Map::new();
    for (i, param_meta) in method_meta.params.iter().enumerate() {
        if let Some(value) = array.get(i) {
            let parsed = parse_param_value(value, &param_meta.param_type);
            obj.insert(param_meta.name.to_string(), parsed);
        }
    }

    JsonValue::Object(obj)
}

/// Execute an RPC command by passing through to the actual RPC dispatcher
///
/// This is the future-proof approach - all existing and future RPC methods
/// are automatically available without any GUI-side changes.
///
/// Parameters are passed directly (method, params) to match frontend invocation.
#[tauri::command]
pub async fn execute_rpc(
    state: State<'_, AppState>,
    method: String,
    params: Option<JsonValue>,
) -> Result<RpcConsoleResponse, String> {
    use std::time::Instant;
    let start = Instant::now();

    // Convert positional array params to named object params using method metadata
    let converted_params = match params {
        Some(p) => convert_positional_to_named(&method, &p),
        None => serde_json::json!({}),
    };

    // Build JSON-RPC 2.0 request
    let rpc_request = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method,
        params: converted_params,
        id: serde_json::json!(1),
    };

    // Create disabled auth for local GUI access
    let auth = RpcAuth::new(None);

    // Pass directly to the RPC dispatcher
    let response = handle_rpc_request(
        rpc_request,
        Arc::clone(&state.services),
        None, // No remote address (local)
        auth,
        None, // No auth header needed
    )
    .await;

    let execution_time = start.elapsed().as_millis() as u64;

    // Convert JSON-RPC response to our console response format
    if let Some(error) = response.error {
        Ok(RpcConsoleResponse {
            success: false,
            result: None,
            error: Some(format!("{}: {}", error.code, error.message)),
            execution_time_ms: execution_time,
        })
    } else {
        Ok(RpcConsoleResponse {
            success: true,
            result: response.result,
            error: None,
            execution_time_ms: execution_time,
        })
    }
}

/// Get list of available RPC methods
///
/// This reads from the method metadata registry to stay in sync.
#[tauri::command]
pub async fn get_rpc_methods() -> Result<Vec<String>, String> {
    let methods = get_all_methods();
    Ok(methods.into_iter().map(|m| m.name.to_string()).collect())
}

/// Get detailed information about all RPC methods
///
/// Returns method names, descriptions, categories, auth requirements, and parameters.
#[tauri::command]
pub async fn get_rpc_method_details() -> Result<Vec<RpcMethodInfo>, String> {
    let methods = get_all_methods();
    Ok(methods
        .into_iter()
        .map(|m| RpcMethodInfo {
            name: m.name.to_string(),
            description: m.description.to_string(),
            category: m.category.to_string(),
            requires_auth: m.requires_auth,
            params: m
                .params
                .into_iter()
                .map(|p| RpcParamInfo {
                    name: p.name.to_string(),
                    param_type: p.param_type.to_string(),
                    required: p.required,
                    description: p.description.to_string(),
                })
                .collect(),
        })
        .collect())
}
