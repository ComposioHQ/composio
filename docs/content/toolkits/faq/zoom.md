## How do I set up custom OAuth credentials for Zoom?

Use your own Zoom OAuth app when you want users to see your app's name on the consent screen and control the credentials yourself.

### Create the Zoom app

1. Go to the [Zoom App Marketplace](https://marketplace.zoom.us/develop/create) and create a **General** app. Composio connects users through the OAuth authorization flow, which a General app supports.

   ![Zoom App Marketplace dialog asking what kind of app you are creating, with General App selected](/images/toolkits/zoom/choose-general-app.webp)
2. On the app's **Basic Information** tab, under **App Credentials**, copy the **Client ID** and **Client Secret**. You can set the app name and developer details separately for the **Development** and **Production** environments.

   ![Zoom app header with the Development and Production environment tabs](/images/toolkits/zoom/development-production-tabs.webp)
3. In the **OAuth Information** section below the credentials, add `https://backend.composio.dev/api/v1/auth-apps/add` as the redirect URL. It must exactly match the `oauth_redirect_uri` field in your Composio auth config.
4. Open the **Scopes** tab and click **+ Add Scopes**. Zoom enables no scopes by default, so add every scope your tools need (see below).

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Zoom**.
2. Set the authentication type to **OAuth2** and choose **Use your own developer authentication**.
3. Paste the **Client ID** and **Client Secret**, then click **Create Zoom Auth Config**.
4. Click **Connect Account**, click **Allow** on the Zoom authorization screen, and confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests granular scopes for meetings, webinars, cloud recordings, archiving, contacts, and users, for example `meeting:read:meeting`, `meeting:write:meeting`, `webinar:read:list_webinars`, `cloud_recording:read:list_recording_files`, and `user:read:user`. Add the same scopes to your Zoom app, or remove the ones you don't need from the auth config's **Scopes** field on **Manage Auth Config**.

While testing in the Development environment, you can select all scopes and remove the unneeded ones before you move to Production.
