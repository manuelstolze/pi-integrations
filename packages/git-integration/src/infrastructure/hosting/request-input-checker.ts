import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  InputCheckResult,
  PreparedRequestStageProposal,
  ProposalPreparationResult,
  RequestInputCheckPort,
  RequestStageDraft,
} from "../../application/ports/stage-input-check-ports.js";
import type { HostingProvider } from "../../domain/hosting-provider.js";
import { providerHintFromOriginUrl } from "../../domain/hosting-provider.js";
import type { ProcessResult, ProcessRunner } from "../process/process-runner.js";

interface RequestInputs {
  provider: HostingProvider;
  originUrl: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  descriptionInput: RequestStageDraft["descriptionInput"];
  pushAlreadyCompleted: boolean;
}

/** Prepares exact push and hosting commands and checks their approved inputs. */
export class ReviewRequestInputChecker implements RequestInputCheckPort {
  private readonly cwd: string;

  constructor(
    private readonly runner: ProcessRunner,
    cwd: string,
    private readonly provider: HostingProvider,
  ) {
    this.cwd = resolve(cwd);
  }

  async prepare(draft: RequestStageDraft): Promise<ProposalPreparationResult<PreparedRequestStageProposal>> {
    try {
      const validationError = this.validateDraft(draft);
      if (validationError) return { ok: false, reason: validationError };
      if (draft.provider !== this.provider) return { ok: false, reason: "The request provider does not match the active hosting provider." };

      const local = await this.currentRepositoryInputs(draft.sourceBranch, draft.targetBranch);
      if (!local.ok) return local;
      const input: RequestInputs = {
        provider: this.provider,
        originUrl: local.originUrl,
        sourceBranch: draft.sourceBranch,
        targetBranch: draft.targetBranch,
        title: draft.title,
        description: draft.description,
        descriptionInput: draft.descriptionInput,
        pushAlreadyCompleted: draft.pushAlreadyCompleted === true,
      };
      const commands = await this.buildCommands(input);
      if (!commands.ok) return commands;
      return { ok: true, proposal: { stage: "request", ...input, commands: commands.commands } };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Could not check the review-request inputs." };
    }
  }

