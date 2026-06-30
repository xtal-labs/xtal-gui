# crystal-gui {{VERSION}}

_Released {{DATE}}_

---

## What's Changed

- 

---

## Installation

Builds are produced for each platform below. Exact filenames embed the version
(without the leading `v`) and architecture (e.g. `Crystal_<ver>_amd64.deb`) — see
the **Verification** section for the complete asset list.

### Linux
Pick the package for your distro and architecture (`amd64`/`x86_64` for Intel/AMD,
`arm64`/`aarch64` for ARM):
- **Debian / Ubuntu** — `Crystal_<ver>_<arch>.deb` → `sudo apt install ./Crystal_*.deb`
- **Fedora / RHEL** — `Crystal-<ver>-1.<arch>.rpm` → `sudo dnf install ./Crystal-*.rpm`
- **Portable (any distro)** — `Crystal_<ver>_<arch>.AppImage` → `chmod +x` it and run directly.

### Windows
Download `Crystal_<ver>_x64-setup.exe` (recommended installer) or
`Crystal_<ver>_x64_en-US.msi`. You may see a SmartScreen warning as the build is
currently unsigned — click **More info** → **Run anyway**.

### Mac (Apple Silicon)
For M1/M2/M3 and newer Macs, download `Crystal_<ver>_aarch64.dmg`, open it, and
drag **Crystal** to Applications. The build is unsigned, so if macOS reports the
app as damaged, clear the quarantine attribute:
```bash
sudo xattr -cr /Applications/Crystal.app
```

### Mac (Intel)
For older Intel Macs, download `Crystal_<ver>_x64.dmg` and follow the same steps:
```bash
sudo xattr -cr /Applications/Crystal.app
```

---

## Verification

Always verify the integrity of your download against the checksums below.

```
{{CHECKSUMS}}
```

To verify on Linux/Mac:
```bash
sha256sum -c checksums.txt
```

To verify on Windows (PowerShell) — set `$file` to the exact asset you downloaded:
```powershell
$file = "Crystal_<ver>_x64-setup.exe"   # replace <ver> with the version, e.g. 0.2.0
$expected = (Get-Content checksums.txt | Select-String ([regex]::Escape($file))).ToString().Split()[0]
$actual = (Get-FileHash $file -Algorithm SHA256).Hash
if ($expected -eq $actual) { "✓ Checksum verified" } else { "✗ Checksum mismatch" }
```

---

## Notes

> ⚠️ Windows and Mac binaries are currently unsigned. Windows users may see a
> SmartScreen warning. Mac users must remove the quarantine attribute before
> running (see installation instructions above). Signed builds will be available
> in a future release once certificates are obtained.

---

_For questions or issues, please open a [GitHub issue](https://github.com/xtal-labs/xtal-gui/issues)._