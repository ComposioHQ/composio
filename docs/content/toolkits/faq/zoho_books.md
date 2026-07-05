## When should I use Zoho Invoice for create estimate?

`ZOHO_BOOKS_CREATE_ESTIMATE` is no longer the Zoho Books tool to use for estimates. Route create-estimate workflows to the Zoho Invoice toolkit and use `ZOHO_INVOICE_CREATE_ESTIMATE` instead.

## When should I use existing bill read tools or file a request for missing bill creation?

For existing bill coverage in Zoho Books, point users to `ZOHO_BOOKS_GET_BILL` and `ZOHO_BOOKS_LIST_BILLS`. If they need an unavailable create/update flow, ask them to file a tool request and confirm the intended Zoho Books API endpoint, such as Zoho's create-a-bill endpoint, so the request can be tracked precisely.

## Optional Zoho Books item rate filters do not have default values

The Zoho Books item `rate` field and related rate filters are optional. Composio does not set default values for those fields; if omitted, they default to null behavior. If an agent includes `0` or another value, treat that as model/tool-call behavior and inspect the tool schema with the get-tools-by-slug API reference or adjust the agent/tool-call layer so optional rate filters are not sent unless explicitly requested.

## Pin Zoho Books toolkit version when reproducing list-items behavior

When reproducing or sharing a controlled snippet for Zoho Books list-items behavior, pin the toolkit version in the SDK configuration, for example `toolkit_versions={"zoho_books": "20260211_00"}`, then request `ZOHO_BOOKS_LIST_ITEMS` explicitly for the user's connected account context.

## Zoho domain suffix parameter expects the extension value

For Zoho Books auth, the Zoho domain parameter expects the extension value such as `com`, `eu`, or `in`; Composio appends it into the URL as the corresponding domain suffix like `.com`. Do not ask users to include the leading dot in the parameter value.
