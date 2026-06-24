import { defineChannel, GET } from "eve/channels";

// Minimal internal channel so the auto-responder schedule can hand work to the
// agent. The default `eve` channel can't be a receive() target, so this declares
// a receive() hook that starts a session on the incoming message. A unique
// continuation token per inbound ROWID gives each text a fresh session.
//
// It carries one throwaway route because eve only registers channels that expose
// a route; the route is never used by the watcher.
export default defineChannel({
  routes: [GET("/ping", async () => new Response("ok"))],
  async receive(input, { send }) {
    return send(input.message, {
      auth: input.auth,
      continuationToken: `imessage:${String(input.target.rowId ?? input.message)}`,
    });
  },
});
