# crystal-gui {{VERSION}}

_Released {{DATE}}_

---

## ✨ What's Changed

### From the bundled node (xtal 0.9.5)

- **A peer can no longer trigger a false full-chain resync by relaying current
  gossip.** Sync source selection now uses the height the peer proved in its
  handshake. A peer that joined far behind but later relayed a current block is
  kept as telemetry and is not promoted into a source for missing history.
- **Header sync validates its anchor before changing local sync state.** The
  anchor must be on the canonical chain and above the active hardened-checkpoint
  reorg floor. Genesis-rooted history, noncanonical anchors and replayed
  canonical prefixes are rejected before headers are staged, the leaf base is
  rebased or block bodies are requested.
- **Fork work is deterministic across epoch boundaries.** Comparisons include
  shared stems whose backing can still change, deduplicate validator backing
  and price each stem from the stake table at its own branch boundary. Candidate
  branch committees are reconstructed from historical stake state, removing
  arrival-order preference cycles and observer-dependent scores.
- **Finalized work revisions include later stem contributions safely.** The
  work gate and canonical update now cover the same comparison window, while
  missing headers, bodies, undo records or epoch stake data fail closed instead
  of producing a partial score.

### In the app

- The desktop package now embeds the 0.9.5 node library, so the sync and fork
  safety fixes apply whether Crystal runs through the GUI or as a headless node.

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
