# crystal-gui {{VERSION}}

_Released {{DATE}}_

---

## ✨ What's Changed

### Recover a restored wallet

- **File → Recover Wallet Balance...** opens recovery from any tab. Enter the
  wallet password to search for used addresses and rebuild history after restoring
  an older backup. This recovery action does not unlock the wallet for spending.
- The dialog displays address discovery and history scan progress, reports
  incomplete searches, and refreshes wallet data after recovery finishes.
- **Continue searching** widens address discovery automatically when funds may
  lie beyond an unused address gap. No numeric search range is required.
- Search settings and the incomplete-recovery marker survive restarts; rerun
  recovery after synchronizing missing node history or extending the search.

### Bundled backend: xtal 0.9.6

The desktop app embeds the node library, so these backend changes also apply
when running Crystal through the GUI.

**Wallet balances and address discovery**

- Every known mining, receiving and change address contributes to available
  balance and coin selection. A funded address in an older backup remains
  spendable even when its saved allocation index is stale.
- Recovery discovers historical address use, including receipts already spent,
  across the mining, receiving, change and VM branches of normal HD wallets and
  the staking key of validator wallets. Additional passes revisit earlier blocks
  for payments to keys discovered later.
- Transaction amounts are recalculated after discovery while retaining labels.
  Address allocation indices merge monotonically to prevent a stale update from
  rewinding them; refreshing recovered keys preserves wallet locking and switching.
- Unlocked wallets can replenish their address look-ahead automatically. Locked
  wallets report that discovery needs a password, and locked miners retain their
  last cached payout key when the address pool is exhausted.
- Missing blocks or receipts, chain reorganizations during the scan and search
  limits leave recovery explicitly incomplete. Search settings and the incomplete
  marker persist so the search can be retried or extended.

**Live block and fruit propagation**

- Missing ancestry is recovered through bounded header pages before downloading
  bodies. Unknown announcements and sibling blocks share recovery requests instead
  of filling the orphan pool or forcing a full-chain resync.
- Block and fruit retrieval retries temporary availability failures with capped
  backoff and peer failover. Capacity and lifetime limits bound live block fetches;
  header recovery validates difficulty against the header's own parent branch.
- Blocks accepted through another path release waiting blocks, deferred fruit
  announcements and header recovery. Indexed empty stems can be reconstructed
  locally without downloading an empty body.

**Sync, fork validation and validators**

The backend also retains the fixes introduced before GUI v0.9.5:

- Historical sync selects peers using their handshake leaf height. Relaying newer
  gossip updates telemetry without making a peer eligible to serve missing history.
- Header sync validates canonical anchors and hardened-checkpoint reorg floors
  before staging headers or requesting bodies; replayed canonical prefixes and
  inadmissible anchors are rejected before changing sync state.
- Fork work uses branch-specific epoch stake state, includes shared stems whose
  backing can still change and deduplicates validator backing. Missing comparison
  data fails closed instead of yielding a partial work score.
- Fruit difficulty and epoch inputs follow each candidate branch across epoch
  boundaries. Timestamp checks use indexed headers before ancestor bodies arrive.
- Validator RPC clients support selecting a staking contract for stake and unstake
  operations. Unstake selection and estimates use mature outputs from that contract.

**Upgrade behavior**

- Existing wallet registries perform a one-time history replay under the v6 sync
  cursor. Balances may be incomplete while that replay or explicit recovery runs.
- Recovery preserves existing keys, encrypted wallet files and address derivation.
  Imported raw keys, labels and saved multisig scripts still require their separate
  backup material.

### Release packaging

- Desktop and frontend versions are aligned at 0.9.6. The release workflow checks
  version consistency and builds against a pinned 0.9.6 backend revision.

---

## 📦 Which file should I download?

Scroll down to **Assets** and pick the file that matches your computer:

| Your computer | Download the file ending in… |
|---|---|
| 🪟 **Windows** | `x64-setup.exe` |
| 🍎 **Mac** — Apple Silicon (M1 chip or newer, ~2020+) | `aarch64.dmg` |
| 🍎 **Mac** — Intel (older models) | `x64.dmg` |
| 🐧 **Linux** — Ubuntu / Debian | `amd64.deb` |
| 🐧 **Linux** — Fedora / RHEL | `x86_64.rpm` |
| 🐧 **Linux** — any other distro | `amd64.AppImage` |

**Not sure which Mac you have?** Click the Apple menu → **About This Mac**.
If the chip starts with "Apple M", download the Apple Silicon version.

**On an ARM Linux machine** (e.g. Raspberry Pi)? Pick the `arm64` / `aarch64`
version of the same package type instead.

---

## 🚀 Installing

### 🪟 Windows

Run the downloaded `.exe` and follow the installer. Windows may show a
"Windows protected your PC" warning because the app isn't code-signed yet —
click **More info**, then **Run anyway**. (An `.msi` installer is also
available if you prefer one.)

### 🍎 Mac

Open the `.dmg` and drag **Crystal** into **Applications**. Because the app
isn't code-signed yet, macOS may report it as "damaged" the first time you
open it. Fix it with this one Terminal command:

```bash
sudo xattr -cr /Applications/Crystal.app
```

### 🐧 Linux

- **Ubuntu / Debian:** `sudo apt install ./Crystal_*.deb`
- **Fedora / RHEL:** `sudo dnf install ./Crystal-*.rpm`
- **AppImage:** make it executable, then run it:
  `chmod +x Crystal_*.AppImage && ./Crystal_*.AppImage`

> ⚠️ Windows and Mac builds are currently unsigned; signed builds will ship in
> a future release once certificates are obtained.

---

<details>
<summary>🔐 <b>Verify your download</b> (optional — for checking your file wasn't corrupted or tampered with)</summary>

```
{{CHECKSUMS}}
```

On Linux or Mac, run this in the folder containing your download and
`checksums.txt`:

```bash
sha256sum -c checksums.txt
```

On Windows (PowerShell) — set `$file` to the exact name of the file you downloaded:

```powershell
$file = "Crystal_<ver>_x64-setup.exe"   # replace <ver> with the version, e.g. 0.2.0
$expected = (Get-Content checksums.txt | Select-String ([regex]::Escape($file))).ToString().Split()[0]
$actual = (Get-FileHash $file -Algorithm SHA256).Hash
if ($expected -eq $actual) { "✓ Checksum verified" } else { "✗ Checksum mismatch" }
```

</details>

---

_For questions or issues, please open a [GitHub issue](https://github.com/xtal-labs/xtal-gui/issues)._
