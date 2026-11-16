## How do I set up custom Google OAuth credentials for Gmail?

Use your own Google OAuth app when you want your app's name on Google's consent screen, a dedicated API quota, or scopes that Composio's managed app doesn't cover.

### Create the Google OAuth app

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select the project that will own the OAuth app, or create one.

   ![Google Cloud project picker with the OAuth app's project selected](/images/toolkits/shared/hjaj4jg5CtBRolXXYddY8NDXCes.webp)

2. Go to **APIs & Services** → **Library**, search for **Gmail API**, and click **Enable**. If the API page shows **Manage**, the API is already enabled. Enabling an API needs project permissions; ask your project admin if you can't.

   ![Gmail API page in the Google Cloud API Library with the Enable button](/images/toolkits/gmail/enable-gmail-api.webp)

3. Go to **Google Auth Platform** → **Branding**. If you see **Get started**, enter the app name, user support email, and developer contact email, then save.

   ![Google Auth Platform Branding page with the app name and user support email fields](/images/toolkits/shared/x4VkWS3iceKKFGyjlFN1THrtTRQ.webp)

4. Under **Audience**, choose the user type. **Internal** limits sign-in to accounts in your Google Workspace organization. **External** allows any Google account. An External app starts in **Testing**; add every account that will connect under **Test users**.

   ![Google Auth Platform Audience page showing Testing status, the External user type, and Test users](/images/toolkits/shared/Jttbz3Cm6xJFWNlukXLGTxWjf6c.webp)

5. Under **Data Access**, click **Add or remove scopes** and add the scopes your auth config will request (see **Scopes** below). Paste any scope missing from the list under **Manually add scopes** and click **Add to table**. Click **Update**, then **Save**.

   ![Data Access scope picker with the gmail.readonly scope selected](/images/toolkits/gmail/data-access-scopes.webp)

6. Under **Clients**, click **Create client**. Set **Application type** to **Web application**, name the client, and add this URI under **Authorized redirect URIs**:

   ```
   https://backend.composio.dev/api/v1/auth-apps/add
   ```

   It must exactly match the `oauth_redirect_uri` field of your Composio auth config.

   ![Create OAuth client ID form with Web application selected](/images/toolkits/shared/sA0bvCBPtMCWw8lqecCrx76Dyc.webp)

   ![Create OAuth client ID form with the Composio redirect URI under Authorized redirect URIs](/images/toolkits/shared/jDTS80dlfwHF6u1WAQhBdnjTrI.webp)

7. Click **Create**. Copy the **Client ID** and **Client secret** before you close the dialog, and store the secret privately.

   ![OAuth client created dialog with the Client ID and Client secret](/images/toolkits/shared/YdKWAswsL2nVXnSbA4zgBUDmwA.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/~/project/auth-configs?utm_source=docs&utm_medium=content&utm_campaign=toolkits-gmail), go to **Auth Configs** → **Create** and select **Gmail**. Enter a config name and click **Next**.

   ![Composio Auth Configs page with the Create button](/images/toolkits/shared/DUtMN0UWIU2kEqnvS5DvD7qhWU.webp)

   ![Create Auth Config dialog with Gmail in the toolkit search results](/images/toolkits/gmail/composio-select-toolkit.webp)

   ![Config Name field for the new Gmail auth config](/images/toolkits/gmail/composio-config-name.webp)

2. Choose **OAuth 2.0** and **Your Own Credentials**. Paste the **Client ID** and **Client secret**, and leave **Redirect URI** set to `https://backend.composio.dev/api/v1/auth-apps/add`.

   ![Gmail auth config form with Client ID, Client secret, the Composio redirect URI, and a selected scope](/images/toolkits/gmail/composio-auth-config-form.webp)

3. Choose the scopes your tools need, matching the ones you added under **Data Access**, then click **Create Auth Config**.
4. Click **Connect Account**, sign in with a Google account that can use the app (a test user while the app is in **Testing**), and approve the consent screen. Under **Accounts**, confirm the connection shows **Active**.

   ![Google's unverified-app notice for an app in Testing](/images/toolkits/shared/M0mS4XrLbK5mU52ry578MBa7M.webp)

   ![Google consent screen asking to view email messages and settings](/images/toolkits/gmail/google-consent-screen.webp)

   ![Gmail auth config details with an Active connected account](/images/toolkits/gmail/composio-connected-account-active.webp)

For the general flow, see [custom auth configs](/docs/auth-configuration/custom-auth-configs).

### Scopes

The default Gmail auth config requests `https://mail.google.com/` (full mailbox access), `userinfo.email`, `userinfo.profile`, and People API read scopes such as `contacts.readonly`, `contacts.other.readonly`, and `user.emails.read`. Request only what your tools need. For example, `gmail.readonly` reads messages and settings but can't send or modify mail. See Google's [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes).

Short scope names on this page leave out the `https://www.googleapis.com/auth/` prefix. When you paste a scope under **Manually add scopes**, use the full URL, for example `https://www.googleapis.com/auth/userinfo.email`. Scopes already written as a full URL, such as `https://mail.google.com/`, go in as shown.

If you change the scopes later, reconnect the account so the user grants the new access.

### Testing, publishing, and verification

- While an External app is in **Testing**, only test users can connect, and Google can show them an unverified-app notice. Google generally expires their authorizations after seven days, so they need to reconnect.
- To let any Google account connect, publish the app under **Audience**. Publishing doesn't verify the app.
- Public apps that request sensitive or restricted scopes generally need Google's OAuth verification. Check **Google Auth Platform** → **Verification Center**. Internal apps and apps in Testing can be exempt. See Google's [verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
- `https://mail.google.com/` and `gmail.readonly` are restricted scopes. A public app that requests them needs restricted-scope verification, which can include a security assessment if your servers store or transmit Gmail data.
- If Google blocks sign-in, check the app's audience, the test user list, the requested scopes, and your Workspace admin's app access policy.

## Why am I seeing "App is blocked" when connecting Gmail?

The OAuth client is requesting scopes that Google hasn't verified for that client. This usually happens when you add extra scopes beyond the defaults.

Remove the additional scopes from your auth config, or create your own OAuth app and submit the scopes for verification, as described in the setup steps above.

## Why am I getting "Gmail API has not been used in project" error?

When using custom OAuth credentials, the Gmail API must be enabled in the Google Cloud project that owns those credentials. Enable it in Google Cloud Console under APIs & Services, wait a few minutes, and retry.

## Why am I getting "Error 400: invalid_scope"?

The requested scopes are invalid or incorrectly formatted in the authorization URL. Verify your scope values against the [Google OAuth scopes docs](https://developers.google.com/identity/protocols/oauth2). If you're creating auth configs programmatically, see the [programmatic auth config guide](/docs/authentication/programmatic-auth-configs).

## Why does the OAuth consent screen show "Composio" instead of my app?

By default, the consent screen uses Composio's OAuth app. To show your own app name and logo, create your own OAuth app and set a custom redirect URL. See [White-labeling authentication](/docs/authentication/white-labeling-authentication#using-your-own-oauth-apps).

## Why am I getting 401 errors on tool calls?

The user's access token is no longer valid. Common causes: the user revoked access, changed their password or 2FA, a Workspace admin policy changed, or Google's refresh token limit (~50 per account) was exceeded. Re-authenticating the user typically resolves this.

## Why is my Gmail trigger slow?

Your trigger is probably polling. Gmail triggers use webhooks on Composio-managed auth, so events arrive in seconds, but a trigger polls when:

- It was created as a polling trigger. Composio doesn't move existing triggers to webhooks; delete the trigger and create it again.
- You passed `type: "poll"` when you created it.
- Your own OAuth app has no complete Gmail webhook endpoint yet. See the next question.

A polling trigger waits up to its `polling_interval` between checks. [List the trigger](/docs/setting-up-triggers/managing-triggers#listing-active-triggers) and read its `type` and `fallback_reason` to see which case applies.

## How do I set up Gmail webhooks with my own OAuth app?

Gmail delivers mailbox changes through Google Cloud Pub/Sub. Set it up once per OAuth app, in the Google Cloud project that owns your OAuth client:

1. Enable the Gmail API and the Cloud Pub/Sub API.
2. Create a Pub/Sub topic. Its full name is `projects/<project-id>/topics/<topic-id>`. On the topic, grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role (`roles/pubsub.publisher`).
3. Create a service account only for push deliveries, for example `composio-gmail-push`. Give it no roles and create no keys: Pub/Sub uses it only to sign each push.
4. [Create a Gmail webhook endpoint](/docs/setting-up-triggers/custom-oauth-webhooks) with your OAuth client ID, and note its `webhook_url`.
5. Create a push subscription on the topic. Set its endpoint URL to the `webhook_url`, turn on authentication with the service account, and set the audience to the same `webhook_url`. Leave payload unwrapping off, and set the subscription to never expire.
6. Share your Pub/Sub details with Composio by [updating the endpoint](/docs/setting-up-triggers/custom-oauth-webhooks#updating-an-endpoint), a `PATCH` or `composio.webhooks.endpoints.update()` in the SDKs. Set `topic_name` to the topic's full name, `push_service_account_email` to the service account's email, and `push_audience` to the `webhook_url`.

Until the endpoint has all three fields, new Gmail triggers poll, and their `fallback_reason` says what's missing. Once it does, new triggers you create without `type` use the webhook straight away. That's why the fields come last, after the push subscription is delivering.

If pushes don't arrive, check that Pub/Sub's service agent, `service-<project-number>@gcp-sa-pubsub.iam.gserviceaccount.com`, can sign tokens for the service account. If it can't, grant it the Service Account Token Creator role on that account. Google documents its side in [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push).

## Why am I getting "Quota Exhausted" or "rate limit exhausted"?

Google enforces per-minute and daily request quotas. If you're using Composio's default OAuth app, you share that quota with other users, which can cause limits to be hit faster. Use your own OAuth app credentials to get a dedicated quota, and add exponential backoff and retries to handle transient rate limits.

## How do I send an email with an attachment?

Use a [session](/docs/quickstart) so your agent discovers the email tool at runtime instead of hard-coding an action slug.

1. [Connect Gmail for your user](/docs/authentication/manually-authenticating), then create a session for the same user and give your agent the session tools.
2. Upload `./report.pdf` to that session with the experimental `session.experimental.files` API. See [sandbox files and mounts](/docs/sandbox/remote#files-and-mounts) for Python, TypeScript, and API examples. The agent can read the uploaded file in the remote sandbox, not from your application's local filesystem.
3. Ask the agent to send the email with your recipient, subject, body, and the uploaded file's sandbox path. For a file mounted at `/mnt/files/report.pdf`, instruct it to use the sandbox's `get_mount_file_s3_key("report.pdf")` helper and pass the returned key to the discovered email tool in a file object with `name`, `mimetype`, and `s3key`. A sandbox path is not a storage key. See [session files and toolkit attachments](/kb/guide/mcp-tool-router-files).
4. Check the tool result before reporting that the email was sent. If the tool fails, report the error.

Automatic file upload is off by default. This workflow uploads the file explicitly and does not require enabling automatic file handling. The session files API is experimental and may change.

## Why can Gmail filter setup show an app-blocked error?

If a user on Composio-managed Gmail auth hits Google's "app is blocked" / unverified-app screen after adding `gmail.settings.basic`, use your own Google OAuth app verified for `https://www.googleapis.com/auth/gmail.settings.basic`, then reconnect.

## When should I avoid `gmail.metadata` when fetching full Gmail email content?

Use `https://www.googleapis.com/auth/gmail.metadata` only when the app needs message metadata such as labels and headers, not message bodies or payload content. Gmail treats `gmail.metadata` as a restricted metadata-only scope, and it is not compatible with broader content-access scopes such as `gmail.readonly`, `gmail.modify`, or `mail.google.com` in the same OAuth request.

If a tool needs full email content, remove `gmail.metadata` from the auth config and request a Gmail scope that allows message content access. Then reconnect the account so the new scope set is granted.
