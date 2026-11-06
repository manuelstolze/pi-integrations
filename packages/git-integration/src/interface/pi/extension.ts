import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import { isToolCallEventType, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { errorMessage, HeraldError } from "../../application/errors.js";
import type { CommitInputCheckPort, PreparedStageProposal, RequestInputCheckPort } from "../../application/ports/stage-input-check-ports.js";
import { checkStageCommandInput, prepareStageProposal, type StageCommandCheckResult } from "../../application/use-cases/prepare-stage-proposal.js";
import { prepareHeraldRun } from "../../application/use-cases/prepare-herald-run.js";
import type { GitRepositoryPort } from "../../application/ports/git-repository-port.js";
import type { HostingProviderPort } from "../../application/ports/hosting-provider-port.js";
import type { GitMode } from "../../domain/git-mode.js";
import type { HostingProvider } from "../../domain/hosting-provider.js";
import type { HeraldSettingsPort } from "../../application/ports/herald-settings-port.js";
import { resolveHeraldSettings } from "../../domain/herald-settings.js";
import {
  assessUserReply, completeStage, createStageApprovalState, finishCommandAttempt, invalidateStageApproval,
  markProposalDisplayed, proposeStage, recordUserReply, reserveCommandAttempt,
  type ProposalIdentity, type ReplyAssessment, type StageApprovalState, type StageProposal,
} from "../../domain/stage-approval.js";
import { HeraldModelController } from "./herald-model-controller.js";
import { parseHeraldMode } from "./mode-parser.js";
import { renderGitIntegrationInstructions } from "./render-instructions.js";
import { renderHeraldTask } from "./render-task.js";
import { renderStageProposal } from "./render-stage-proposal.js";

export interface HeraldAdapters {
  git: GitRepositoryPort;
  hosting: HostingProviderPort;
  commitInputChecks: CommitInputCheckPort;
  requestInputChecks(provider: HostingProvider): RequestInputCheckPort;
}

export type HeraldAdapterFactory = (cwd: string) => HeraldAdapters;

const FINISH_TOOL = "herald_finish";
const PROPOSE_COMMITS_TOOL = "herald_propose_commits";
const PROPOSE_REQUEST_TOOL = "herald_propose_request";
const REPORT_REPLY_TOOL = "herald_report_reply";
type WorkflowResult = "completed" | "failed" | "cancelled";
interface ActiveRun {
  mode: GitMode;
  provider: HostingProvider | null;
  sessionId: string;
  runId: string;
  adapters: HeraldAdapters;
  instructions: string;
  activatedTools: string[];
  approvalState?: StageApprovalState;
  preparedProposal?: PreparedStageProposal;
  preparedProposalId?: string;
  pendingDisplayProposalId?: string;
  runningAction?: { toolCallId: string; identity: ProposalIdentity; commandIndex: number; command: string };
  result?: WorkflowResult;
  outcome?: "completed" | "aborted" | "error";
}

export function registerGitIntegration(
  pi: ExtensionAPI,
  createAdapters: HeraldAdapterFactory,
  settings: HeraldSettingsPort = { read: async () => ({ sources: [], problems: [] }) },
): void {
  const models = new HeraldModelController(pi);
  let activeRun: ActiveRun | null = null;
  let starting: Promise<void> | null = null;
  let finishing: Promise<void> | null = null;
  let cancelling: Promise<void> | null = null;
  let closing = false;
  let generation = 0;

  const clear = (ctx: ExtensionContext) => {
    if (activeRun?.activatedTools.length) {
      const owned = new Set(activeRun.activatedTools);
      pi.setActiveTools(pi.getActiveTools().filter((name) => !owned.has(name)));
    }
    if (activeRun?.approvalState) invalidateStageApproval(activeRun.approvalState);
    activeRun = null;
    ctx.ui.setStatus("herald", undefined);
  };
  const finish = (ctx: ExtensionContext): Promise<void> => {
    if (finishing) return finishing;
    finishing = models.restore(ctx).finally(() => {
      clear(ctx);
      finishing = null;
    });
    return finishing;
  };

  const cancel = (ctx: ExtensionCommandContext): Promise<void> => {
    if (cancelling) return cancelling;
    if (!starting && !activeRun && !finishing) {
      ctx.ui.notify("No Herald workflow is active.", "info");
      return Promise.resolve();
    }
    generation += 1;
    const pending = starting;
    const running = activeRun !== null;
    cancelling = (async () => {
      if (running && !ctx.isIdle()) ctx.abort();
      await pending;
      if (running) await ctx.waitForIdle();
      await finish(ctx);
      ctx.ui.notify("Herald cancelled. Completed Git actions were not reversed.", "info");
    })().finally(() => { cancelling = null; });
    return cancelling;
  };

  pi.registerTool({
    name: FINISH_TOOL,
    label: "Finish Herald",
    description: "Report the end of the active Herald workflow. Do not call while waiting for approval or revisions.",
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    parameters: Type.Object({
      status: Type.Union([Type.Literal("completed"), Type.Literal("failed"), Type.Literal("cancelled")]),
      summary: Type.String({ description: "Short account of the workflow result." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!activeRun || activeRun.sessionId !== ctx.sessionManager.getSessionId()) {
        return { isError: true, content: [{ type: "text", text: "No Herald workflow is active in this session." }], details: undefined };
      }
      activeRun.result ??= params.status;
      return {
        content: [{ type: "text", text: `Herald result recorded: ${activeRun.result}. Give the final summary without further Git mutations.` }],
        details: { status: activeRun.result, summary: params.summary },
      };
    },
  });

  const submitProposal = (
    run: ActiveRun,
    proposal: PreparedStageProposal,
  ) => {
    if (run.runningAction) {
      return { isError: true, content: [{ type: "text" as const, text: "Wait for the current approved command to finish before changing the proposal." }], details: undefined };
    }
    if (run.approvalState?.stageCompleted && run.approvalState.proposal?.stage === proposal.stage) {
      return { isError: true, content: [{ type: "text" as const, text: "This proposal stage is already complete in the current workflow." }], details: undefined };
    }
    if (run.approvalState?.proposal && !run.approvalState.stageCompleted && !run.approvalState.invalidated) {
      if (!run.approvalState.proposalDisplayed) {
        return { isError: true, content: [{ type: "text" as const, text: "Wait until the current proposal is displayed before replacing it." }], details: undefined };
      }
      if (run.approvalState.proposal.stage !== proposal.stage && !run.approvalState.stageCompleted) {
        return { isError: true, content: [{ type: "text" as const, text: "Finish or revise the current stage before proposing another stage." }], details: undefined };
      }
    }

    const proposalId = randomUUID();
    const identity: StageProposal = {
      proposalId,
      runId: run.runId,
      sessionId: run.sessionId,
      stage: proposal.stage,
      commands: proposal.stage === "commit"
        ? proposal.commits.map((commit) => commit.command)
        : proposal.commands.map((command) => command.command),
    };
    const previous = run.approvalState;
    const base = previous && !previous.invalidated && !previous.stageCompleted
      && previous.proposal?.stage === proposal.stage
      ? previous
      : createStageApprovalState(run.runId, run.sessionId);
    const next = proposeStage(base, identity);
    if (!next) {
      return { isError: true, content: [{ type: "text" as const, text: "Herald could not replace the current proposal." }], details: undefined };
    }

    const content = renderStageProposal(proposalId, proposal);
    try {
      pi.sendMessage({ customType: "herald-proposal", content, display: true, details: { proposalId } }, { triggerTurn: false });
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: `Could not display the proposal: ${errorMessage(error)}` }], details: undefined };
    }
    run.approvalState = next;
    run.preparedProposal = proposal;
    run.preparedProposalId = proposalId;
    run.pendingDisplayProposalId = proposalId;
    const commands = proposal.stage === "commit"
      ? proposal.commits.map((commit) => commit.command)
      : proposal.commands.map((command) => command.command);
    return {
      content: [{
        type: "text" as const,
        text: `Proposal ${proposalId} was shown in chat. Wait for a later human reply. Use only these exact commands:\n${commands.map((command) => `- ${command}`).join("\n")}`,
      }],
      details: { proposalId, stage: proposal.stage, commands },
    };
  };

  pi.registerTool({
    name: PROPOSE_COMMITS_TOOL,
    label: "Propose Git commits",
    description: "Prepare a commit proposal with ordered messages and exact file paths. The extension prepares and displays the supported commands; do not generate or run commands yourself.",
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    parameters: Type.Object({
      commits: Type.Array(Type.Object({
        message: Type.String(),
        files: Type.Array(Type.String(), { minItems: 1 }),
      }, { additionalProperties: false }), { minItems: 1 }),
    }, { additionalProperties: false }),
    async execute(_id, args, _signal, _onUpdate, ctx) {
      const run = activeRun;
      if (!run || run.sessionId !== ctx.sessionManager.getSessionId() || run.result || cancelling) {
        return { isError: true, content: [{ type: "text", text: "No active Herald proposal can be created in this session." }], details: undefined };
      }
      const prepared = await prepareStageProposal({
        mode: run.mode,
        draft: { stage: "commit", commits: args.commits },
        inputChecks: run.adapters.commitInputChecks,
      });
      if (!prepared.ok) {
        return { isError: true, content: [{ type: "text", text: `Commit proposal rejected: ${prepared.reason}` }], details: undefined };
      }
      if (activeRun !== run || cancelling || run.result || ctx.signal?.aborted
        || run.sessionId !== ctx.sessionManager.getSessionId()) {
        return { isError: true, content: [{ type: "text", text: "Herald ended before the commit proposal could be displayed." }], details: undefined };
      }
      return submitProposal(run, prepared.proposal);
    },
  });

  pi.registerTool({
    name: PROPOSE_REQUEST_TOOL,
    label: "Propose review request",
    description: "Prepare a push and review-request proposal with explicit branches, title, and full description. Use a description file for multi-line text and include its exact approved text. The extension prepares and displays supported commands.",
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    parameters: Type.Object({
      sourceBranch: Type.String(),
      targetBranch: Type.String(),
      title: Type.String(),
      description: Type.String(),
      descriptionFile: Type.Optional(Type.String()),
    }, { additionalProperties: false }),
    async execute(_id, args, _signal, _onUpdate, ctx) {
      const run = activeRun;
      if (!run || run.sessionId !== ctx.sessionManager.getSessionId() || run.result || cancelling || !run.provider) {
        return { isError: true, content: [{ type: "text", text: "No active review-request proposal can be created in this session." }], details: undefined };
      }
      const descriptionInput = args.descriptionFile
        ? { kind: "file" as const, path: args.descriptionFile, contentBase64: Buffer.from(args.description, "utf8").toString("base64") }
        : { kind: "inline" as const };
      const prepared = await prepareStageProposal({
        mode: run.mode,
        draft: {
          stage: "request", provider: run.provider, sourceBranch: args.sourceBranch,
          targetBranch: args.targetBranch, title: args.title, description: args.description, descriptionInput,
          pushAlreadyCompleted: run.approvalState?.completedCommands.some((command) =>
            command.stage === "request" && command.index === 0) ?? false,
        },
        inputChecks: run.adapters.requestInputChecks(run.provider),
      });
      if (!prepared.ok) {
        return { isError: true, content: [{ type: "text", text: `Review-request proposal rejected: ${prepared.reason}` }], details: undefined };
      }
      if (activeRun !== run || cancelling || run.result || ctx.signal?.aborted
        || run.sessionId !== ctx.sessionManager.getSessionId()) {
        return { isError: true, content: [{ type: "text", text: "Herald ended before the request proposal could be displayed." }], details: undefined };
      }
      return submitProposal(run, prepared.proposal);
    },
  });

  pi.registerTool({
    name: REPORT_REPLY_TOOL,
    label: "Report proposal reply",
    description: "After a later interactive or RPC user reply, report whether the exact reply text clearly approves the named proposal without conditions. Include the reply text so Herald can bind your assessment to it. A denial, condition, or unclear reply is not approval. This reports the workflow model's interpretation and is not independent proof.",
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    parameters: Type.Object({
      proposalId: Type.String(),
      replyText: Type.String(),
      assessment: Type.Union([
        Type.Literal("unconditional-approval"), Type.Literal("denial"),
        Type.Literal("conditional"), Type.Literal("unclear"),
      ]),
    }, { additionalProperties: false }),
    async execute(_id, args, _signal, _onUpdate, ctx) {
      const run = activeRun;
      const state = run?.approvalState;
      if (!run || run.sessionId !== ctx.sessionManager.getSessionId() || run.result || cancelling
        || ctx.signal?.aborted || !state?.proposal || !state.reply) {
        return { isError: true, content: [{ type: "text", text: "No later human reply is recorded for the current proposal." }], details: undefined };
      }
      if (state.proposal.proposalId !== args.proposalId || state.reply.proposalId !== args.proposalId
        || state.reply.runId !== run.runId || state.reply.sessionId !== run.sessionId
        || state.reply.text !== args.replyText) {
        return { isError: true, content: [{ type: "text", text: "The reply report is stale or belongs to another proposal." }], details: undefined };
      }
      const next = assessUserReply(state, {
        proposalId: args.proposalId,
        runId: run.runId,
        sessionId: run.sessionId,
        replyId: state.reply.replyId,
        assessment: args.assessment as ReplyAssessment,
      });
      if (next === state) {
        return { isError: true, content: [{ type: "text", text: "The reply report could not be bound to the current user reply." }], details: undefined };
      }
      run.approvalState = next;
      return {
        content: [{ type: "text", text: next.approved
          ? `Proposal ${args.proposalId} is approved according to the recorded user reply.`
          : `Proposal ${args.proposalId} is not approved. Ask for clarification or prepare a revised proposal.` }],
        details: { proposalId: args.proposalId, approved: next.approved },
      };
    },
  });

  pi.on("input", (event, ctx) => {
    const run = activeRun;
    const state = run?.approvalState;
    if (!run || run.result || cancelling || !state?.proposal || run.sessionId !== ctx.sessionManager.getSessionId()
      || !state.proposalDisplayed || (event.source !== "interactive" && event.source !== "rpc")) return;
    const reply = recordUserReply(state, {
      proposalId: state.proposal.proposalId,
      runId: run.runId,
      sessionId: run.sessionId,
      replyId: randomUUID(),
      source: event.source,
      text: event.text,
    });
    if (reply) run.approvalState = reply;
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!activeRun || !isToolCallEventType("bash", event)) return;

    const run = activeRun;
    const command = event.input.command;
    const toolCallId = event.toolCallId || randomUUID();
    const actions = [
      {
        detected: /\bgit\b[^;\n|]*\bcommit\b/.test(command),
        label: "create a Git commit",
        allowed: run.mode === "commit" || run.mode === "full",
      },
      {
        detected: /\bgit\b[^;\n|]*\bpush\b/.test(command),
        label: "push Git changes",
        allowed: run.mode === "request" || run.mode === "full",
      },
      {
        detected: /\bglab\b[^;\n|]*\bmr\s+create\b/.test(command),
        label: "create a GitLab merge request",
        allowed: run.mode === "request" || run.mode === "full",
      },
      {
        detected: /\bgh\b[^;\n|]*\bpr\s+create\b/.test(command),
        label: "create a GitHub pull request",
        allowed: run.mode === "request" || run.mode === "full",
      },
    ].filter((action) => action.detected);
    if (actions.length === 0) return;

    const block = (reason: string) => ({ block: true, reason });
    if (run.result) return block("Herald has reported its result. Further Git mutations are blocked until cleanup.");
    const blockedActions = actions.filter((action) => !action.allowed);
    if (blockedActions.length > 0) {
      const actionLabel = blockedActions.map((action) => action.label).join(", ");
      return block(`Git Integration blocked ${actionLabel} in ${run.mode} mode.`);
    }
    if (!ctx.hasUI) return block("Git Integration blocked the command because no user interface is available.");
    if (run.sessionId !== ctx.sessionManager?.getSessionId?.()) return block("Git Integration blocked the command because the session changed.");
    if (run.runningAction) return block("Git Integration blocked another detected action while an approved action is running.");

    const state = run.approvalState;
    const proposal = run.preparedProposal;
    if (!state?.proposal || !proposal || !state.proposalDisplayed || !state.approved || !state.reply
      || run.preparedProposalId !== state.proposal.proposalId) {
      return block("Git Integration blocked the command because there is no current approved proposal.");
    }
    if (state.proposal.runId !== run.runId || state.proposal.sessionId !== run.sessionId) {
      return block("Git Integration blocked the command because its proposal belongs to another run or session.");
    }

    const commandIndex = state.proposal.commands.findIndex((approvedCommand, index) =>
      approvedCommand === command && state.attempts[index]?.status === "unused");
    if (commandIndex < 0) return block("Git Integration blocked the command because it does not exactly match an unused approved command.");
    const identity = {
      proposalId: state.proposal.proposalId,
      runId: state.proposal.runId,
      sessionId: state.proposal.sessionId,
    };
    const reserved = reserveCommandAttempt(state, identity, commandIndex, command);
    if (!reserved) return block("Git Integration blocked the command because its approval or attempt is no longer available.");

    run.approvalState = reserved;
    run.runningAction = { toolCallId, identity, commandIndex, command };
    let inputCheck: StageCommandCheckResult;
    try {
      inputCheck = proposal.stage === "commit"
        ? await checkStageCommandInput({
          mode: run.mode,
          proposal,
          commandIndex,
          command,
          inputChecks: run.adapters.commitInputChecks,
        })
        : await checkStageCommandInput({
          mode: run.mode,
          proposal,
          commandIndex,
          command,
          inputChecks: run.adapters.requestInputChecks(proposal.provider),
        });
    } catch (error) {
      inputCheck = { allowed: false as const, reason: errorMessage(error) };
    }

    const stillCurrent = activeRun === run && run.runningAction?.toolCallId === toolCallId
      && run.approvalState?.proposal?.proposalId === identity.proposalId
      && run.approvalState.approved && !cancelling && !run.result && !ctx.signal?.aborted
      && run.sessionId === ctx.sessionManager.getSessionId();
    if (!inputCheck.allowed || !stillCurrent) {
      const currentState = run.approvalState;
      if (activeRun === run && run.runningAction?.toolCallId === toolCallId && currentState) {
        const failed = finishCommandAttempt(currentState, identity, commandIndex, command, false);
        if (failed) run.approvalState = failed;
        run.runningAction = undefined;
      }
      return block(inputCheck.allowed
        ? "Git Integration blocked the command because its approval changed before dispatch."
        : inputCheck.reason);
    }
  });

  pi.on("tool_execution_end", (event, ctx) => {
    const run = activeRun;
    const action = run?.runningAction;
    if (!run || !action || event.toolName !== "bash" || event.toolCallId !== action.toolCallId
      || run.runId !== action.identity.runId || run.sessionId !== action.identity.sessionId
      || ctx.sessionManager?.getSessionId?.() !== action.identity.sessionId) return;

    const state = run.approvalState;
    if (!state || state.proposal?.proposalId !== action.identity.proposalId) {
      run.runningAction = undefined;
      return;
    }
    const succeeded = !event.isError;
    const finished = finishCommandAttempt(state, action.identity, action.commandIndex, action.command, succeeded);
    run.runningAction = undefined;
    if (!finished) return;
    let nextState = finished;
    if (succeeded && nextState.attempts.length > 0 && nextState.attempts.every((attempt) => attempt.status === "succeeded")) {
      nextState = completeStage(nextState, action.identity) ?? nextState;
    }
    run.approvalState = nextState;
    if (!succeeded && state.proposal.stage === "request") run.result ??= "failed";
  });

  pi.on("agent_before_settle", (event) => {
    if (activeRun) activeRun.outcome = event.outcome;
  });

  pi.on("agent_settled", async (event, ctx) => {
    const run = activeRun;
    if (run && run.sessionId === ctx.sessionManager.getSessionId()
      && !event.aborted && run.outcome !== "error" && run.outcome !== "aborted"
      && run.pendingDisplayProposalId && run.approvalState?.proposal) {
      const identity = {
        proposalId: run.pendingDisplayProposalId,
        runId: run.runId,
        sessionId: run.sessionId,
      };
      const displayed = markProposalDisplayed(run.approvalState, identity);
      if (displayed) {
        run.approvalState = displayed;
        run.pendingDisplayProposalId = undefined;
      }
    }
    if (run && (run.result || event.aborted || run.outcome === "error" || run.outcome === "aborted")) {
      await finish(ctx);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    closing = true;
    generation += 1;
    await starting;
    await finish(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!activeRun || activeRun.sessionId !== ctx.sessionManager.getSessionId()) return;
    activeRun.outcome = undefined;
    return {
      systemPrompt: `${event.systemPrompt}\n\n---\n\n${activeRun.instructions}`,
    };
  });

  pi.registerCommand("herald", {
    description: "Git commit and review-request agent · [commit|request|cancel] or full",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      if (args.trim().toLowerCase() === "cancel") {
        await cancel(ctx);
        return;
      }
      if (starting || activeRun || finishing || cancelling || closing) {
        ctx.ui.notify("Herald is already running or closing. Wait for completion or use /herald cancel before starting another run.", "warning");
        return;
      }
      const currentGeneration = generation;
      const sessionId = ctx.sessionManager.getSessionId();
      const isCurrent = () => generation === currentGeneration && ctx.sessionManager.getSessionId() === sessionId;
      starting = handleHeraldCommand(pi, args, ctx, createAdapters, settings, models, isCurrent,
        (instructions, mode, provider, adapters) => {
          const activeTools = pi.getActiveTools();
          const runTools = [
            FINISH_TOOL,
            REPORT_REPLY_TOOL,
            ...(mode === "request" ? [PROPOSE_REQUEST_TOOL] : [PROPOSE_COMMITS_TOOL]),
            ...(mode === "full" ? [PROPOSE_REQUEST_TOOL] : []),
          ];
          const activatedTools = runTools.filter((name) => !activeTools.includes(name));
          activeRun = {
            mode, provider, sessionId, runId: randomUUID(), adapters, instructions, activatedTools,
          };
          pi.setActiveTools([...new Set([...activeTools, ...runTools])]);
          ctx.ui.setStatus("herald", `Herald: ${mode} — /herald cancel to exit`);
        },
        () => clear(ctx),
      ).finally(() => { starting = null; });
      await starting;
    },
  });
}

