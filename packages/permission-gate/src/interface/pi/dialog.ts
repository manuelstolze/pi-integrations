import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, Key, Spacer, Text, matchesKey, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export type ConfirmResult = "allow-once" | "allow-session" | "allow-forever" | "deny";

const OPTIONS: Array<{ label: string; result: ConfirmResult }> = [
  { label: "Allow once", result: "allow-once" },
  { label: "Allow this session", result: "allow-session" },
  { label: "Allow forever", result: "allow-forever" },
  { label: "Deny (tell pi what to do instead)", result: "deny" },
];

const COMMAND_VIEWPORT_LINES = 8;

interface MinimalTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

export function createDialog(command: string, description: string) {
  return (
    tui: { terminal: { rows: number; columns: number }; requestRender(): void },
    theme: MinimalTheme,
    _kb: unknown,
    done: (result: ConfirmResult) => void,
  ) => {
    const container = new Container();
    const redBorder = (text: string) => theme.fg("error", text);
    const dimBorder = (text: string) => theme.fg("dim", text);
    let scrollOffset = 0;
    let selectedIndex = 0;

    const commandTopBorder = new Text("", 0, 0);
    const commandText = new Text("", 1, 0);
    const commandBottomBorder = new Text("", 0, 0);
    const optionTexts = OPTIONS.map(() => new Text("", 1, 0));

    container.addChild(new DynamicBorder(redBorder));
    container.addChild(new Text(theme.fg("error", theme.bold("⚠  Dangerous Command Detected")), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("warning", `This command contains: ${description}`), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(commandTopBorder);
    container.addChild(commandText);
    container.addChild(commandBottomBorder);
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("text", "What do you want to do?"), 1, 0));
    container.addChild(new Spacer(1));
    for (const optionText of optionTexts) container.addChild(optionText);
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg("dim", "↑/↓: navigate  enter: confirm  j/k: scroll command  esc: deny"),
        1,
        0,
      ),
    );
    container.addChild(new DynamicBorder(redBorder));

    const getViewport = (contentWidth: number) => {
      const rows = command.split("\n").flatMap((line, index) => {
        const wrapped = wrapTextWithAnsi(theme.fg("text", line), Math.max(1, contentWidth));
        return (wrapped.length > 0 ? wrapped : [""]).map((rendered) => ({
          lineNum: index + 1,
          rendered,
        }));
      });
      const pinned = rows.filter((row) => row.lineNum === 1);
      const scrollable = rows.filter((row) => row.lineNum !== 1);
      const windowSize = Math.max(0, COMMAND_VIEWPORT_LINES - pinned.length);
      return {
        pinned,
        scrollable,
        windowSize,
        maxOffset: Math.max(0, scrollable.length - windowSize),
      };
    };

    return {
      render: (width: number) => {
        const contentWidth = Math.max(1, width - 4);
        const { pinned, scrollable, windowSize, maxOffset } = getViewport(contentWidth);
        scrollOffset = Math.max(0, Math.min(scrollOffset, maxOffset));
        const visibleScrollable = scrollable.slice(scrollOffset, scrollOffset + windowSize);
        const visible = [...pinned, ...visibleScrollable];
        const linesBelow = Math.max(0, scrollable.length - (scrollOffset + visibleScrollable.length));

        const borderLine = (label: string) => {
          const safeWidth = Math.max(1, width);
          const truncated = label.length > safeWidth ? label.slice(0, safeWidth) : label;
          return dimBorder("─".repeat(Math.max(0, safeWidth - truncated.length)) + truncated);
        };

        commandTopBorder.setText(borderLine(scrollOffset > 0 ? `↑ ${scrollOffset} more` : ""));
        commandText.setText(visible.map((row) => row.rendered).join("\n"));
        commandBottomBorder.setText(borderLine(linesBelow > 0 ? `↓ ${linesBelow} more` : ""));

        for (const [index, optionText] of optionTexts.entries()) {
          const label = `${index + 1}  ${OPTIONS[index]!.label}`;
          optionText.setText(
            index === selectedIndex
              ? `${theme.fg("accent", "❯")} ${theme.fg("text", theme.bold(label))}`
              : theme.fg("dim", `  ${label}`),
          );
        }

        return container.render(width);
      },
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        const contentWidth = Math.max(1, tui.terminal.columns - 4);
        const { maxOffset } = getViewport(contentWidth);

        if (matchesKey(data, Key.up)) {
          selectedIndex = (selectedIndex - 1 + OPTIONS.length) % OPTIONS.length;
          tui.requestRender();
        } else if (matchesKey(data, Key.down)) {
          selectedIndex = (selectedIndex + 1) % OPTIONS.length;
          tui.requestRender();
        } else if (data === "k") {
          scrollOffset = Math.max(0, scrollOffset - 1);
          tui.requestRender();
        } else if (data === "j") {
          scrollOffset = Math.min(maxOffset, scrollOffset + 1);
          tui.requestRender();
        } else if (matchesKey(data, Key.enter)) {
          done(OPTIONS[selectedIndex]!.result);
        } else if (data === "1") {
          done("allow-once");
        } else if (data === "2") {
          done("allow-session");
        } else if (data === "3") {
          done("allow-forever");
        } else if (data === "4" || matchesKey(data, Key.escape) || data === "n" || data === "N") {
          done("deny");
        }
      },
    };
  };
}
