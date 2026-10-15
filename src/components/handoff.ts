/** Files carried over when the user picks "Continue with another tool" on a result page. */
let pending: File[] = [];

export function setHandoff(files: File[]) {
  pending = files;
}

export function takeHandoff(): File[] {
  const files = pending;
  pending = [];
  return files;
}
