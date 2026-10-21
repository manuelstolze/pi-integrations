import type { ExtensionAPI, ExtensionContext, ModelSelectEvent, ThinkingLevelSelectEvent } from "@earendil-works/pi-coding-agent";
import type { HeraldThinkingLevel, ResolvedHeraldSettings, SettingsProblem } from "../../domain/herald-settings.js";
import { renderSettingsWarning } from "./render-settings-warning.js";

type Model = NonNullable<ExtensionContext["model"]>;
interface ExpectedThinking {
  previous: HeraldThinkingLevel;
  level?: HeraldThinkingLevel;
}
interface RunSelection {
  sessionId: string;
  session: ExtensionContext["sessionManager"];
  initialEntries: Set<string>;
  ownEntries: Set<string>;
  originalModel: Model | undefined;
  currentModel: Model | undefined;
  originalThinking: HeraldThinkingLevel;
  appliedThinking: HeraldThinkingLevel;
  ownsModel: boolean;
  ownsThinking: boolean;
  expectedModels: Model[];
  expectedThinking: ExpectedThinking[];
}

function sameModel(left: Model | undefined, right: Model | undefined): boolean {
  return left?.provider === right?.provider && left?.id === right?.id;
}

export class HeraldModelController {
  private run: RunSelection | null = null;
  private restoring: Promise<void> | null = null;

  constructor(private readonly pi: ExtensionAPI) {
    pi.on("model_select", (event) => this.modelSelected(event));
    pi.on("thinking_level_select", (event) => this.thinkingSelected(event));
  }

  async start(ctx: ExtensionContext, settings: ResolvedHeraldSettings): Promise<void> {
    if (this.run) throw new Error("A Herald model selection is already active.");
    const run: RunSelection = {
      sessionId: ctx.sessionManager.getSessionId(),
      session: ctx.sessionManager,
      initialEntries: new Set(ctx.sessionManager.getBranch().map((entry) => entry.id)),
      ownEntries: new Set(),
      originalModel: ctx.model,
      currentModel: ctx.model,
      originalThinking: this.pi.getThinkingLevel(),
      appliedThinking: this.pi.getThinkingLevel(),
      ownsModel: false,
      ownsThinking: false,
      expectedModels: [],
      expectedThinking: [],
    };
    this.run = run;
    const problems = [...settings.problems];
    const reference = settings.model?.value;
    if (reference) {
      const problem = (reason: SettingsProblem["reason"]) => problems.push({
        field: "herald.model", path: settings.model!.path, reason, provider: reference.provider,
      });
      const model = ctx.modelRegistry.find(reference.provider, reference.id);
      if (!model) {
        problem("unknown-model");
      } else if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
        problem("authentication");
      } else if (!sameModel(model, run.currentModel)) {
        // Without a previous model, a temporary switch cannot be restored.
        if (!run.originalModel) {
          problem("selection");
        } else {
          try {
            run.ownsModel = true;
            run.ownsThinking = true;
            if (!await this.selectModel(run, model)) {
              run.ownsModel = false;
              run.ownsThinking = false;
              problem("authentication");
            }
          } catch {
            problem("selection");
            if (!sameModel(run.currentModel, run.originalModel)) {
              try {
                if (!await this.selectModel(run, run.originalModel)) throw new Error("Model restoration was rejected.");
              } catch {
                throw new Error("Could not restore the chat model. Use /model and /login to restore it before retrying Herald.");
              }
            }
            run.ownsModel = false;
          }
        }
      }
    }

