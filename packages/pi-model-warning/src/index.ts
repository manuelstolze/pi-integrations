import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { warnOnOpusActivation } from "./application/use-cases/warn-on-opus-activation.js";
import { registerModelWarningExtension } from "./interface/pi/extension.js";

export { isOpusModelId } from "./domain/model-warning.js";

const modelWarning: (pi: ExtensionAPI) => void = (pi) => {
  registerModelWarningExtension(pi, warnOnOpusActivation);
};

export default modelWarning;
