Gmail fetch and list flows return large responses by default. Trim them at the request rather than filtering afterwards.

- Set `include_payload=false` and `verbose=false` where the tool supports them.
- For the lightest flows, use `only_ids=true` and fetch the messages you actually need in a second call.
- Use `max_results` and Gmail `query` filters to keep result sets small in the first place.

## When you do need full content

The Gmail metadata scope cannot return full message content. If a call needs the complete payload or body, remove `https://www.googleapis.com/auth/gmail.metadata` from the auth config and use a scope that allows content access, such as `https://mail.google.com/`, then reconnect.
