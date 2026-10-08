import { JiraInputError } from "./errors.js";

export function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new JiraInputError(`${label} must not be empty.`);
  }
  return trimmed;
}

export function requireLimit(value: number, label: string, maximum: number): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new JiraInputError(`${label} limit must be an integer from 1 to ${maximum}.`);
  }
  return value;
}
