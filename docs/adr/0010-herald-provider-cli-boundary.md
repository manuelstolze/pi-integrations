---
status: accepted
---

# Use provider CLIs for Herald requests

Herald uses the official GitLab CLI (`glab`) and GitHub CLI (`gh`) for merge-request and pull-request operations. Authentication remains in the user's CLI setup, while Herald passes validated arguments and supports cloud and self-hosted hosts; Herald does not call provider APIs or manage provider tokens directly.
