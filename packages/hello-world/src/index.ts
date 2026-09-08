import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

/**
 * Example Pi extension: registers a `/hello [name]` slash command that
 * greets the user via the Pi UI. Use this package as a template when
 * building new extensions in this repository.
 */
const helloWorld: ExtensionFactory = (pi) => {
  pi.registerCommand("hello", {
    description: "Say hello from the pi-hello-world extension",
    handler: async (args, ctx) => {
      const name = args.trim() || "world";
      ctx.ui.notify(`Hello, ${name}! 👋 (from @manuelstolze/pi-hello-world)`);
    },
  });
};

export default helloWorld;
