export class ReplayMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayMismatchError";
  }
}

export function mismatch(message: string): never {
  throw new ReplayMismatchError(message);
}
