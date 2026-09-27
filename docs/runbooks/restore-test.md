# Monthly storage restore test

1. Pick 5 random objects from last night's R2 copy (`worker` job `r2-copy` writes a manifest to `backups/manifest-YYYY-MM-DD.json`).
2. Download each from R2 and compare `sha256` with `files.sha256`.
3. Record the result in `docs/decisions.md` under "Restore test YYYY-MM".
