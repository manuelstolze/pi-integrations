import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GitMode, HostingProvider } from "./types.js";

// ── Git helpers ────────────────────────────────────────────────────────────────

export interface GitResult {
    stdout: string;
    stderr: string;
    code: number;
}

export async function git(pi: ExtensionAPI, args: string[], cwd: string): Promise<GitResult> {
    try {
        const result = await pi.exec("git", ["-C", cwd, ...args], { timeout: 10000 });
        return {
            stdout: result.stdout.trim(),
            stderr: result.stderr.trim(),
            code: result.code,
        };
    } catch (error) {
        return {
            stdout: "",
            stderr: error instanceof Error ? error.message : String(error),
            code: -1,
        };
    }
}

export async function isGitRepo(pi: ExtensionAPI, cwd: string): Promise<boolean> {
    const result = await git(pi, ["rev-parse", "--git-dir"], cwd);
    return result.code === 0;
}

function remoteHost(remoteUrl: string): string | null {
    const scpMatch = remoteUrl.match(/^[^@]+@([^:]+):/);
    if (scpMatch) return scpMatch[1].toLowerCase();

    try {
        return new URL(remoteUrl).hostname.toLowerCase();
    } catch {
        return null;
    }
}

export function providerFromRemoteUrl(remoteUrl: string): HostingProvider | null {
    return remoteHost(remoteUrl.trim()) === "github.com" ? "github" : null;
}

export async function detectHostingProvider(pi: ExtensionAPI, cwd: string): Promise<HostingProvider> {
    const remoteResult = await git(pi, ["remote", "get-url", "origin"], cwd);
    if (remoteResult.code !== 0 || !remoteResult.stdout) {
        throw new Error("No usable origin remote found. Configure a GitHub or GitLab origin remote first.");
    }

    const provider = providerFromRemoteUrl(remoteResult.stdout);
    if (provider === "github") {
        try {
            const result = await pi.exec(
                "gh",
                ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"],
                { cwd, timeout: 10000 },
            );
            if (result.code === 0 && result.stdout.trim()) return "github";
            throw new Error(result.stderr.trim() || `exit code ${result.code}`);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Could not validate GitHub access with gh: ${detail}`);
        }
    }

    try {
        const result = await pi.exec("glab", ["repo", "view", "--output", "json"], {
            cwd,
            timeout: 10000,
        });
        if (result.code === 0) return "gitlab";
        throw new Error(result.stderr.trim() || `exit code ${result.code}`);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not identify the Git hosting provider with glab: ${detail}`);
    }
}

function gitFailure(result: GitResult, args: string[]): Error {
    const detail = result.stderr || `exit code ${result.code}`;
    return new Error(`git ${args.join(" ")} failed: ${detail}`);
}

function requiredOutput(result: GitResult, args: string[]): string {
    if (result.code !== 0) throw gitFailure(result, args);
    return result.stdout;
}

function optionalLogOutput(result: GitResult): string {
    if (result.code === 0) return result.stdout;
    if (result.stderr.includes("does not have any commits yet")) return "";
    throw gitFailure(result, ["log", "--oneline", "-15"]);
}

// ── Task builder ───────────────────────────────────────────────────────────────

export function parseMode(args: string): GitMode {
    const tokens = args.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return "full";

    if (tokens.length !== 1) {
        throw new Error("Invalid Herald mode. Use /herald, /herald commit, or /herald request.");
    }

    const token = tokens[0].toLowerCase();
    if (token === "commit") return "commit";
    if (token === "request") return "request";

    throw new Error("Invalid Herald mode. Use /herald, /herald commit, or /herald request.");
}

export function isValidHeader(header: string): boolean {
    const re = /^[a-z]+\([^\)]*\):\s.{1,72}$/i;
    return re.test(header);
}

