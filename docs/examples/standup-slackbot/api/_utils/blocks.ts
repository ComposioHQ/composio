// Block Kit builders for the standup menu / confirm / edit / connect flow.
// Plain data (no agent involvement) keeps the interactive messages deterministic.

export const ACTION_DRAFT = "standup_draft";
export const ACTION_CONNECT = "standup_connect";
export const ACTION_CONFIRM = "standup_confirm";
export const ACTION_EDIT = "standup_edit";
export const MODAL_EDIT_SUBMIT = "standup_edit_submit";
export const EDIT_INPUT_BLOCK = "standup_edit_block";
export const EDIT_INPUT_ACTION = "standup_edit_input";
// Stable id for the draft-body section, so the handler can recover the draft
// text by block_id instead of a fragile positional index.
export const DRAFT_BODY_BLOCK = "standup_draft_body";

// Context threaded through buttons/modals so the handler knows who/where without
// re-deriving it. Kept small (button `value` is capped at 2000 chars).
export type StandupContext = {
  memberEmail: string;
  threadTs: string; // parent daily-thread message ts
  channelId: string; // the standup channel's ID
};

/** The daily reminder "menu": a nudge + Draft button (+ Connect if applicable). */
export function buildReminderMenu(
  threadUrl: string,
  ctx: StandupContext,
  showConnect: boolean
) {
  const value = JSON.stringify(ctx);
  const buttons: Record<string, unknown>[] = [
    {
      type: "button",
      style: "primary",
      text: { type: "plain_text", text: "📝 Draft", emoji: true },
      action_id: ACTION_DRAFT,
      value,
    },
  ];
  if (showConnect) {
    buttons.push({
      type: "button",
      text: { type: "plain_text", text: "🔌 Connect more tools", emoji: true },
      action_id: ACTION_CONNECT,
      value,
    });
  }
  return {
    text: "Daily standup reminder",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📅 Time for your standup. Post your update in <${threadUrl}|today's thread>.\nTap *Draft* and I'll put together a draft from your connected tools.`,
        },
      },
      { type: "actions", elements: buttons },
    ],
  };
}

/** "Researching…" placeholder shown while the draft is generated. */
export function buildLoadingMessage(label = "Researching your activity and drafting your standup…") {
  return {
    text: label,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: `⏳ ${label}` } }],
  };
}

/** The draft DM: the draft text + Confirm/Edit buttons. */
export function buildDraftMessage(draft: string, ctx: StandupContext) {
  const value = JSON.stringify(ctx);
  const body = draft.trim()
    ? draft
    : "_No draft yet. Tap ✏️ Edit to write your update._";
  return {
    text: "Your standup draft is ready for review.",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Your standup draft.* Review and post 👇" },
      },
      { type: "section", block_id: DRAFT_BODY_BLOCK, text: { type: "mrkdwn", text: body } },
      { type: "divider" },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            style: "primary",
            text: { type: "plain_text", text: "✅ Confirm & Post", emoji: true },
            action_id: ACTION_CONFIRM,
            value,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "✏️ Edit", emoji: true },
            action_id: ACTION_EDIT,
            value,
          },
        ],
      },
    ],
  };
}

type DraftMessage = {
  blocks?: Array<{ block_id?: string; text?: { text?: string } }>;
};

/** Recover the draft text from a posted draft message, by stable block_id. */
export function extractDraft(message: DraftMessage): string {
  const block = (message.blocks ?? []).find(
    (b) => b.block_id === DRAFT_BODY_BLOCK
  );
  return block?.text?.text ?? "";
}

/** Shown after posting from the user's own Slack account. */
export function buildPostedMessage(draft: string) {
  return {
    text: "Standup posted.",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: "✅ *Posted to the standup thread.*" } },
      { type: "section", text: { type: "mrkdwn", text: draft } },
    ],
  };
}

/** Fallback when the member has no personal Slack: copyable text + thread link. */
export function buildCopyMessage(draft: string, threadUrl: string) {
  return {
    text: "Copy your standup into the thread.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Here's your standup. Copy it and paste it into <${threadUrl}|today's thread>:`,
        },
      },
      { type: "section", text: { type: "mrkdwn", text: "```" + draft + "```" } },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "_Connect your Slack (tap Connect on the reminder) to have me post it for you next time._",
          },
        ],
      },
    ],
  };
}

/** Connect menu: one URL button per unconnected tool (opens its OAuth link). */
export function buildConnectMenu(links: { label: string; url: string }[]) {
  // Slack actions blocks allow max 5 elements; chunk into rows of 5.
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < links.length; i += 5) {
    rows.push({
      type: "actions",
      elements: links.slice(i, i + 5).map((l) => ({
        type: "button",
        text: { type: "plain_text", text: `Connect ${l.label}`, emoji: true },
        url: l.url,
      })),
    });
  }
  return {
    text: "Connect tools to enrich your standup drafts.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Connect your tools* so I can draft from your real activity. All optional:",
        },
      },
      ...rows,
    ],
  };
}

/** Edit modal: multiline input prefilled with the current draft. */
export function buildEditModal(
  draft: string,
  ctx: StandupContext,
  dm: { channel: string; ts: string }
) {
  return {
    type: "modal",
    callback_id: MODAL_EDIT_SUBMIT,
    private_metadata: JSON.stringify({ ...ctx, dmChannel: dm.channel, dmTs: dm.ts }),
    title: { type: "plain_text", text: "Edit standup" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: EDIT_INPUT_BLOCK,
        label: { type: "plain_text", text: "Your standup update" },
        element: {
          type: "plain_text_input",
          action_id: EDIT_INPUT_ACTION,
          multiline: true,
          initial_value: draft,
        },
      },
    ],
  };
}
