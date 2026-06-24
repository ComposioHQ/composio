import { defineChannel, POST } from "eve/channels";
import { composio } from "../../lib/composio/client.js";

const TRIGGER_SLUG = "GMAIL_NEW_GMAIL_MESSAGE";

function readString(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

// Webhook channel for Composio triggers: Composio POSTs events here, we verify
// the signature, then start an agent session with the email facts. The agent
// acts per its "Incoming email events" instructions (dev-related → text KJ).
export default defineChannel({
  routes: [
    POST("/webhook", async (req, { send, waitUntil }) => {
      const id = req.headers.get("webhook-id");
      const signature = req.headers.get("webhook-signature");
      const timestamp = req.headers.get("webhook-timestamp");
      const secret = process.env.COMPOSIO_WEBHOOK_SECRET;
      if (!id || !signature || !timestamp || !secret) {
        return new Response("missing webhook headers or secret", { status: 400 });
      }

      const result = await composio.triggers
        .verifyWebhook({ id, signature, timestamp, secret, payload: await req.text() })
        .catch(() => null);
      if (!result) {
        return new Response("invalid signature", { status: 401 });
      }

      const { triggerSlug, payload: eventData = {}, id: eventId } = result.payload;
      if (triggerSlug !== TRIGGER_SLUG) {
        return Response.json({ ignored: triggerSlug });
      }

      const from = readString(eventData, "sender", "from") ?? "someone";
      const subject = readString(eventData, "subject") ?? "(no subject)";
      const preview = readString(eventData, "preview", "snippet", "messageText", "message_text");

      waitUntil(
        send(
          `New email — from ${from}, subject "${subject}".${preview ? ` Preview: ${preview.slice(0, 500)}.` : ""} Handle it per your instructions for incoming emails.`,
          { auth: null, continuationToken: `email:${eventId}` },
        ),
      );
      return Response.json({ ok: true });
    }),
  ],
});