async function handleHeraldCommand(
  pi: ExtensionAPI,
  args: string,
  ctx: ExtensionCommandContext,
  createAdapters: HeraldAdapterFactory,
  settings: HeraldSettingsPort,
  models: HeraldModelController,
  isCurrent: () => boolean,
  arm: (instructions: string, mode: GitMode, provider: HostingProvider | null, adapters: HeraldAdapters) => void,
  disarm: () => void,
): Promise<void> {
  if (!ctx.hasUI) return;

  let mode;
  try {
    mode = parseHeraldMode(args);
  } catch (error) {
    ctx.ui.notify(errorMessage(error), "error");
    return;
  }

  try {
    await ctx.waitForIdle();
    if (!isCurrent()) return;
    const snapshot = await settings.read({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });
    if (!isCurrent()) return;
    const resolved = resolveHeraldSettings(snapshot.sources);
    resolved.problems.unshift(...snapshot.problems);
    const adapters = createAdapters(ctx.cwd);
    const prepared = await prepareHeraldRun({
      mode,
      git: adapters.git,
      hosting: adapters.hosting,
    });

    if (!isCurrent()) return;
    if (resolved.model || resolved.thinkingLevel || resolved.problems.length > 0) {
      await models.start(ctx, resolved);
      if (!isCurrent()) return;
    }
    ctx.ui.notify(`Herald — ${mode} mode`, "info");
    arm(renderGitIntegrationInstructions(prepared.provider), mode, prepared.provider, adapters);
    pi.sendUserMessage(renderHeraldTask(prepared));
  } catch (error) {
    await models.restore(ctx);
    disarm();
    if (!isCurrent()) return;
    const message = error instanceof HeraldError
      ? error.message
      : `Could not collect Git context: ${errorMessage(error)}`;
    ctx.ui.notify(message, "error");
  }
}