  async verify(proposal: PreparedRequestStageProposal, action: "push" | "create"): Promise<InputCheckResult> {
    try {
      if (proposal.stage !== "request" || proposal.provider !== this.provider) {
        return { ok: false, reason: "The request proposal does not match the active provider." };
      }
      const validationError = this.validateDraft(proposal);
      if (validationError) return { ok: false, reason: validationError };
      const local = await this.currentRepositoryInputs(proposal.sourceBranch, proposal.targetBranch);
      if (!local.ok) return local;

      const input: RequestInputs = {
        provider: proposal.provider,
        originUrl: local.originUrl,
        sourceBranch: proposal.sourceBranch,
        targetBranch: proposal.targetBranch,
        title: proposal.title,
        description: proposal.description,
        descriptionInput: proposal.descriptionInput,
        pushAlreadyCompleted: proposal.pushAlreadyCompleted,
      };
      const current = proposal.commands.find((command) => command.action === action);
      if (!current) return { ok: false, reason: `The ${action} command is not in this proposal.` };
      let expectedCommand = `git push origin ${shellQuote(`${input.sourceBranch}:${input.sourceBranch}`)}`;
      let descriptionHash: string | undefined;
      if (action === "create") {
        const create = await this.expectedCreateCommand(input);
        if ("ok" in create) return create;
        expectedCommand = create.command;
        descriptionHash = create.descriptionHash;
      }
      const expectedSnapshot = this.snapshot({
        ...input,
        action,
        ...(action === "create" ? { descriptionHash } : {}),
      });
      if (current.command !== expectedCommand) {
        return { ok: false, reason: "The request command does not match its approved inputs." };
      }
      if (current.inputSnapshot !== expectedSnapshot) {
        return { ok: false, reason: "The approved branch, remote, title, description, or description file has changed." };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Could not verify the review-request inputs." };
    }
  }

  private validateDraft(draft: RequestStageDraft): string | undefined {
    if (!draft.sourceBranch.trim() || !draft.targetBranch.trim()) return "The request needs explicit source and target branches.";
    if (!draft.title.trim() || /[\0\r\n]/.test(draft.title)) return "The request title must be a non-empty single line.";
    if (!draft.description.trim()) return "The request needs a full description.";
    if (draft.descriptionInput.kind === "inline" && /[\0\r\n]/.test(draft.description)) {
      return "A multi-line request description needs an explicitly approved description file.";
    }
    if (draft.descriptionInput.kind === "file"
      && (!draft.descriptionInput.path.trim() || draft.descriptionInput.path === "-"
        || /[\0\r\n;|]/.test(draft.descriptionInput.path))) {
      return "The description file needs an explicit supported path.";
    }
    return undefined;
  }

  private async currentRepositoryInputs(
    sourceBranch: string,
    targetBranch: string,
  ): Promise<{ ok: true; originUrl: string } | { ok: false; reason: string }> {
    for (const branch of [sourceBranch, targetBranch]) {
      const check = await this.runGit(["check-ref-format", "--branch", branch], true);
      if (check.code !== 0) return { ok: false, reason: `Branch name "${branch}" is not supported.` };
    }
    const branch = await this.runGit(["branch", "--show-current"]);
    if (branch.stdout !== sourceBranch) return { ok: false, reason: "The approved source branch is not the current branch." };
    const remote = await this.runGit(["remote", "get-url", "origin"], true);
    if (remote.code !== 0 || !remote.stdout.trim()) return { ok: false, reason: "The origin remote cannot be checked." };
    const hint = providerHintFromOriginUrl(remote.stdout.trim());
    if (hint && hint !== this.provider) return { ok: false, reason: "The origin remote does not match the selected hosting provider." };
    return { ok: true, originUrl: remote.stdout.trim() };
  }

  private async buildCommands(input: RequestInputs): Promise<
    | { ok: true; commands: PreparedRequestStageProposal["commands"] }
    | { ok: false; reason: string }
  > {
    const description = await this.checkDescription(input.description, input.descriptionInput);
    if (!description.ok) return description;

    const commands: PreparedRequestStageProposal["commands"][number][] = [];
    if (!input.pushAlreadyCompleted) {
      commands.push({
        action: "push",
        command: `git push origin ${shellQuote(`${input.sourceBranch}:${input.sourceBranch}`)}`,
        inputSnapshot: this.snapshot({ ...input, action: "push" }),
      });
    }
    commands.push({
      action: "create",
      command: this.createCommand(input, description.filePath),
      inputSnapshot: this.snapshot({ ...input, action: "create", descriptionHash: description.hash }),
    });
    return { ok: true, commands };
  }

  private createCommand(input: RequestInputs, descriptionFile: string | undefined): string {
    return input.provider === "github"
      ? this.githubCommand(input, descriptionFile)
      : this.gitlabCommand(input, descriptionFile);
  }

  private async expectedCreateCommand(input: RequestInputs): Promise<
    | { command: string; descriptionHash: string }
    | { ok: false; reason: string }
  > {
    const description = await this.checkDescription(input.description, input.descriptionInput);
    return description.ok
      ? { command: this.createCommand(input, description.filePath), descriptionHash: description.hash }
      : description;
  }

  private githubCommand(input: RequestInputs, descriptionFile: string | undefined): string {
    const descriptionFlag = descriptionFile
      ? `--body-file ${shellQuote(descriptionFile)}`
      : `--body ${shellQuote(input.description)}`;
    return `gh pr create --base ${shellQuote(input.targetBranch)} --head ${shellQuote(input.sourceBranch)} --title ${shellQuote(input.title)} ${descriptionFlag}`;
  }

  private gitlabCommand(input: RequestInputs, descriptionFile: string | undefined): string {
    const descriptionFlag = descriptionFile
      ? `--description-file ${shellQuote(descriptionFile)}`
      : `--description ${shellQuote(input.description)}`;
    return `glab mr create --source-branch ${shellQuote(input.sourceBranch)} --target-branch ${shellQuote(input.targetBranch)} --title ${shellQuote(input.title)} ${descriptionFlag} --remove-source-branch --yes`;
  }

  private async checkDescription(
    description: string,
    source: RequestStageDraft["descriptionInput"],
  ): Promise<{ ok: true; filePath?: string; hash: string } | { ok: false; reason: string }> {
    if (source.kind === "inline") {
      return { ok: true, hash: hashText(description) };
    }

    let approvedBytes: Buffer;
    try {
      approvedBytes = Buffer.from(source.contentBase64, "base64");
      if (approvedBytes.toString("base64") !== source.contentBase64) {
        return { ok: false, reason: "The approved description file bytes are not valid base64." };
      }
      const approvedText = new TextDecoder("utf-8", { fatal: true }).decode(approvedBytes);
      if (approvedText !== description) return { ok: false, reason: "The description text does not match the approved file bytes." };
      const filePath = resolve(this.cwd, source.path);
      const actualBytes = await readFile(filePath);
      if (!actualBytes.equals(approvedBytes)) return { ok: false, reason: "The description file bytes have changed." };
      return { ok: true, filePath: source.path, hash: hashBuffer(approvedBytes) };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "The description file cannot be checked." };
    }
  }

  private snapshot(input: RequestInputs & { action: "push" | "create"; descriptionHash?: string }): string {
    return hashText(JSON.stringify({
      action: input.action,
      provider: input.provider,
      originUrl: input.originUrl,
      sourceBranch: input.sourceBranch,
      targetBranch: input.targetBranch,
      pushAlreadyCompleted: input.pushAlreadyCompleted,
      ...(input.action === "create" ? {
        title: input.title,
        description: input.description,
        descriptionInput: input.descriptionInput,
        descriptionHash: input.descriptionHash,
      } : {}),
    }));
  }

  private async runGit(args: string[], allowFailure = false): Promise<ProcessResult> {
    const result = await this.runner.run("git", args);
    if (!allowFailure && result.code !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
    return result;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashBuffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
