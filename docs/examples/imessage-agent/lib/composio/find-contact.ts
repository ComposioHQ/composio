import { experimental_createTool } from "@composio/core";
import Fuse from "fuse.js";
import { z } from "zod/v3";
import { normalizeHandle } from "../imessage/handles.js";
import { runAppleScript } from "./applescript.js";

type Contact = {
  name: string;
  nickname: string;
  initials: string;
  numbers: { label: string; value: string }[];
};

// Emits one line per person: name|nickname|label=value;label=value
//
// Bulk-fetches each property for ALL people in one Apple Event apiece (a few
// IPC round-trips total), then assembles locally. Reading properties per-person
// inside a loop is thousands of round-trips and is what made this slow.
const CONTACTS_SCRIPT = `tell application "Contacts"
	set theNames to name of every person
	set theNicks to nickname of every person
	set theVals to value of phones of every person
	set theLbls to label of phones of every person
end tell
set out to {}
repeat with i from 1 to count of theNames
	set nm to item i of theNames
	if nm is missing value then set nm to ""
	set nk to item i of theNicks
	if nk is missing value then set nk to ""
	set vals to item i of theVals
	set lbls to item i of theLbls
	set phParts to {}
	repeat with j from 1 to count of vals
		set lb to item j of lbls
		if lb is missing value then set lb to "other"
		set end of phParts to (lb & "=" & item j of vals)
	end repeat
	set AppleScript's text item delimiters to ";"
	set phStr to phParts as text
	set AppleScript's text item delimiters to ""
	set end of out to (nm & "|" & nk & "|" & phStr)
end repeat
set AppleScript's text item delimiters to (ASCII character 10)
return out as text`;

function cleanLabel(raw: string): string {
  return raw.replace(/^_\$!<(.+)>!\$_$/, "$1") || "other";
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toLowerCase();
}

function parseContact(line: string): Contact | null {
  const [name = "", nickname = "", phonesPart = ""] = line.split("|");
  const numbers = phonesPart
    .split(";")
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf("=");
      return { label: cleanLabel(entry.slice(0, idx)), value: entry.slice(idx + 1).trim() };
    })
    .filter((n) => n.value);
  if (!name || numbers.length === 0) return null;
  return { name, nickname, initials: initialsOf(name), numbers };
}

let contactsCache: Contact[] | null = null;

async function loadContacts(): Promise<Contact[]> {
  if (contactsCache) return contactsCache;
  const stdout = await runAppleScript(CONTACTS_SCRIPT);
  contactsCache = stdout
    .split("\n")
    .map((l) => parseContact(l.trim()))
    .filter((c): c is Contact => c !== null);
  return contactsCache;
}

export async function searchContacts(
  query: string,
  limit = 5,
): Promise<{ name: string; numbers: { label: string; value: string }[] }[]> {
  const contacts = await loadContacts();
  const fuse = new Fuse(contacts, {
    keys: ["name", "nickname", "initials"],
    threshold: 0.4,
    ignoreLocation: true,
  });
  return fuse
    .search(query)
    .slice(0, limit)
    .map((r) => ({ name: r.item.name, numbers: r.item.numbers }));
}

// Reverse lookup: contact name for an incoming handle (for nicer prompts).
export async function nameForHandle(handle: string): Promise<string | null> {
  const target = normalizeHandle(handle);
  for (const c of await loadContacts()) {
    for (const n of c.numbers) {
      if (normalizeHandle(n.value) === target) return c.name;
    }
  }
  return null;
}

export const findContact = experimental_createTool("FIND_CONTACT", {
  name: "Find Contact",
  description:
    "Fuzzy-search the user's Mac contacts by name, nickname, or initials. Returns matching contacts with their phone numbers (labeled). Use this to resolve who a message is for before sending.",
  preload: true,
  inputParams: z.object({
    query: z.string().describe("Name, nickname, or initials to search for (e.g. 'kj')."),
  }),
  execute: async ({ query }) => ({ candidates: await searchContacts(query) }),
});
