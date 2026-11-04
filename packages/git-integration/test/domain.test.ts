import { describe, expect, it } from "vitest";
import { providerHintFromOriginUrl } from "../src/domain/hosting-provider.js";
import { selectGitLabTargetBranch } from "../src/domain/rules.js";

describe("providerHintFromOriginUrl", () => {
  it("detects GitHub HTTPS and SSH origins", () => {
    expect(providerHintFromOriginUrl("https://github.com/owner/repo.git")).toBe("github");
    expect(providerHintFromOriginUrl("git@github.com:owner/repo.git")).toBe("github");
  });

  it("does not guess a provider for another host", () => {
    expect(providerHintFromOriginUrl("git@gitlab.example.com:group/repo.git")).toBeNull();
    expect(providerHintFromOriginUrl("https://code.example.com/group/repo.git")).toBeNull();
  });
});

describe("selectGitLabTargetBranch", () => {
  it.each([
    [[], null],
    [["master"], "master"],
    [["main"], "main"],
    [["main", "master"], "main"],
    [["develop"], "develop"],
    [["develop", "master"], "develop"],
    [["develop", "main"], "develop"],
    [["develop", "main", "master"], "develop"],
  ])("selects the first available branch from %o", (available, expected) => {
    expect(selectGitLabTargetBranch(available)).toBe(expected);
  });
});
