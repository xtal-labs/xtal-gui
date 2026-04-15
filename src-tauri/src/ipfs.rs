//! IPFS HTTP client for ABI distribution.
//!
//! Fetches and pins ABI JSON via public IPFS gateways and pinning services.
//! All content is verified by CID (SHA-256 digest) so gateway trust is irrelevant.

use std::time::Duration;

use data_encoding::BASE32_NOPAD;
use log::{debug, info, warn};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// IPFS integration configuration, persisted in `config.toml`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpfsConfig {
    /// Master switch — when false, no IPFS operations are attempted.
    #[serde(default = "default_enabled")]
    pub enabled: bool,

    /// Ordered list of IPFS gateway base URLs (tried in order for fetches).
    #[serde(default = "default_gateways")]
    pub gateways: Vec<String>,

    /// Pinning service API endpoint (e.g. `https://api.pinata.cloud`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinning_url: Option<String>,

    /// Bearer/JWT token for the pinning service.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinning_api_key: Option<String>,

    /// Per-request timeout in seconds.
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}

fn default_enabled() -> bool {
    true
}
fn default_gateways() -> Vec<String> {
    vec![
        "https://dweb.link".into(),
        "https://cloudflare-ipfs.com".into(),
        "https://w3s.link".into(),
    ]
}
fn default_timeout() -> u64 {
    15
}

