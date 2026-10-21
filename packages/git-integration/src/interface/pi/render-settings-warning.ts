import { THINKING_LEVELS, type SettingsProblem } from "../../domain/herald-settings.js";

export function renderSettingsWarning(
  problem: SettingsProblem,
  fallback: { model: string; thinkingLevel: string },
): string {
  const source = `${problem.field} in ${problem.path}`;
  const modelFallback = `Using chat model ${fallback.model}.`;
  switch (problem.reason) {
    case "read":
      return `Herald could not read ${source}. Its settings were not used. Using model ${fallback.model} and thinking level ${fallback.thinkingLevel}. Fix file access before the next /herald command.`;
    case "json":
      return `Herald found invalid JSON in ${problem.path}. Its settings were not used. Using model ${fallback.model} and thinking level ${fallback.thinkingLevel}. Fix the JSON syntax before the next /herald command.`;
    case "unknown-model":
      return `Herald could not find the model selected by ${source}. ${modelFallback} Open /model to find an available model. Set herald.model to its exact provider/modelId, or remove herald.model.`;
    case "authentication":
      return `Herald has no usable authentication for provider ${problem.provider} selected by ${source}. ${modelFallback} Run /login for ${problem.provider}, or configure that provider's credentials. You can also remove herald.model.`;
    case "selection":
      return `Herald could not select the model in ${source}. ${modelFallback} Check /model and /login for ${problem.provider}, then correct or remove herald.model.`;
    case "unsupported-thinking":
      return `Herald cannot use thinking level ${problem.requestedThinking} selected by ${source} with model ${fallback.model}. Using thinking level ${fallback.thinkingLevel}. Open /thinking to see supported levels. Update or remove herald.thinkingLevel.`;
    case "invalid":
      if (problem.field === "herald.model") {
        return `Herald found an invalid ${source}. ${modelFallback} Set herald.model to an exact provider/modelId from /model, or remove herald.model.`;
      }
      if (problem.field === "herald.thinkingLevel") {
        return `Herald found an invalid ${source}. Using thinking level ${fallback.thinkingLevel}. Set herald.thinkingLevel to one of ${THINKING_LEVELS.join(", ")}, subject to model support in /thinking, or remove the field.`;
      }
      return `Herald found an invalid ${source}. Using model ${fallback.model} and thinking level ${fallback.thinkingLevel}. Set herald to an object with optional model and thinkingLevel fields, or remove herald.`;
  }
}
