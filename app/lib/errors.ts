/** Extract a human-readable message from any thrown value. */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
