# /// script
# requires-python = ">=3.10"
# dependencies = ["composio"]
# ///
"""Link Gmail, create a GMAIL_NEW_GMAIL_MESSAGE trigger, then subscribe."""
import os
import signal
import sys
import threading

from composio import Composio

TRIGGER_SLUG = "GMAIL_NEW_GMAIL_MESSAGE"

composio = Composio()

print(f"Base URL : {os.environ.get('COMPOSIO_BASE_URL', '<default>')}", flush=True)

# Pick the most-recent ACTIVE Gmail connection on this API key.
existing = composio.connected_accounts.list(toolkit_slugs=["gmail"])
active = sorted(
    [a for a in existing.items if a.status == "ACTIVE"],
    key=lambda a: a.created_at,
    reverse=True,
)
if not active:
    raise SystemExit("No ACTIVE Gmail connection found for this API key.")

conn = active[0]
connected_account_id = conn.id
print(
    f"Using Gmail connection: {connected_account_id} "
    f"(user_id={conn.user_id}, created_at={conn.created_at})",
    flush=True,
)

# 2. Create the trigger instance for this connection.
trig = composio.triggers.create(
    TRIGGER_SLUG,
    connected_account_id=connected_account_id,
)
print(f"Trigger created: {trig}", flush=True)

# 3. Subscribe and print events.
subscription = composio.triggers.subscribe()

# Dump raw payloads before the SDK parses them (workaround for SDK 'nanoId' bug).
_orig_handle_event = subscription._handle_event


def _debug_handle_event(event: str) -> None:
    print("[RAW EVENT]", event, flush=True)
    try:
        _orig_handle_event(event)
    except Exception as e:
        print(f"[SDK parse error] {e!r}", flush=True)


subscription._handle_event = _debug_handle_event  # type: ignore[assignment]


@subscription.handle(
    trigger_slug=TRIGGER_SLUG, connected_account_id=connected_account_id
)
def on_gmail(event) -> None:
    meta = event["metadata"]
    print(
        f"[GMAIL] conn={meta['connected_account']['id']} "
        f"trigger_id={meta['id']}",
        flush=True,
    )
    print(event["payload"], flush=True)


print("Subscribed. Send yourself an email...", flush=True)

threading.Timer(
    int(os.environ.get("TEST_TIMEOUT_SECS", "300")), subscription.stop
).start()
signal.signal(signal.SIGINT, lambda *_: (subscription.stop(), sys.exit(0)))
subscription.wait_forever()
print("Subscription ended.", flush=True)
