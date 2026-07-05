## When should I use a custom Webflow OAuth app when the default app cannot authorize workspaces?


If Webflow's consent screen does not let the user select a workspace/site or the authorize button is greyed out with the default OAuth app, use the user's own Webflow OAuth app credentials so the workspace authorization is controlled by their Webflow app.

## Deprecated Webflow v1 endpoints caused publish-site integration failures


If Webflow calls fail because the integration is using unsupported or deprecated endpoints, check whether the failing action is an older v1 Webflow tool. Prefer current Webflow toolkit versions and avoid older deprecated v1 Webflow tools where possible.
