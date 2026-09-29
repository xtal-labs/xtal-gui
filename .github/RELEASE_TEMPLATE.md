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

### Bundled backend fixes

The app embeds xtal 0.9.6, with these changes since the backend bundled in v0.9.5:

- All known mining, receiving and change addresses contribute to available balance
  and coin selection, even when an older backup's allocation indices are stale.
- Historical discovery includes spent receipts and revisits earlier payments
  after deriving additional keys. Transaction labels and wallet locking are preserved.
- Live gossip recovers missing ancestry through bounded header requests. Sibling
  blocks and temporary retrieval failures no longer force a full-chain resync;
  retries can fail over to other peers.
- Existing wallet registries replay history once after upgrading. Balances may be
  incomplete while that replay or an explicit recovery is running.

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
