# Ideas (not in scope — log here instead of building)

- Queued extractBid batch runs (a `job_kinds` row + worker handler) for whole-package or whole-job extraction with progress (SPEC §8.7 "long jobs", §11.4 sealed hold). Phase 1 runs extraction on demand from the leveling screen (`extract-bid`).
