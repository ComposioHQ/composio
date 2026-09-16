## Use Logs for execution evidence

Open **Platform → Logs** and choose the tool or trigger log view. Filter by the
smallest known non-secret identifier, then open the row to inspect its status,
toolkit, action or trigger, version, user, connection, request/response or
provider error, timing, and correlation IDs.

Use a **Log ID** for a tool execution, a **Trigger ID** plus Log ID for a
trigger event, and a **Session ID** for session behavior. Never request API
keys, access or refresh tokens, provider client secrets, webhook secrets, or
passwords.

## Use Users and Sessions to explain retrieval and execution context

Open **Users** to find a project user and its connected accounts, triggers,
sessions, and filtered logs. Open **Sessions** to inspect session toolkits,
connection behavior, and execution timeline. An active connection elsewhere in
the organization does not prove it was eligible for this session: project,
`user_id`, toolkit restrictions, auth-config selection, and explicit connected
account selection all affect resolution.

## Disable a trigger when the goal is to pause it

Open **Triggers** to inspect status and related logs. Disable a trigger when it
should pause temporarily; delete it only when the subscription should be
removed. Before recreating a trigger, verify the selected project, user,
connected account, trigger type, and current provider event support.
