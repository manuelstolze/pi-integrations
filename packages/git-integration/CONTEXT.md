# Git integration context

This context defines the language for the Herald Git workflow. It covers local Git changes and the review requests created on a code host.

## Terms

- **Code host**: A service that stores Git repositories and provides collaboration features, such as GitLab or GitHub.
- **Source branch**: The branch that contains the commits submitted for integration.
- **Target branch**: The branch that receives the merge request or pull request.
- **Review request**: A request to integrate the source branch into the target branch. GitLab calls it a merge request. GitHub calls it a pull request.
- **Request template**: Repository text that defines the required content of a merge request or pull request.
- **Herald workflow**: The approved sequence for planning commits, creating commits, pushing the source branch, and creating or updating a review request.

## Language rules

- Use **review request** when the provider is not known.
- Use **merge request** for GitLab.
- Use **pull request** for GitHub.
- Use **source branch** and **target branch**. Avoid ambiguous terms such as local branch or destination branch when describing the request relationship.
