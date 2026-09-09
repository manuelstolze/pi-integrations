---
status: proposed
---

# Support force push in Herald

The first Herald workflow never uses a force push and stops on a non-fast-forward error. A future design may support an explicit force-push action, but it must define history-loss warnings, protected-branch checks, `--force-with-lease` rules, and separate approval requirements.
