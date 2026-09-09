---
status: proposed
---

# Support hunk-level commit grouping in Herald

The first Herald workflow assigns each file to one commit group. A future design may split one file across several commits, but it must define patch selection, staged and unstaged change handling, snapshot validation, and recovery after a partial failure.
