## Why does my SharePoint `/teams/...` site resolve as `/sites/...`?

If a user's SharePoint site URL is under `/teams/<site>` instead of `/sites/<site>`, do not tell them to pass only `<site>` in the SharePoint Subsite field. A bare subsite value is interpreted as `/sites/<site>` by the toolkit.

Re-initiate or reconnect the SharePoint account and set SharePoint Subsite to the full server-relative path, for example `/teams/<site>`. For per-call overrides, pass `site_name: "/teams/<site>"`.
