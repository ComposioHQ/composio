## What each organization role can do

Every member of your organization has one of three roles: **Admin**, **Member**, or **Viewer**. The role applies to the whole organization, so it covers both Composio For You and Platform.

**Member** and **Developer** are the same role. The For You **Members** settings page calls it **Member**, and the Platform **Team Members** settings page calls it **Developer**. If you change someone's role on either page, it changes in both products.

Only Admins can manage the organization itself, in both products:

- Invite people, create invite links, change roles, and remove members.
- Manage billing, plans, and wallet top-ups.
- Rename or delete the organization, and set up SSO.

### Composio For You

| Action | Admin | Member | Viewer |
|---|---|---|---|
| Open For You | Yes | Yes | No |
| Connect your own apps | Yes | Yes | No |
| Use connections an admin or teammate shared with the organization | Yes | Yes | No |
| Share one of your connections with the organization | Yes | Yes | No |
| Rename, reconnect, unshare, or delete a shared connection | Only the person who shared it | Only the person who shared it | No |
| Turn Instant Tools on or off for the organization | Yes | No | No |
| See tool logs for the whole organization | Yes | Own activity only | No |

Viewers can't use For You at all. Give your team the **Member** role if they need to connect their own apps or use shared connections.

Members only see and manage their own personal connections. Only the person who shared a connection can rename, reconnect, unshare, or delete it. Admins can't change a teammate's shared connection either.

### Composio Platform

| Action | Admin | Developer | Viewer |
|---|---|---|---|
| View projects, logs, and settings | Yes | Yes | Yes |
| Connect apps and manage connected accounts in a project | Yes | Yes | No |
| Create, edit, enable, or delete auth configs | Yes | Yes | No |
| Manage triggers, webhook subscriptions, and custom toolkits | Yes | Yes | No |
| Rename a project | Yes | Yes | No |
| Create or delete a project | Yes | No | No |
| Create or revoke project API keys and set IP allowlists | Yes | No | No |
| Change project security settings, such as 2FA, required MCP API keys, data masking, and log visibility | Yes | No | No |

Developers can build inside existing projects. Ask an Admin to create a project or to issue an API key for it.

## Transfer organization control to another user

Transfer organization control by assigning the **Admin** role:

1. Open **Organization Settings → Team Members**.
2. Invite the new user and assign the **Admin** role.
3. Have the new user accept the invitation and sign in.
4. If the previous admin should no longer have control, the new admin can lower or remove that person afterward.

A user cannot normally remove or change their own Team Members row. If the existing administrator cannot access the organization, the invitation or role selector fails, or the change could leave the organization without an administrator, contact support.

Removing the previous user does not delete the organization, but API keys owned by that removed account can stop working. Rotate or replace those keys before removal when necessary.
