/**
 * Generate a unique id string (prefixed). App-side copy — parser-core's
 * generateId is parser tooling; storage/core must not depend on parser-core
 * just for an id generator.
 */
export function generateId(prefix = ""): string {
  let id: string;
  if (crypto.randomUUID) {
    id = crypto.randomUUID().replace(/-/g, "");
  } else {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 10);
    id = timestamp + randomPart;
  }
  return prefix ? `${prefix}_${id}` : id;
}