impl Default for IpfsConfig {
    fn default() -> Self {
        Self {
            enabled: default_enabled(),
            gateways: default_gateways(),
            pinning_url: None,
            pinning_api_key: None,
            timeout_secs: default_timeout(),
        }
    }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum IpfsError {
    #[error("IPFS is disabled in configuration")]
    Disabled,
    #[error("Invalid CID: {0}")]
    InvalidCid(String),
    #[error("All gateways failed to fetch CID")]
    AllGatewaysFailed,
    #[error("Content verification failed: SHA-256 mismatch")]
    ContentMismatch,
    #[error("No pinning service configured")]
    NoPinningService,
    #[error("Pinning request failed: {0}")]
    PinningFailed(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

pub struct IpfsClient {
    http: Client,
    config: IpfsConfig,
}

impl IpfsClient {
    /// Create a new IPFS client from configuration.
    pub fn new(config: IpfsConfig) -> Result<Self, IpfsError> {
        let http = Client::builder()
            .timeout(Duration::from_secs(config.timeout_secs))
            .build()?;
        Ok(Self { http, config })
    }

    /// Fetch ABI JSON from IPFS by CID bytes, verifying content integrity.
    pub async fn fetch_abi(&self, cid_bytes: &[u8]) -> Result<String, IpfsError> {
        if !self.config.enabled {
            return Err(IpfsError::Disabled);
        }
        validate_cid_prefix(cid_bytes)?;

        let cid_b32 = cid_to_base32(cid_bytes);
        let expected_digest: [u8; 32] = cid_bytes[4..36]
            .try_into()
            .map_err(|_| IpfsError::InvalidCid("digest extraction failed".into()))?;

        for gateway in &self.config.gateways {
            let url = format!("{}/ipfs/{}", gateway.trim_end_matches('/'), cid_b32);
            debug!("IPFS fetch attempt: {}", url);

            match self.http.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let body = resp.bytes().await?;
                    verify_sha256(&expected_digest, &body)?;
                    let json = String::from_utf8(body.to_vec())
                        .map_err(|_| IpfsError::InvalidCid("response is not valid UTF-8".into()))?;
                    info!("IPFS fetch succeeded from {}", gateway);
                    return Ok(json);
                }
                Ok(resp) => {
                    warn!("IPFS gateway {} returned {}", gateway, resp.status());
                }
                Err(e) => {
                    warn!("IPFS gateway {} error: {}", gateway, e);
                }
            }
        }

        Err(IpfsError::AllGatewaysFailed)
    }

    /// Pin ABI JSON to the configured pinning service. Returns CIDv1 bytes.
    pub async fn pin_abi(&self, abi_json: &str) -> Result<Vec<u8>, IpfsError> {
        if !self.config.enabled {
            return Err(IpfsError::Disabled);
        }

        let cid_bytes = compute_cid(abi_json.as_bytes());

        let pinning_url = self
            .config
            .pinning_url
            .as_deref()
            .ok_or(IpfsError::NoPinningService)?;
        let api_key = self
            .config
            .pinning_api_key
            .as_deref()
            .ok_or(IpfsError::NoPinningService)?;

        // Pinata-compatible pinning API (POST /pinning/pinFileToIPFS)
        let url = format!(
            "{}/pinning/pinFileToIPFS",
            pinning_url.trim_end_matches('/')
        );

        let part = reqwest::multipart::Part::bytes(abi_json.as_bytes().to_vec())
            .file_name("abi.json")
            .mime_str("application/json")
            .map_err(|e| IpfsError::PinningFailed(e.to_string()))?;
        let form = reqwest::multipart::Form::new().part("file", part);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| IpfsError::PinningFailed(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp
                .text()
                .await
                .unwrap_or_else(|_| "<no body>".to_string());
            return Err(IpfsError::PinningFailed(format!(
                "HTTP {}: {}",
                status, body
            )));
        }

        info!("ABI pinned to IPFS: {}", hex::encode(&cid_bytes));
        Ok(cid_bytes)
    }

    /// Return a summary of the current IPFS configuration status.
    pub fn status(&self) -> IpfsStatus {
        IpfsStatus {
            enabled: self.config.enabled,
            gateway_count: self.config.gateways.len(),
            gateways: self.config.gateways.clone(),
            pinning_configured: self.config.pinning_url.is_some()
                && self.config.pinning_api_key.is_some(),
        }
    }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/// Compute CIDv1 bytes (36 bytes) from raw content.
pub fn compute_cid(content: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let digest: [u8; 32] = hasher.finalize().into();

    let mut cid = Vec::with_capacity(36);
    cid.push(0x01); // CIDv1
    cid.push(0x55); // raw codec
    cid.push(0x12); // sha2-256
    cid.push(0x20); // 32-byte digest length
    cid.extend_from_slice(&digest);
    cid
}

/// Encode CID bytes as base32lower with 'b' multibase prefix.
pub fn cid_to_base32(bytes: &[u8]) -> String {
    let encoded = BASE32_NOPAD.encode(bytes).to_lowercase();
    format!("b{encoded}")
}

// ---------------------------------------------------------------------------
// Status DTO
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpfsStatus {
    pub enabled: bool,
    pub gateway_count: usize,
    pub gateways: Vec<String>,
    pub pinning_configured: bool,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn validate_cid_prefix(bytes: &[u8]) -> Result<(), IpfsError> {
    if bytes.len() != 36 {
        return Err(IpfsError::InvalidCid(format!(
            "expected 36 bytes, got {}",
            bytes.len()
        )));
    }
    if bytes[0] != 0x01 || bytes[1] != 0x55 || bytes[2] != 0x12 || bytes[3] != 0x20 {
        return Err(IpfsError::InvalidCid("not a CIDv1 raw/sha2-256".into()));
    }
    Ok(())
}

fn verify_sha256(expected: &[u8; 32], content: &[u8]) -> Result<(), IpfsError> {
    let mut hasher = Sha256::new();
    hasher.update(content);
    let computed: [u8; 32] = hasher.finalize().into();
    if &computed != expected {
        return Err(IpfsError::ContentMismatch);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_cid_is_valid() {
        let cid = compute_cid(b"hello world");
        assert_eq!(cid.len(), 36);
        assert_eq!(cid[0], 0x01);
        assert_eq!(cid[1], 0x55);
        assert_eq!(cid[2], 0x12);
        assert_eq!(cid[3], 0x20);
    }

    #[test]
    fn test_compute_cid_deterministic() {
        let c1 = compute_cid(b"test data");
        let c2 = compute_cid(b"test data");
        assert_eq!(c1, c2);
    }

    #[test]
    fn test_verify_sha256_passes() {
        let data = b"some content";
        let cid = compute_cid(data);
        let digest: [u8; 32] = cid[4..36].try_into().expect("digest");
        assert!(verify_sha256(&digest, data).is_ok());
    }

    #[test]
    fn test_verify_sha256_fails_mismatch() {
        let digest = [0u8; 32];
        assert!(verify_sha256(&digest, b"different").is_err());
    }

    #[test]
    fn test_cid_to_base32_format() {
        let cid = compute_cid(b"test");
        let encoded = cid_to_base32(&cid);
        assert!(encoded.starts_with('b'));
        assert!(encoded[1..]
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    }

    #[test]
    fn test_validate_cid_prefix_rejects_short() {
        assert!(validate_cid_prefix(&[0x01, 0x55]).is_err());
    }

    #[test]
    fn test_validate_cid_prefix_rejects_wrong_version() {
        let mut cid = vec![0x00, 0x55, 0x12, 0x20];
        cid.extend_from_slice(&[0u8; 32]);
        assert!(validate_cid_prefix(&cid).is_err());
    }

    #[test]
    fn test_ipfs_config_defaults() {
        let config = IpfsConfig::default();
        assert!(config.enabled);
        assert_eq!(config.gateways.len(), 3);
        assert!(config.pinning_url.is_none());
        assert_eq!(config.timeout_secs, 15);
    }

    #[test]
    fn test_ipfs_status() {
        let config = IpfsConfig::default();
        let client = IpfsClient::new(config).expect("client");
        let status = client.status();
        assert!(status.enabled);
        assert_eq!(status.gateway_count, 3);
        assert!(!status.pinning_configured);
    }
}
