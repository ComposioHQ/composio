import { searchContacts } from "../composio/find-contact.js";
import { normalizeHandle } from "./handles.js";

// Comma-separated contact NAMES in IMESSAGE_AUTO_REPLY_CONTACTS. Empty/unset
// means "everyone" (per the user's choice — see AGENTS.md for the risk note).
export function parseAllowlistNames(): string[] {
  return (process.env.IMESSAGE_AUTO_REPLY_CONTACTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Returns null to mean "allow everyone", or a set of normalized handles resolved
// from the allowlist names via fuzzy contact lookup.
export async function resolveAllowedHandles(): Promise<Set<string> | null> {
  const names = parseAllowlistNames();
  if (names.length === 0) return null;
  const allowed = new Set<string>();
  for (const name of names) {
    for (const contact of await searchContacts(name)) {
      for (const number of contact.numbers) allowed.add(normalizeHandle(number.value));
    }
  }
  return allowed;
}

export function isAllowed(handle: string, allowed: Set<string> | null): boolean {
  return allowed === null || allowed.has(normalizeHandle(handle));
}
