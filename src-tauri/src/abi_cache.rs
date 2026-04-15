//! Local ABI cache for the Tauri GUI
//!
//! Stores contract ABIs on disk as JSON files alongside a lightweight index.
//! The index contains denormalized metadata (name, description, method count)
//! so the library view can render without loading every ABI file.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use xtal::vm::abi::{content_cid_from_bytes, content_hash_from_bytes, ContractAbi};
use xtal::vm::cage_contract::CAGE_CONTRACT_ADDRESS;

/// Metadata stored in `index.json` for each cached contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub address: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fruit_type: Option<String>,
    pub method_count: usize,
    pub content_hash: String,
    /// Hex-encoded CIDv1 bytes (36 bytes). Computed on put().
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cid: Option<String>,
    pub added_at: u64,
    pub source: String,
}

/// On-disk ABI cache living under `{data_dir}/abis/`.
pub struct AbiCache {
    dir: PathBuf,
    index: HashMap<String, CacheEntry>,
}

impl AbiCache {
    /// Open (or create) the cache directory and load the index.
    pub fn open(data_dir: &Path) -> Result<Self, String> {
        let dir = data_dir.join("abis");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create ABI cache dir: {}", e))?;

        let index_path = dir.join("index.json");
        let index: HashMap<String, CacheEntry> = if index_path.exists() {
            let data = std::fs::read_to_string(&index_path)
                .map_err(|e| format!("Failed to read ABI index: {}", e))?;
            serde_json::from_str(&data).map_err(|e| format!("Failed to parse ABI index: {}", e))?
        } else {
            HashMap::new()
        };

        Ok(Self { dir, index })
    }

    /// Persist the index to disk.
    fn flush_index(&self) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.index)
            .map_err(|e| format!("Failed to serialize ABI index: {}", e))?;
        std::fs::write(self.dir.join("index.json"), json)
            .map_err(|e| format!("Failed to write ABI index: {}", e))?;
        Ok(())
    }

    /// Load a full ABI from the cache.
    pub fn get(&self, address: &str) -> Option<ContractAbi> {
        let addr = normalize_address(address);
        if !self.index.contains_key(&addr) {
            return None;
        }
        let path = self.dir.join(format!("{}.abi.json", addr));
        let data = std::fs::read_to_string(&path).ok()?;
        serde_json::from_str(&data).ok()
    }

    /// Insert or update an ABI in the cache.
    pub fn put(
        &mut self,
        address: &str,
        abi: &ContractAbi,
        source: &str,
        fruit_type: Option<&str>,
    ) -> Result<(), String> {
        let addr = normalize_address(address);

        // Write ABI file
        let json = serde_json::to_string_pretty(abi)
            .map_err(|e| format!("Failed to serialize ABI: {}", e))?;
        std::fs::write(self.dir.join(format!("{}.abi.json", addr)), &json)
            .map_err(|e| format!("Failed to write ABI file: {}", e))?;

        // Update index using raw JSON bytes for content hash and CID
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        self.index.insert(
            addr.clone(),
            CacheEntry {
                address: addr,
                name: abi.name.clone(),
                description: abi.description.clone(),
                icon: abi.icon.clone(),
                fruit_type: fruit_type.map(|s| s.to_string()),
                method_count: abi.methods.len(),
                content_hash: hex::encode(content_hash_from_bytes(json.as_bytes())),
                cid: Some(hex::encode(content_cid_from_bytes(json.as_bytes()))),
                added_at: now,
                source: source.to_string(),
            },
        );

        self.flush_index()
    }

    /// Remove a contract from the cache.
    pub fn remove(&mut self, address: &str) -> Result<(), String> {
        let addr = normalize_address(address);
        self.index.remove(&addr);

        let path = self.dir.join(format!("{}.abi.json", addr));
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        }

        self.flush_index()
    }

    /// List all cached entries (for the library view).
    pub fn list(&self) -> Vec<CacheEntry> {
        let mut entries: Vec<CacheEntry> = self.index.values().cloned().collect();
        // Most recently added first
        entries.sort_by(|a, b| b.added_at.cmp(&a.added_at));
        entries
    }

    /// Look up an entry by its content hash (for `__abi_cid` matching).
    pub fn find_by_content_hash(&self, hash: &str) -> Option<&CacheEntry> {
        self.index.values().find(|e| e.content_hash == hash)
    }

    /// Look up an entry by its hex-encoded CID.
    pub fn find_by_cid(&self, cid_hex: &str) -> Option<&CacheEntry> {
        self.index
            .values()
            .find(|e| e.cid.as_deref() == Some(cid_hex))
    }

    /// Seed the CAGE builtin ABI if not already cached.
    pub fn seed_builtins(&mut self) -> Result<(), String> {
        let cage_addr = normalize_address(&hex::encode(CAGE_CONTRACT_ADDRESS));
        if self.index.contains_key(&cage_addr) {
            return Ok(());
        }

        let abi = xtal::vm::abi::cage_abi();
        self.put(&cage_addr, &abi, "builtin", Some("Apple"))
    }
}

/// Normalize address to uppercase hex without 0x prefix.
fn normalize_address(address: &str) -> String {
    address.strip_prefix("0x").unwrap_or(address).to_uppercase()
}
