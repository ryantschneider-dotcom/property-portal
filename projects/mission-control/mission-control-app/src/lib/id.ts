export function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }

  return `mc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
