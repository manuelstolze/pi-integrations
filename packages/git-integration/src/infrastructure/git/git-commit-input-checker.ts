import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  CommitInputCheckPort,
  CommitStageDraft,
  InputCheckResult,
  PreparedCommitStageProposal,
  ProposalPreparationResult,
} from "../../application/ports/stage-input-check-ports.js";
import type { ProcessResult, ProcessRunner } from "../process/process-runner.js";

interface IndexEntry {
  mode: string;
  objectId: string;
  stage: number;
  path: string;
}

interface PathSnapshot {
  path: string;
  index: readonly IndexEntry[];
  stagedDiffHash: string;
  unstagedDiffHash: string;
  worktree: { kind: "missing" } | { kind: "file"; mode: string; blobId: string };
}

/** Builds canonical `git add && git commit` commands and checks their Git inputs. */
export class GitCommitInputChecker implements CommitInputCheckPort {
  private readonly cwd: string;

  constructor(private readonly runner: ProcessRunner, cwd: string) {
    this.cwd = resolve(cwd);
  }

  async prepare(draft: CommitStageDraft): Promise<ProposalPreparationResult<PreparedCommitStageProposal>> {
    try {
      if (draft.commits.length === 0) return { ok: false, reason: "A commit proposal needs at least one commit." };
      const commits: PreparedCommitStageProposal["commits"][number][] = [];
      const plannedPaths = new Set<string>();

      for (const [index, commit] of draft.commits.entries()) {
        if (!commit.message.trim() || /[\0\r\n]/.test(commit.message)) {
          return { ok: false, reason: `Commit ${index + 1} needs a supported single-line message.` };
        }
        if (commit.files.length === 0) return { ok: false, reason: `Commit ${index + 1} needs explicit file paths.` };

        const paths: string[] = [];
        for (const file of commit.files) {
          const checked = this.validatePath(file);
          if (!checked.ok) return { ok: false, reason: checked.reason };
          if (paths.includes(checked.path) || plannedPaths.has(checked.path)) {
            return { ok: false, reason: `The commit plan repeats file path "${checked.path}".` };
          }
          paths.push(checked.path);
          plannedPaths.add(checked.path);
        }

        commits.push({
          message: commit.message,
          files: paths,
          command: canonicalCommitCommand(paths, commit.message),
          inputSnapshot: await this.snapshotFiles(paths),
        });
      }

      const initiallyStaged = await this.stagedPaths();
      const firstCommitPaths = new Set(commits[0].files);
      if (initiallyStaged.some((file) => !firstCommitPaths.has(file))) {
        return {
          ok: false,
          reason: "Existing staged changes outside the first planned commit cannot be safely included.",
        };
      }

      return { ok: true, proposal: { stage: "commit", commits } };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Could not capture the commit inputs." };
    }
  }

  async verify(proposal: PreparedCommitStageProposal, commitIndex: number): Promise<InputCheckResult> {
    try {
      const commit = proposal.commits[commitIndex];
      if (!commit) return { ok: false, reason: "The commit command is not in the proposal." };
      if (canonicalCommitCommand(commit.files, commit.message) !== commit.command) {
        return { ok: false, reason: "The commit command is not in the supported canonical form." };
      }
      if (commit.files.length === 0 || !commit.inputSnapshot) {
        return { ok: false, reason: "The commit proposal is missing checked inputs." };
      }
      const paths = commit.files.map((file) => {
        const checked = this.validatePath(file);
        if (!checked.ok) throw new Error(checked.reason);
        return checked.path;
      });
      const staged = await this.stagedPaths();
      const allowed = new Set(paths);
      if (staged.some((file) => !allowed.has(file))) {
        return { ok: false, reason: "Staged changes outside this commit would be included." };
      }
      const currentSnapshot = await this.snapshotFiles(paths);
      return currentSnapshot === commit.inputSnapshot
        ? { ok: true }
        : { ok: false, reason: "The approved commit files or index have changed." };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Could not verify the commit inputs." };
    }
  }