    if (this.run !== run || ctx.sessionManager.getSessionId() !== run.sessionId) return;
    if (settings.thinkingLevel || run.ownsThinking) {
      const requested = settings.thinkingLevel?.value ?? run.originalThinking;
      run.ownsThinking = true;
      this.selectThinking(run, requested);
      if (settings.thinkingLevel?.value && this.pi.getThinkingLevel() !== requested) {
        problems.push({ field: "herald.thinkingLevel", path: settings.thinkingLevel.path, reason: "unsupported-thinking", requestedThinking: requested });
      }
    }
    run.appliedThinking = this.pi.getThinkingLevel();
    const fallback = {
      model: run.currentModel ? `${run.currentModel.provider}/${run.currentModel.id}` : "(none)",
      thinkingLevel: this.pi.getThinkingLevel(),
    };
    for (const problem of problems) ctx.ui.notify(renderSettingsWarning(problem, fallback), "warning");
  }

  restore(ctx: ExtensionContext): Promise<void> {
    if (this.restoring) return this.restoring;
    const run = this.run;
    if (!run) return Promise.resolve();
    if (ctx.sessionManager.getSessionId() !== run.sessionId) {
      this.run = null;
      return Promise.resolve();
    }
    this.restoring = this.restoreRun(run, ctx).finally(() => {
      if (this.run === run) this.run = null;
      this.restoring = null;
    });
    return this.restoring;
  }

  private async restoreRun(run: RunSelection, ctx: ExtensionContext): Promise<void> {
    // Transcript entries are synchronous, even when another extension delays events.
    for (const entry of run.session.getBranch()) {
      if (run.initialEntries.has(entry.id) || run.ownEntries.has(entry.id)) continue;
      if (entry.type === "model_change") {
        run.ownsModel = false;
        run.ownsThinking = false;
      }
      if (entry.type === "thinking_level_change") run.ownsThinking = false;
    }
    if (!sameModel(ctx.model, run.currentModel)) {
      run.currentModel = ctx.model;
      run.ownsModel = false;
      run.ownsThinking = false;
    }
    if (this.pi.getThinkingLevel() !== run.appliedThinking) run.ownsThinking = false;
    const targetThinking = run.ownsThinking ? run.originalThinking : this.pi.getThinkingLevel();
    const manualThinking = !run.ownsThinking;
    const restoreModel = run.ownsModel && run.originalModel && !sameModel(run.currentModel, run.originalModel);
    try {
      if (restoreModel && !await this.selectModel(run, run.originalModel!)) {
        throw new Error("Model restoration was rejected.");
      }
      if (run.ownsThinking || restoreModel) {
        this.selectThinking(run, targetThinking);
        if (this.pi.getThinkingLevel() !== targetThinking && manualThinking) {
          ctx.ui.notify(
            `Herald restored the previous model, but it does not support your selected thinking level. Using ${this.pi.getThinkingLevel()}. Run /thinking to select a supported level, or /model to choose a different model.`,
            "warning",
          );
        }
      }
    } catch {
      ctx.ui.notify("Herald could not restore the previous model or thinking level. Run /model and /thinking to restore your choices. Check /login if the previous model is unavailable.", "warning");
    }
  }

  private async selectModel(run: RunSelection, model: Model): Promise<boolean> {
    const before = new Set(run.session.getBranch().map((entry) => entry.id));
    const thinking = { previous: this.pi.getThinkingLevel() } as ExpectedThinking;
    run.expectedModels.push(model);
    run.expectedThinking.push(thinking);
    try {
      const selected = await this.pi.setModel(model);
      if (selected) run.currentModel = model;
      return selected;
    } finally {
      const changes = run.session.getBranch().filter((entry) => !before.has(entry.id));
      const index = changes.findIndex((entry) =>
        entry.type === "model_change" && entry.provider === model.provider && entry.modelId === model.id);
      if (index >= 0) {
        run.ownEntries.add(changes[index].id);
        // Pi records an automatic thinking change immediately after the model change.
        if (changes[index + 1]?.type === "thinking_level_change") run.ownEntries.add(changes[index + 1].id);
      }
      this.finishThinking(run, thinking);
      // Model events are awaited by Pi. A remaining entry means selection failed.
      const pending = run.expectedModels.indexOf(model);
      if (pending >= 0) run.expectedModels.splice(pending, 1);
    }
  }

  private selectThinking(run: RunSelection, level: HeraldThinkingLevel): void {
    const before = new Set(run.session.getBranch().map((entry) => entry.id));
    const expected: ExpectedThinking = { previous: this.pi.getThinkingLevel() };
    run.expectedThinking.push(expected);
    try {
      this.pi.setThinkingLevel(level);
    } finally {
      const change = run.session.getBranch().find((entry) => !before.has(entry.id) && entry.type === "thinking_level_change");
      if (change) run.ownEntries.add(change.id);
      this.finishThinking(run, expected);
    }
  }

  private finishThinking(run: RunSelection, expected: ExpectedThinking): void {
    expected.level = this.pi.getThinkingLevel();
    if (expected.previous === expected.level) {
      const index = run.expectedThinking.indexOf(expected);
      if (index >= 0) run.expectedThinking.splice(index, 1);
    }
  }

  private modelSelected(event: ModelSelectEvent): void {
    const run = this.run;
    if (!run) return;
    run.currentModel = event.model;
    const index = run.expectedModels.findIndex((model) => sameModel(model, event.model));
    if (index >= 0) run.expectedModels.splice(index, 1);
    else {
      run.ownsModel = false;
      run.ownsThinking = false;
    }
  }

  private thinkingSelected(event: ThinkingLevelSelectEvent): void {
    const run = this.run;
    if (!run) return;
    const index = run.expectedThinking.findIndex((expected) =>
      expected.previous === event.previousLevel && (expected.level === undefined || expected.level === event.level));
    if (index >= 0) run.expectedThinking.splice(index, 1);
    else run.ownsThinking = false;
  }
}