export function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}\n\n... [truncated — ${text.length - maxLen} additional characters omitted]`;
}

export async function buildTask(
    pi: ExtensionAPI,
    mode: GitMode,
    cwd: string,
    provider: HostingProvider | null = null,
): Promise<string> {
    // Gather git context in parallel.
    const [statusResult, stagedResult, unstagedResult, logResult, branchResult] = await Promise.all([
        git(pi, ["status", "--short"], cwd),
        git(pi, ["diff", "--cached"], cwd),
        git(pi, ["diff"], cwd),
        git(pi, ["log", "--oneline", "-15"], cwd),
        git(pi, ["branch", "--show-current"], cwd),
    ]);

    const status = requiredOutput(statusResult, ["status", "--short"]);
    const staged = requiredOutput(stagedResult, ["diff", "--cached"]);
    const unstaged = requiredOutput(unstagedResult, ["diff"]);
    const log = optionalLogOutput(logResult);
    const branch = requiredOutput(branchResult, ["branch", "--show-current"]);

    // Mode instruction.
    const modeNote: Record<GitMode, string> = {
        commit: "**Mode: commit only.** Establish policy, plan, and execute commits (Steps 1–6). Do NOT push or create an MR.",
        request: "**Mode: request only.** Establish policy, prepare the review request, and push/create it (Steps 1 and 7–8). The commits are already done.",
        full: "**Mode: full flow.** Complete all steps 1–9.",
    };

    // Build diff section.
    let diffSection: string;
    if (mode === "request") {
        // Keep this order aligned with the target-branch policy in instructions.ts.
        let base: string | null = null;
        if (provider === "github") {
            const defaultBranchResult = await pi.exec(
                "gh",
                ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"],
                { cwd, timeout: 10000 },
            );
            const defaultBranch = defaultBranchResult.code === 0 ? defaultBranchResult.stdout.trim() : "";
            if (defaultBranch) {
                const refResult = await git(pi, ["rev-parse", "--verify", `origin/${defaultBranch}`], cwd);
                if (refResult.code === 0) base = `origin/${defaultBranch}`;
            }
        } else {
            const [developResult, mainResult, masterResult] = await Promise.all([
                git(pi, ["rev-parse", "--verify", "origin/develop"], cwd),
                git(pi, ["rev-parse", "--verify", "origin/main"], cwd),
                git(pi, ["rev-parse", "--verify", "origin/master"], cwd),
            ]);
            base = developResult.code === 0
                ? "origin/develop"
                : mainResult.code === 0
                  ? "origin/main"
                  : masterResult.code === 0
                    ? "origin/master"
                    : null;
        }

        if (!base) {
            diffSection =
                `## Diff vs base\n(no local target-branch ref found — inspect the target branch before creating the review request)`;
        } else {
            const prDiffResult = await git(pi, ["diff", `${base}...HEAD`], cwd);
            if (prDiffResult.code !== 0) {
                diffSection = `## Diff vs \`${base}\`\n(could not read the diff: ${prDiffResult.stderr || `exit code ${prDiffResult.code}`})`;
            } else {
                diffSection = prDiffResult.stdout
                    ? `## Diff vs \`${base}\`\n\`\`\`diff\n${truncate(prDiffResult.stdout, 14000)}\n\`\`\``
                    : `## Diff vs \`${base}\`\n(no diff found against \`${base}\`)`;
            }
        }
    } else {
        const parts: string[] = [];
        if (staged) parts.push(`### Staged\n\`\`\`diff\n${truncate(staged, 8000)}\n\`\`\``);
        if (unstaged) parts.push(`### Unstaged\n\`\`\`diff\n${truncate(unstaged, 8000)}\n\`\`\``);
        diffSection =
            parts.length > 0
                ? `## Changes\n\n${parts.join("\n\n")}`
                : `## Changes\n\n(no changes detected — working tree is clean)`;
    }

    const lines: string[] = [
        `## Git Integration — ${mode} mode`,
        "",
        modeNote[mode],
        "",
        `## Branch`,
        `\`${branch || "(unknown)"}\``,
        "",
        `## Git Status`,
        "```",
        status || "(clean)",
        "```",
        "",
        diffSection,
        "",
        `## Recent Commits`,
        "```",
        log || "(no commits yet)",
        "```",
        "",
        "---",
        "",
        "Check for and read `CONTRIBUTING.md` first when it is available. It is the " +
        "repository's source of truth for the rules it defines; use Git Integration's fallback " +
        "defaults only for topics it does not cover.",
        "If `CONTRIBUTING.md` is missing or unreadable, mention that and use the fallback rules.",
        "",
        "Begin by reading `CONTRIBUTING.md` before reviewing or grouping changes.",
        "",
        "Begin.",
    ];

    return lines.join("\n");
}
