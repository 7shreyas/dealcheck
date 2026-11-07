// Unguessable ids (128 random bits) for checks and orders. Report URLs carry
// the order id, so it must not be sequential or predictable.

export function newId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function isValidId(id: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(id);
}
