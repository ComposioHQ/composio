import { generateText, stepCountIs } from "ai";
import { Member, MODEL, TOOLKITS, GITHUB_ORG } from "../../standup.config";
import { lookbackWindow } from "./schedule";
import { createToolRouterSession } from "./composio";

/** The standup draft prompt, adapted to whichever toolkits the member connected. */
function buildDraftPrompt(
  member: Member,
  window: { date: string; label: string },
  connectedSlugs: string[]
): string {
  const connected = TOOLKITS.filter((t) => connectedSlugs.includes(t.slug));
  const sources = connected.map((t) => `  - ${t.draftInstruction}`).join("\n");
  const emojiLegend = connected.map((t) => `${t.emoji} ${t.label}`).join(", ");

  return `You are writing @${member.githubUsername}'s daily standup, covering
${window.label} (everything since ${window.date}).

You have a Composio tool-router session with these tools connected:
${connected.map((t) => t.label).join(", ")}.
Use the meta-tools to research yourself: search for the right tool per source,
then execute it. Do NOT guess activity. Investigate first, then write.

IMPORTANT: All tools above are ALREADY connected. Do NOT attempt to connect,
authenticate, or generate OAuth links. If a tool call fails, skip that source.
Never ask the user to connect anything.

What to look at (ONLY these connected sources):
${sources}

Keep tool requests small (filter by date, ~10 items, no full transcripts).

Output rules:
  - 2 to 5 atomic, one-line updates. Prune noise.
  - Start each line with the right source emoji: ${emojiLegend}. GitHub PRs use
    🟣 merged, 🟢 open, ⚪️ draft, 🔴 closed and include the *#number*.
  - State WHAT they did and WHY it matters, plainly. Facts only, no speculation.
  - NEVER use em dashes. Use colons, commas, or separate sentences.
  - LINKS: this is posted to Slack, which does NOT support Markdown links. NEVER
    write [text](url). Use Slack's link syntax <url|text> instead, e.g.
    <https://github.com/${GITHUB_ORG}/repo/pull/893|#893>. A bare URL is also fine.
  - CRITICAL: your reply is posted to Slack VERBATIM. It must contain ONLY the
    bullet lines, each starting with its source emoji. No preamble ("Here's the
    standup"), no narration ("I found 3 PRs"), no headings, no closing remarks,
    no sign-off. The very first character of your reply is the first bullet's emoji.
  - If no activity in range, your entire reply is exactly: "📭 No tracked activity ${window.label}."`;
}

/**
 * Generate a member's standup draft by researching their CONNECTED tools. Spins
 * up a Composio tool-router session scoped to those toolkits and lets the agent
 * drive the meta-tools to gather activity. Returns the draft text only.
 */
export async function generateDraftText(
  member: Member,
  connectedSlugs: string[]
): Promise<string> {
  if (connectedSlugs.length === 0) return "";

  const session = await createToolRouterSession(member.slackEmail, connectedSlugs);
  const tools = await session.tools();

  const { text } = await generateText({
    model: MODEL,
    system: buildDraftPrompt(member, lookbackWindow(member.standupTimezone), connectedSlugs),
    prompt: `Research and write @${member.githubUsername}'s standup update.`,
    tools,
    stopWhen: stepCountIs(40),
  });

  return text.trim();
}
