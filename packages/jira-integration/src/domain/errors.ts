export class JiraNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraNormalizationError";
  }
}

export class JiraInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraInputError";
  }
}
