export interface CommandPattern {
  pattern: string;
  regex?: boolean;
  description?: string;
}

export function matchesCommandPattern(pattern: CommandPattern, command: string): boolean {
  if (pattern.regex) {
    try {
      return new RegExp(pattern.pattern).test(command);
    } catch {
      return false;
    }
  }
  return command.includes(pattern.pattern);
}

export function findCommandPattern(
  command: string,
  patterns: CommandPattern[],
): CommandPattern | undefined {
  return patterns.find((pattern) => matchesCommandPattern(pattern, command));
}
