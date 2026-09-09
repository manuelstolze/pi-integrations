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
  it("prefers develop, then main, then master", () => {
    expect(selectGitLabTargetBranch({ develop: true, main: true, master: true })).toBe("develop");
    expect(selectGitLabTargetBranch({ develop: false, main: true, master: true })).toBe("main");
    expect(selectGitLabTargetBranch({ develop: false, main: false, master: true })).toBe("master");
  });

  it("returns null when no fallback branch exists", () => {
    expect(selectGitLabTargetBranch({ develop: false, main: false, master: false })).toBeNull();
  });
});
