# crystal-gui {{VERSION}}

_Released {{DATE}}_

---

## What's Changed

- 

---

## Installation

### Linux x86_64
Download `crystal-gui-x86_64-linux` and run it directly.

### Linux ARM64
Download `crystal-gui-aarch64-linux` and run it directly.

### Windows
Download `crystal-gui-x86_64-windows.exe` and run it. You may see a SmartScreen
warning as the binary is currently unsigned — click **More info** → **Run anyway**.

### Mac
The Mac binary is unsigned. If macOS reports the file as damaged, run:
```bash
sudo xattr -cr crystal-gui-x86_64-mac
```
Then open it normally.

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

To verify on Windows (PowerShell):
```powershell
$expected = (Get-Content checksums.txt | Select-String "crystal-gui-x86_64-windows.exe").ToString().Split()[0]
$actual = (Get-FileHash crystal-gui-x86_64-windows.exe -Algorithm SHA256).Hash
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