  private validatePath(file: string): { ok: true; path: string } | { ok: false; reason: string } {
    if (!file || file.includes("\\") || /[\0\r\n;|]/.test(file) || isAbsolute(file)) {
      return { ok: false, reason: `File path "${file}" is not supported.` };
    }
    const absolute = resolve(this.cwd, file);
    const relativePath = relative(this.cwd, absolute);
    if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return { ok: false, reason: `File path "${file}" must stay inside the repository.` };
    }
    const normalized = relativePath.split(sep).join("/");
    if (normalized !== file) return { ok: false, reason: `File path "${file}" must be a normalized repository-relative path.` };
    return { ok: true, path: normalized };
  }

  private async snapshotFiles(paths: readonly string[]): Promise<string> {
    const snapshots: PathSnapshot[] = [];
    for (const file of paths) snapshots.push(await this.snapshotFile(file));
    return createHash("sha256").update(JSON.stringify(snapshots)).digest("hex");
  }

  private async snapshotFile(file: string): Promise<PathSnapshot> {
    const pathspec = `:(literal)${file}`;
    const indexResult = await this.runGit(["ls-files", "--stage", "-z", "--", pathspec], false);
    const index = parseIndexEntries(indexResult.stdout);
    if (index.some((entry) => entry.stage !== 0)) {
      throw new Error(`Unmerged index entries for "${file}" are not supported.`);
    }
    if (index.some((entry) => entry.mode === "120000" || entry.mode === "160000")) {
      throw new Error(`Symbolic links and submodules at "${file}" are not supported.`);
    }

    const absolute = resolve(this.cwd, file);
    await this.ensureNoSymlinkParent(absolute, file);
    let fileStat: Awaited<ReturnType<typeof lstat>> | undefined;
    try {
      fileStat = await lstat(absolute);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }

    if (!fileStat && index.length === 0) {
      throw new Error(`File "${file}" does not exist in the index or working tree.`);
    }
    if (fileStat && (!fileStat.isFile() || fileStat.isSymbolicLink())) {
      throw new Error(`Only regular files are supported in commit proposals: "${file}".`);
    }
    if (fileStat && index.length === 0) {
      const ignored = await this.runGit(["check-ignore", "--no-index", "-q", "--", file], true);
      if (ignored.code === 0) throw new Error(`Ignored file "${file}" cannot be added by this proposal.`);
      if (ignored.code !== 1) throw gitError(ignored, ["check-ignore", "--no-index", "-q", "--", file]);
    }

    const stagedDiff = await this.runGit([
      "diff", "--cached", "--binary", "--full-index", "--no-ext-diff", "--no-renames", "--", pathspec,
    ]);
    const unstagedDiff = await this.runGit([
      "diff", "--binary", "--full-index", "--no-ext-diff", "--no-renames", "--", pathspec,
    ]);
    const worktree = fileStat
      ? {
        kind: "file" as const,
        mode: Number(fileStat.mode) & 0o111 ? "100755" : "100644",
        blobId: requiredOutput(await this.runGit(["hash-object", `--path=${file}`, "--", file]), ["hash-object", `--path=${file}`, "--", file]),
      }
      : { kind: "missing" as const };

    return {
      path: file,
      index,
      stagedDiffHash: createHash("sha256").update(stagedDiff.stdout).digest("hex"),
      unstagedDiffHash: createHash("sha256").update(unstagedDiff.stdout).digest("hex"),
      worktree,
    };
  }

  private async stagedPaths(): Promise<string[]> {
    const result = await this.runGit(["diff", "--cached", "--name-only", "--no-renames", "-z"]);
    return result.stdout.split("\0").filter(Boolean);
  }

  private async ensureNoSymlinkParent(absolute: string, file: string): Promise<void> {
    const relativePath = relative(this.cwd, absolute);
    let current = this.cwd;
    const parts = relativePath.split(sep);
    for (const [index, part] of parts.entries()) {
      current = resolve(current, part);
      let currentStat: Awaited<ReturnType<typeof lstat>>;
      try {
        currentStat = await lstat(current);
      } catch (error) {
        if (isMissingPathError(error)) return;
        throw error;
      }
      if (currentStat.isSymbolicLink()) throw new Error(`Symbolic-link paths are not supported: "${file}".`);
      if (index < parts.length - 1 && !currentStat.isDirectory()) {
        throw new Error(`Parent path for "${file}" is not a directory.`);
      }
    }
  }

  private async runGit(args: string[], allowFailure = false): Promise<ProcessResult> {
    const result = await this.runner.run("git", args, { trimOutput: false });
    if (!allowFailure && result.code !== 0) throw gitError(result, args);
    return result;
  }
}

function canonicalCommitCommand(files: readonly string[], message: string): string {
  const add = files.map((file) => shellQuote(`:(literal)${file}`)).join(" ");
  return `git add -- ${add} && git commit -m ${shellQuote(message)}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseIndexEntries(output: string): IndexEntry[] {
  return output.split("\0").filter(Boolean).map((record) => {
    const separator = record.indexOf("\t");
    if (separator < 0) throw new Error("Git returned an invalid index entry.");
    const [mode, objectId, stageText] = record.slice(0, separator).split(" ");
    const file = record.slice(separator + 1);
    if (!mode || !objectId || !stageText || !file) throw new Error("Git returned an incomplete index entry.");
    return { mode, objectId, stage: Number(stageText), path: file };
  }).sort((left, right) => left.stage - right.stage || left.mode.localeCompare(right.mode) || left.objectId.localeCompare(right.objectId));
}

function gitError(result: ProcessResult, args: string[]): Error {
  return new Error(`git ${args.join(" ")} failed: ${result.stderr || `exit code ${result.code}`}`);
}

function requiredOutput(result: ProcessResult, args: string[]): string {
  if (result.code !== 0) throw gitError(result, args);
  return result.stdout.trim();
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
