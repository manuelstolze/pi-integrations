---
status: accepted
---

# Use structured tools for Herald workflow actions

Herald uses structured Pi tools for Git writes and merge-request or pull-request actions. The agent proposes commit and request plans, while the extension validates snapshots, controls workflow stages, asks for approval, and executes commands directly; direct Git commands are blocked during an active workflow. This boundary prevents shell commands from bypassing approval and makes partial actions and recovery visible.
