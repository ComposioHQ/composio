# Tool Description Improvement Candidates

This file tracks support-derived wording that should improve tool descriptions or toolkit metadata instead of becoming public FAQ content.

## Airtable: AIRTABLE_UPDATE_MULTIPLE_RECORDS

Reason to keep out of the FAQ: this is a tool-description clarity issue. The most useful place for it is the tool metadata shown beside `AIRTABLE_UPDATE_MULTIPLE_RECORDS`, not a separate troubleshooting answer.

Suggested tool description:

`AIRTABLE_UPDATE_MULTIPLE_RECORDS` updates up to 10 Airtable records per request using patch semantics. Use it when you need to selectively update fields on multiple Airtable records while leaving unspecified fields unchanged. For more than 10 records, split the input into batches of 10, execute one batch per tool call, track which batches succeeded, and retry only failed batches or failed records when possible. Use `AIRTABLE_UPDATE_MULTIPLE_RECORDS_PUT` only when full replacement behavior is intended because omitted fields may be cleared. Airtable rate limits still apply across multiple batches, so use backoff or lower concurrency on 429s or transient failures.

Verification:

- Airtable's public API limit guidance says batching handles up to 10 records per request.
- Local toolkit metadata describes `AIRTABLE_UPDATE_MULTIPLE_RECORDS` as updating up to 10 records and notes that updates are not atomic.
- Local toolkit metadata describes `AIRTABLE_UPDATE_MULTIPLE_RECORDS_PUT` as a PUT update that can clear unspecified fields.

## Apollo: APOLLO_BULK_PEOPLE_ENRICHMENT

Reason to keep out of the FAQ: this is a tool-description clarity issue. The useful fix is to make the bulk enrichment tool metadata explain the `details` payload shape, matching identifiers, and per-record no-match behavior.

Suggested tool description:

`APOLLO_BULK_PEOPLE_ENRICHMENT` enriches multiple people in one request. Provide each person as a separate object in the `details` array, and include the strongest identifier available for each record: `id`, `email`, `hashed_email`, `linkedin_url`, or `first_name` and `last_name` with `organization_name` or `domain`. A successful response can still include a missing record or `null` match for an individual person when the identifiers are weak or incomplete; retry those records with stronger identifiers instead of treating the whole call as failed. If `reveal_phone_number` is true, include `webhook_url` as required by Apollo. Each call consumes Apollo credits, so avoid re-enriching the same contacts and use backoff on HTTP 429 responses.

Verification:

- Current `APOLLO_PEOPLE_ENRICHMENT` metadata already lists the strong identifier options and notes that name-only inputs frequently return no matches.
- Current `APOLLO_BULK_PEOPLE_ENRICHMENT` metadata says unmatched records can be valid no-match outcomes, but does not explain the `details` array shape or identifier guidance.
- The Apollo toolkit KB evidence says bulk enrichment records belong inside a `details` array and that HTTP success can still include a missing or `null` match.

## Asana: ASANA_GET_TASK_COMMENTS

Reason to keep out of the FAQ: this is a tool-slug and parameter-shape clarity issue. The durable fix belongs in tool metadata or custom-tool guidance, not as a standalone Asana FAQ.

Suggested tool description:

`ASANA_GET_TASK_COMMENTS` retrieves comments for an Asana task. Use the namespaced Asana slug `ASANA_GET_TASK_COMMENTS`, not an unscoped `GET_TASK_COMMENTS` slug, and pass the Asana task ID/GID as a string. For custom toolkit-based tools that call Asana directly, use `https://app.asana.com/api/1.0` as the base URL and include the required `Authorization` header.

Verification:

- The Asana toolkit KB says failures came from using an unscoped task-comments slug and passing a numeric task ID.
- Current public toolkit data includes Asana task comment creation and Asana triggers, but does not expose a task-comment retrieval action in the generated toolkit dataset.

## Additional Tool Improvement Candidates From FAQ Audit

These entries were moved out of public toolkit FAQs because they are better handled as tool metadata, schema, slug, or missing-tool coverage improvements.

## Attio: When should I use $contains for partial text matching in ATTIO_FIND_RECORD filters?

Tool slug(s): `ATTIO_FIND_RECORD`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For partial matching on text attributes in ATTIO_FIND_RECORD, structure the filter with the attribute slug mapped to a $contains condition, for example {"name": {"$contains": "John"}}. If exact-match behavior is reported, ask for the specific attribute/filter shape and use the contains-style filter as the first workaround.

## Attio: When should I use custom tools when an Attio API object is not built into Composio yet?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If an Attio endpoint is not covered by the built-in toolkit, create a custom tool or request the missing tool through the Composio request portal. Custom tools can use Composio-managed auth, so the user does not need to build the entire OAuth/token-storage layer themselves.

## Attio: Missing Attio meeting and call-recording get-by-id tools

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If Attio get-by-id tools for meetings and call recordings are missing, submit the exact endpoints through the tool request flow. Useful examples include `GET /v2/meetings/{id}`, `GET /v2/call_recordings/{id}`, and `GET /v2/call_recordings/{id}/transcript`.

## Attio: Top-level `$` parameter names in Attio schemas

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For schema failures caused by top-level `$`-prefixed parameter names, update to the latest tool schema/toolkit version. Current schemas avoid top-level `$` prefixes that some model providers reject. Nested `$` prefixes may still be accepted depending on the provider.

## Calendly: When should I use CALENDLY_POST_INVITEE instead of deprecated CALENDLY_CREATE_EVENT_INVITEE?

Tool slug(s): `CALENDLY_CREATE_EVENT_INVITEE`, `CALENDLY_POST_INVITEE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Calendly invitee creation flows, prefer `CALENDLY_POST_INVITEE` instead of `CALENDLY_CREATE_EVENT_INVITEE`. `CALENDLY_CREATE_EVENT_INVITEE` is planned for deprecation, so new implementations and migration guidance should point users to `CALENDLY_POST_INVITEE`.

## Canva: When should I use Canva autofill jobs when content must be populated into a design?

Tool slug(s): `CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET`, `CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB`, `CANVA_POST_DESIGNS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Canva workflows that need content inserted into a generated design, do not rely on the create-design endpoint/tool. `CANVA_CREATE_CANVA_DESIGN_WITH_OPTIONAL_ASSET` is deprecated and should be replaced with `CANVA_POST_DESIGNS`, but both the old and new create-design flows create a blank design by default and do not accept arbitrary content in the request. Use `CANVA_INITIATE_CANVA_DESIGN_AUTOFILL_JOB` for the content-population use case, because that flow is built around Canva's autofill capability.

## Confluence: When should I use `CONFLUENCE_GET_PAGE_BY_ID` to retrieve Confluence page content?

Tool slug(s): `CONFLUENCE_GET_PAGE_BY_ID`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `CONFLUENCE_GET_PAGE_BY_ID` to retrieve Confluence page content by page ID. This is the tool for page body retrieval.

## Confluence: `CONFLUENCE_UPDATE_PAGE` should be paired with `CONFLUENCE_GET_PAGE_VERSIONS` for versioned updates

Tool slug(s): `CONFLUENCE_GET_PAGE_VERSIONS`, `CONFLUENCE_UPDATE_PAGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Confluence page updates require the correct page version. Pair `CONFLUENCE_UPDATE_PAGE` with `CONFLUENCE_GET_PAGE_VERSIONS` so the agent can fetch the latest required version and then update the page. By default, the agent should update over the latest version unless a specific version is requested.

## Confluence: Download Confluence attachments by first getting attachment IDs

Tool slug(s): `CONFLUENCE_DOWNLOAD_ATTACHMENT`, `CONFLUENCE_GET_ATTACHMENTS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `CONFLUENCE_GET_ATTACHMENTS` to list attachments and get the attachment ID, then pass that ID to `CONFLUENCE_DOWNLOAD_ATTACHMENT` to download the file.

## Excel: What format should `EXCEL_UPDATE_RANGE` values use?

Tool slug(s): `EXCEL_UPDATE_RANGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Pass values as a two-dimensional array, where the outer list represents rows and each inner list contains the cell values for that row. Even a single cell must be wrapped twice, for example {"values": [["92"]]}.

## Excel: Excel upload tools accept structured workbook data

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use the revamped Excel tool shape that accepts structured data through worksheet_names and worksheet_data lists/dicts. The tool generates the .xlsx file before upload, instead of requiring the caller or LLM to provide binary workbook content directly.

## Excel: What can cause EXCEL_GET_RANGE failures?

Tool slug(s): `EXCEL_GET_RANGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If get range appears to fail while the tool itself is working, verify that the workbook actually has the requested worksheet name, such as Sheet1, and that the item_id being passed is the correct file ID for that workbook.

## Excel: When should I use Excel toolkit actions for workbook operations on SharePoint-backed Excel files?

Tool slug(s): `EXCEL_CLOSE_SESSION`, `EXCEL_DELETE_WORKSHEET`, `EXCEL_UPDATE_RANGE`, `EXCEL_UPDATE_WORKSHEET`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For workbook operations, use the Excel toolkit actions because they are Excel APIs. `EXCEL_CLOSE_SESSION`, `EXCEL_DELETE_WORKSHEET`, `EXCEL_UPDATE_WORKSHEET`, and `EXCEL_UPDATE_RANGE` are already supported for the remaining Excel use cases.

## Excel: Upgrade older on-prem versions if Excel schemas contain dollar-sign parameters

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Upgrade to a current release if Excel schemas contain dollar-sign parameters that are incompatible with Anthropic models. Current Excel toolkit versions should expose model-compatible schema fields.

## Excel: Generic column formatting and wrapping support was added in the May 13 release

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use the latest Excel toolkit version for generic column formatting, wrapping, and related sheet operations.

## Firecrawl: FIRECRAWL_SEARCH may be hidden by default tool list limits

Tool slug(s): `FIRECRAWL_SEARCH`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If `FIRECRAWL_SEARCH` or other Firecrawl tools are missing from a tools list, increase the list limit or paginate. The default list can return only the first 20 tools, so request a higher limit such as `limit=1000` when fetching Firecrawl tools.

## Firecrawl: When should I use FIRECRAWL_SCRAPE or FIRECRAWL_EXTRACT for web-content retrieval?

Tool slug(s): `FIRECRAWL_EXTRACT`, `FIRECRAWL_SCRAPE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For website content retrieval with Firecrawl, use `FIRECRAWL_SCRAPE` to scrape page content or `FIRECRAWL_EXTRACT` for extraction-style workflows. For broader web search, Composio Search may be a better fit depending on the use case.

## Gmail: When should I use `latest` or v3.1 for newer Gmail settings tools?

Tool slug(s): `GMAIL_GET_VACATION_SETTINGS`, `GMAIL_LIST_SEND_AS`, `GMAIL_PATCH_SEND_AS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: The v3 execute endpoint can default to base toolkit version `00000000_00` when no version is specified. For newer Gmail tools like `GMAIL_PATCH_SEND_AS`, `GMAIL_LIST_SEND_AS`, and `GMAIL_GET_VACATION_SETTINGS`, pass `version: "latest"` in the execute body or use the v3.1 endpoint, which defaults to latest.

## Gmail: When should I use `me` for Gmail `user_id` in tool calls?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Gmail tool calls, `me` can be used as the `user_id` to refer to the authenticated connected account.

## Gmail: `GMAIL_SEND_EMAIL` accepts at least one of `to`, `cc`, or `bcc`

Tool slug(s): `GMAIL_SEND_EMAIL`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `GMAIL_SEND_EMAIL` no longer needs a single required recipient field. At least one recipient channel such as `to` / `recipient_email`, `cc`, or `bcc` can be supplied, which keeps the tool flexible for different email composition flows.

## Gmail: Reduce Gmail fetch payload size with `include_payload=false`, `verbose=false`, `only_ids`, query, and limits

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Gmail fetch/list flows, reduce payload by setting `include_payload=false` and `verbose=false` where supported. For very lightweight flows, use `only_ids=true` and then fetch selected messages separately. Also use `max_results` and Gmail `query` filters to keep result sets small.

## Gmail: Verbose Gmail thread results cannot select custom fields and may not be chronological

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Custom field selection is not supported in that verbose mode because it would increase payload size and latency. When `verbose=true`, thread work can run concurrently, so returned results may be ordered by completion rather than strict chronology.

## Gmail: When should I use `from_email` to select Gmail send-as alias?

Tool slug(s): `GMAIL_SEND_EMAIL`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use the `from_email` parameter on `GMAIL_SEND_EMAIL` to choose the Gmail send-as alias.

## Gmail: When should I use Gmail label IDs, not label names, for label operations?

Tool slug(s): `GMAIL_LIST_LABELS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Gmail label operations and trigger label filters that require IDs, pass the label ID rather than the display name. Use `GMAIL_LIST_LABELS` to retrieve IDs.

## Gmail: Patch Gmail label colors with `background_color` and accepted color values

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: To patch a label color, use the label ID and pass background color as an object field such as `{ "background_color": "#FFFF0000" }`. Gmail only accepts specific label color values from the Gmail API reference.

## Google Ads: Campaign mutate 400s can be caused by unsupported inline Campaign fields

Tool slug(s): `GOOGLEADS_MUTATE_CAMPAIGNS`, `INVALID_ARGUMENT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `GOOGLEADS_MUTATE_CAMPAIGNS` may fail with Google Ads 400 `INVALID_ARGUMENT` errors such as `Unknown name "dailyBudget" at operations[0].update` or `Unknown name "targetedLocations" ... Cannot find field`. These failures happen when the request includes fields that are not valid inline Campaign resource fields. A real daily budget requires a CampaignBudget resource (`campaignBudgets:mutate`) and then passing the CampaignBudget resource name through `campaign_budget`. Location targeting belongs in CampaignCriterion mutations, not inline Campaign fields. Omit unsupported inline Campaign fields and use the matching Google Ads resource mutation instead.

## Google Docs: `GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN` accepts GitHub-Flavored Markdown and HTML tables

Tool slug(s): `GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN` accepts GitHub-Flavored Markdown. Markdown tables should work, and HTML tables can also be passed in the markdown payload when a table shape is needed.

## Google Docs: How do I read and edit Google Docs tabs?

Tool slug(s): `GOOGLEDOCS_GET_DOCUMENT_BY_ID`, `GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT`, `GOOGLEDOCS_REPLACE_ALL_TEXT`, `GOOGLEDOCS_REPLACE_IMAGE`, `GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Google Docs tab-level access is supported. For reading tabs, use `GOOGLEDOCS_GET_DOCUMENT_BY_ID` or `GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT`. For editing specific tabs, use `GOOGLEDOCS_REPLACE_ALL_TEXT`, `GOOGLEDOCS_REPLACE_IMAGE`, or `GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT`.

## Google Meet: Fetch transcript entries by first resolving the conference record

Tool slug(s): `GOOGLEMEET_GET_CONFERENCE_RECORD_FOR_MEET`, `GOOGLEMEET_GET_CONFERENCE_TRANSCRIPTS`, `GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID`, `GOOGLEMEET_LIST_CONFERENCE_RECORDS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Start by resolving the conference record, either with GOOGLEMEET_GET_CONFERENCE_RECORD_FOR_MEET when you have the meeting code, or with GOOGLEMEET_LIST_CONFERENCE_RECORDS when listing available records. Use the resulting conferenceRecord_id with GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID, then use the conference record and transcript values to list transcript entries. Prefer GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID over the older/misdescribed GOOGLEMEET_GET_CONFERENCE_TRANSCRIPTS path.

## Google Sheets: Fetch more than the default 20 Google Sheets tools with `limit`

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `get_raw_composio_tools` returns 20 tools by default. Pass a larger `limit` to fetch the full Google Sheets tool set, for example `.get_raw_composio_tools(toolkits=["GOOGLESHEETS"], limit=1000)`.

## Google Sheets: When should I use `GOOGLESHEETS_BATCH_UPDATE` or `GOOGLESHEETS_SHEET_FROM_JSON` to add values?

Tool slug(s): `GOOGLESHEETS_BATCH_UPDATE`, `GOOGLESHEETS_SHEET_FROM_JSON`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `GOOGLESHEETS_BATCH_UPDATE` when updating or adding values to an existing sheet. If the workflow starts from structured JSON and needs to create/populate a sheet, use `GOOGLESHEETS_SHEET_FROM_JSON`.

## Google Sheets: Execute Google Sheets tools by passing the exact tool slug

Tool slug(s): `GOOGLESHEETS_LIST_TABLES`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When executing Google Sheets tools, pass the exact slug directly as the tool identifier, for example `composio.tools.execute("GOOGLESHEETS_LIST_TABLES", executePayload)`. If a wrapper parameter like `params.toolIdentifier` is used, verify it resolves to the exact tool slug.

## Google Slides: When should I use Google Drive search to list or discover Google Slides presentations?

Tool slug(s): `GOOGLEDRIVE_FIND_FILE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Google Slides does not offer a dedicated endpoint to list all presentations through the Slides toolkit. Use `GOOGLEDRIVE_FIND_FILE` and filter Drive files with `q`, for example `mimeType = 'application/vnd.google-apps.presentation'`, then pass the returned presentation ID into the Google Slides tool.

## Google Slides: What is needed for `GOOGLESLIDES_PRESENTATIONS_GET`?

Tool slug(s): `GOOGLEDRIVE_FIND_FILE`, `GOOGLESLIDES_PRESENTATIONS_GET`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `GOOGLESLIDES_PRESENTATIONS_GET` should be called with the Google Slides presentation ID. Get that ID from the presentation URL, or use the ID returned by `GOOGLEDRIVE_FIND_FILE` when discovering presentations through Drive.

## Google Slides: `GOOGLEDRIVE_CREATE_FILE_FROM_TEXT` cannot create native Google Slides from text

Tool slug(s): `GOOGLEDRIVE_CREATE_FILE_FROM_TEXT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `GOOGLEDRIVE_CREATE_FILE_FROM_TEXT` cannot create native Google Slides from text because the Google Drive API does not support text-to-slides conversion. Passing `application/vnd.google-apps.presentation` can default to `text/plain`. Drive import supports presentation formats such as Microsoft PowerPoint and OpenDocument Presentation instead.

## Google Super: `GOOGLESUPER_LIST_LABELS` with `include_details=true` can be slow because it fans out per label

Tool slug(s): `GOOGLESUPER_LIST_LABELS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For `GOOGLESUPER_LIST_LABELS`, setting `include_details=true` fans out into one Gmail API call per label. Accounts with many labels can become slow because the calls happen sequentially. Set `include_details=false` or omit the parameter to return to a single API call and much lower latency.

## Google Super: `GOOGLESUPER_LIST_THREADS` verbose behavior trades payload/latency for detail and may return completion order

Tool slug(s): `GOOGLESUPER_LIST_THREADS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Selecting arbitrary fields is not supported in the thread-list response because it would increase payload size and latency, which conflicts with the purpose of the `verbose` flag. When `verbose=true`, thread enrichment runs concurrently, so results can appear in completion order rather than chronological order.

## Google Super: `resultSizeEstimate` was added to Gmail thread listing response

Tool slug(s): `GMAIL_LIST_THREADS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `resultSizeEstimate` was added to the response payload of `GMAIL_LIST_THREADS`. If a user expects this field through Google Super thread listing, verify the toolkit/tool version includes the update.

## Google Super: When should I use Gmail/Google Super query and label filters to find sent or labeled messages?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Gmail/Google Super tools are wrappers over Google APIs, so use Gmail-style `query` filters or `label_ids` where supported to filter messages, including sent-mail style queries. If the exact filter is not exposed, file a tool request for the endpoint/parameter.

## Google Super: Google Super cannot schedule Gmail emails out of the box

Tool slug(s): `RESEND_SEND_EMAIL`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Google Super does not support scheduling an email out of the box. Use another email sending toolkit such as `RESEND_SEND_EMAIL` if the user's use case can be met outside Gmail scheduled-send semantics.

## Google Super: Missing Google Super endpoints should be filed as tool requests, not toolkit requests

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If Google Super already exists but a specific endpoint is missing, file a tool request with the endpoint/API details. Toolkits are providers/services, while tools are individual endpoints/actions. Enterprise users are prioritized, but general requests are still reviewed.

## Instagram: When should I use `INSTAGRAM_LIST_ALL_MESSAGES` to fetch Instagram messages?

Tool slug(s): `INSTAGRAM_LIST_ALL_MESSAGES`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `INSTAGRAM_LIST_ALL_MESSAGES` to list Instagram messages. In playground, select the correct auth config/connected account; if the desired connected account does not appear, initiate a new connection for the test account and use that auth config.

## Instagram: `INSTAGRAM_POST_IG_MEDIA_COMMENTS` failures can be caused by an incorrect `ig_media_id`

Tool slug(s): `INSTAGRAM_POST_IG_MEDIA_COMMENTS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If `INSTAGRAM_POST_IG_MEDIA_COMMENTS` fails while the tool works in a direct test, verify the `ig_media_id` being passed. An incorrect media ID can cause the action to fail even though the tool itself is working.

## Intercom: What is the `INTERCOM_LIST_ALL_COMPANIES` `per_page` limit?

Tool slug(s): `INTERCOM_LIST_ALL_COMPANIES`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Intercom company listing through Composio, keep `per_page` at 60 or lower. The generic Intercom pagination page can be misleading for this endpoint; Composio verified the list companies endpoint limit as 60 and updated the field description accordingly.

## Intercom: Update Python SDK packages when Intercom tool schemas fail on reserved parameter names

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If Intercom tool schemas fail because of reserved parameter names, update both `composio` and `composio-langchain` to the latest available versions.

## Jira: What is required for Jira search pagination?

Tool slug(s): `JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET`, `JIRA_SEARCH_ISSUES`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Jira next-page tokens must be used as part of the same search flow and with the same search context that generated the token. Passing only `next_page_token` can fail because Jira expects the original JQL or filter context to remain attached to the paginated request. That can look like token expiry even when the token was consumed seconds after generation. Workaround: - For `JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET`, include the original `jql` together with `next_page_token` on every follow-up page. - For `JIRA_SEARCH_ISSUES`, include the original `jql` or the same original filter inputs, such as `project_key`, `updated_after`, etc., together with `next_page_token`. - Use the token immediately for the next page. - Do not persist old tokens or retry rejected tokens. If Jira returns `invalid or expired` even with the same original context, discard the token and restart pagination from page 1.

## Jira: When should I use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` instead of deprecated create metadata behavior?

Tool slug(s): `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS`, `JIRA_GET_ISSUE_CREATE_METADATA`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `JIRA_GET_CREATE_METADATA_ISSUE_TYPE_FIELDS` for the closest replacement behavior to the deprecated `JIRA_GET_ISSUE_CREATE_METADATA` flow. The replacement was added after Jira deprecated the older create-metadata API behavior.

## Jira: Download Jira attachments with `JIRA_GET_ATTACHMENT`

Tool slug(s): `JIRA_GET_ATTACHMENT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `JIRA_GET_ATTACHMENT` to retrieve the binary content of a Jira attachment by attachment ID. This tool is intended for downloading a specific file attached to a Jira issue.

## Linkedin: Fetch modern LinkedIn tools with `toolkit_slug=linkedin` and `toolkit_versions=latest`

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: The v3 tools-list endpoint defaults to the base toolkit version when no toolkit version is specified, which can return only legacy LinkedIn slugs. Use the singular filter `toolkit_slug=linkedin`; plural or alternate filters such as `toolkit_slugs`, `toolkits`, `app`, or `app_names` may be ignored. Add `toolkit_versions=latest` or an explicit version such as `20240624_00`. Example: `GET /api/v3/tools?toolkit_slug=linkedin&toolkit_versions=latest&limit=100`.

## Linkedin: Does LinkedIn post creation support image arrays through SDK/API?

Tool slug(s): `LINKEDIN_CREATE_LINKED_IN_POST`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `LINKEDIN_CREATE_LINKED_IN_POST` supports image + text posting, including multiple images when using SDKs or APIs directly. Pass an array of values to the `images` field. If image posting fails, first confirm the user is using a recent toolkit version, then use failed tool-call details for troubleshooting.

## Microsoft Teams: What is needed for Microsoft Teams one-on-one chat creation?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Microsoft Teams one-on-one chat creation, pass two users, not one. Also make sure the OData bind payload uses the correct role and bind-data format expected by Microsoft Graph.

## Microsoft Teams: Why does Microsoft Teams tool listing return only 20 tools?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When fetching Microsoft Teams tools by toolkit, the default list may return only 20 tools. Increase the `limit` parameter or search for exact tool slugs to retrieve the full set.

## Microsoft Teams: Some Microsoft Teams slugs were restored as deprecated aliases with replacement descriptions

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Some older Microsoft Teams slugs are deprecated aliases with descriptions pointing to replacement slugs. If a Teams slug disappears or changes, check the latest toolkit version/changelog and prefer the replacement slug.

## Microsoft Teams: Tool Router memory for Microsoft Teams should be a list under the toolkit key

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When passing Tool Router memory for Microsoft Teams, use a real list under the `microsoft_teams` key, for example `"memory": { "microsoft_teams": ["Session id..."] }`. Do not pass escaped square brackets as a string.

## Monday: What format should `MONDAY_UPDATE_ITEM` body use?

Tool slug(s): `MONDAY_UPDATE_ITEM`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `MONDAY_UPDATE_ITEM` expects the body in a format Monday's API accepts. If the user passes JSON-like text or strings containing quotes/special characters, escape those characters and send a suitable string rather than unsupported raw structured content.

## Notion: When should I use `NOTION_RETRIEVE_PAGE` instead of deprecated/invalid `NOTION_GET_PAGE`?

Tool slug(s): `NOTION_GET_PAGE`, `NOTION_RETRIEVE_PAGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `NOTION_GET_PAGE` is not the current valid slug. Use `NOTION_RETRIEVE_PAGE`, and verify available Notion tools from the marketplace/tool listing.

## Notion: When should I use `NOTION_FETCH_DATA`, not `NOTION_FETCH_NOTION_DATA`?

Tool slug(s): `NOTION_FETCH_DATA`, `NOTION_FETCH_NOTION_DATA`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `NOTION_FETCH_NOTION_DATA` is not valid. Use `NOTION_FETCH_DATA` instead.

## OneDrive: What should I pass for `version=latest` if OneDrive folder/list behavior looks stale?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If OneDrive folder listing or related tool behavior appears stale, pass `version: "latest"` in the tool execution request so the call uses the latest toolkit version instead of the default pinned version.

## OneDrive: What should I know about OneDrive upload/update file tools?

Tool slug(s): `ONE_DRIVE_UPDATE_FILE_CONTENT`, `ONE_DRIVE_UPLOAD_FILE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: OneDrive has upload/update tools such as `ONE_DRIVE_UPLOAD_FILE` and `ONE_DRIVE_UPDATE_FILE_CONTENT`. Use the current file-upload/data-URI path where supported so users can pass file content consistently, including base64-backed uploads when available.

## Openai: Does `OPENAI_CREATE_IMAGE` support `gpt-image-2` in the latest toolkit version?

Tool slug(s): `OPENAI_CREATE_IMAGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `gpt-image-2` has been shipped and can be used through `OPENAI_CREATE_IMAGE` on the latest toolkit version. If the model is missing, the user should update the toolkit/tool version before retrying.

## Openai: Provider/schema errors with OpenAI integrations

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When troubleshooting provider/schema errors with OpenAI or LangChain-style integrations, upgrade the relevant Composio SDK packages together. Update both core Composio and provider packages to the latest version before retesting.

## Outlook: Outlook/Gmail email attachments through SDK should be passed as file paths

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When using SDK automatic file handling for email attachments, pass the local file path directly in the `attachment`/`attachments` argument. Do not pass only a filename or raw content fields unless the tool schema explicitly asks for them.

## Outlook: What should I do if an Outlook email action is missing?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If an Outlook action such as add category, send draft, or pin email is not available, treat it as a tool request. If the exact Outlook action is unavailable, treat it as a tool request and use an available draft/send/category workflow where possible.

## Posthog: Fetch PostHog tool schema to see required fields for a tool call

Tool slug(s): `POSTHOG_CREATE_PROJECT_INSIGHTS_WITH_FORMAT_OPTION`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If a PostHog tool call fails because of missing or mixed-up parameters, fetch the tool schema by slug, for example `/api/v3/tools/POSTHOG_CREATE_PROJECT_INSIGHTS_WITH_FORMAT_OPTION`, using the project API key. The schema response shows the required fields and expected shapes for that tool call.

## Quickbooks: Missing QuickBooks expense/bill tools should be filed with the exact Intuit API reference

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If a QuickBooks endpoint is not available as a Composio tool, file a tool request and include the exact Intuit API reference or relevant docs. This helps the integrations team scope and prioritize the missing QuickBooks action.

## Reddit: Older Reddit Create Post tool versions may require `flair_id`

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If Reddit Create Post fails on version `00000000_00`, check whether the request is missing `flair_id`; that old version requires it. Prefer pinning a specific current toolkit/tool version to avoid breaking changes. In recent Reddit tool versions, `flair_id` is no longer required for the Create Post call.

## Salesforce: When should I use `SALESFORCE_GET_ALL_FIELDS_FOR_OBJECT` to inspect a Salesforce object's fields?

Tool slug(s): `SALESFORCE_GET_ALL_FIELDS_FOR_OBJECT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `SALESFORCE_GET_ALL_FIELDS_FOR_OBJECT` when you need to inspect the fields available on a Salesforce object. This is the right tool for schema discovery before building object-specific queries or update flows. ![Salesforce tool details panel showing SALESFORCE_GET_ALL_FIELDS_FOR_OBJECT and its required object_name input.](/images/kb/toolkits/salesforce/salesforce-get-all-fields-input.png)

## Salesforce: Migrate deprecated Salesforce retrieve tools to the newer get/list tools

Tool slug(s): `SALESFORCE_GET_CONTACT`, `SALESFORCE_GET_LEAD`, `SALESFORCE_LIST_OPPORTUNITIES`, `SALESFORCE_RETRIEVE_LEAD_BY_ID`, `SALESFORCE_RETRIEVE_OPPORTUNITIES_DATA`, `SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use the newer Salesforce tool slugs instead of the deprecated retrieve variants: `SALESFORCE_RETRIEVE_LEAD_BY_ID` -> `SALESFORCE_GET_LEAD`, `SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID` -> `SALESFORCE_GET_CONTACT`, and `SALESFORCE_RETRIEVE_OPPORTUNITIES_DATA` -> `SALESFORCE_LIST_OPPORTUNITIES`.

## Salesforce: Retrieve a specific Salesforce contact by first listing contacts and then fetching by ID

Tool slug(s): `SALESFORCE_RETRIEVE_CONTACT_INFO_WITH_STANDARD_RESPONSES`, `SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `SALESFORCE_RETRIEVE_CONTACT_INFO_WITH_STANDARD_RESPONSES` to list contacts and capture the IDs with their names. Then call `SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID` with the desired contact ID to fetch the specific contact details. If using newer tool versions, prefer the replacement contact-get tool where available.

## Serpapi: When should I avoid SERPAPI_EBAY_SEARCH when its schema causes field errors?

Tool slug(s): `SERPAPI_EBAY_SEARCH`, `SERPAPI_GOOGLE_JOBS_SEARCH`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If loading all SerpAPI tools fails because of a schema field error, check whether the failing action is `SERPAPI_EBAY_SEARCH`. Other SerpAPI tools may still work. As a workaround, request a specific working action, for example `toolset.get_tools(actions=["SERPAPI_GOOGLE_JOBS_SEARCH"])`, instead of loading the entire SerpAPI app.

## Shopify: When should I use `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries?

Tool slug(s): `SHOPIFY_GRAPH_QL_QUERY`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use the updated Shopify GraphQL tool slug `SHOPIFY_GRAPH_QL_QUERY` for Shopify GraphQL queries. If the tool is not visible in tool discovery, make sure enough tools are being fetched and that the tool is enabled in the MCP/config being used.

## Shopify: When should I use `SHOPIFY_GET_ORDER_LIST` to confirm orders and retrieve order IDs?

Tool slug(s): `SHOPIFY_GET_ORDER_LIST`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Call `SHOPIFY_GET_ORDER_LIST` first to confirm the store has orders and to retrieve the order ID from the response payload. Then pass that returned order ID into follow-up order actions such as retrieving or updating a specific order.

## Slack: Download Slack file content using file ID

Tool slug(s): `SLACK_DOWNLOAD_SLACK_FILE`, `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Slack file download is supported through `SLACK_DOWNLOAD_SLACK_FILE`. Pass the Slack file ID, which starts with `F` such as `F123ABCDEF0`. The tool returns downloadable file content plus metadata such as name, mimetype, and size. If the file ID is unknown, first call `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK` to find file IDs, then pass the selected ID to the download tool.

## Slack: What should I know about Slack scheduled-message attachments?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: The `attachments` field on Slack scheduled messages refers to Slack's legacy secondary/rich-formatting attachments, not uploaded files. Slack's `chat.scheduleMessage` API does not natively upload files. Files must be uploaded separately, for example with `files.upload` / `files.upload.v2`, and then linked or embedded into the scheduled message body so they unfurl when the scheduled message is posted.

## Slackbot: Slack file downloads use `SLACK_DOWNLOAD_SLACK_FILE` with a Slack file ID

Tool slug(s): `SLACK_DOWNLOAD_SLACK_FILE`, `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Slack file content can be downloaded with `SLACK_DOWNLOAD_SLACK_FILE`. The tool needs the Slack file ID, usually starting with `F`. If the user does not have the file ID yet, use `SLACK_LIST_FILES_WITH_FILTERS_IN_SLACK` first and pass the returned file ID to the download tool.

## Slackbot: Which Slackbot send-message slug should I use?

Tool slug(s): `SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL`, `SLACKBOT_SEND_MESSAGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `SLACKBOT_SEND_MESSAGE` is not the Slackbot send-message tool slug. Use the actual Slackbot send-message slug exposed by the toolkit, such as `SLACKBOT_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL`, or fetch tool slugs dynamically before execution.

## Snowflake: Snowflake statement results may require checking each partition

Tool slug(s): `SNOWFLAKE_SNOWFLAKE_CHECK_STATEMENT_STATUS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If a Snowflake query returns partial results, check whether the result set is split into partitions. Snowflake may not return all partitions in a single tool call. Use `SNOWFLAKE_SNOWFLAKE_CHECK_STATEMENT_STATUS` for each partition/result page to retrieve the remaining results.

## Stripe: MRR can be calculated from `STRIPE_LIST_SUBSCRIPTIONS`

Tool slug(s): `STRIPE_LIST_SUBSCRIPTIONS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `STRIPE_LIST_SUBSCRIPTIONS` to retrieve subscription data, then calculate MRR from the returned subscriptions in the agent/application layer.

## Tavily: When should I use COMPOSIO_SEARCH_TAVILY for Tavily search?

Tool slug(s): `COMPOSIO_SEARCH_TAVILY`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use the updated Tavily search tool slug `COMPOSIO_SEARCH_TAVILY` when invoking Tavily search through Composio. If an older Tavily search slug returns schema-related gateway errors, switch to this slug before further investigation.

## Webflow: How do I create or update Webflow collection items with the draft/live flag?

Tool slug(s): `WEBFLOW_CREATE_COLLECTION_ITEM`, `WEBFLOW_UPDATE_COLLECTION_ITEM`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `WEBFLOW_CREATE_COLLECTION_ITEM` to create a collection item and set whether it is draft or live with the `is_draft` parameter. Use `WEBFLOW_UPDATE_COLLECTION_ITEM` to update an existing item. If the user specifically needs Webflow v2's dedicated individual collection-item publish/live endpoints, treat that as separate publish-collection-item support rather than the basic create/update flow.

## Webflow: When should I use the current Webflow toolkit version for recently added page tools?

Tool slug(s): `WEBFLOW_GET_PAGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When a recently added Webflow tool such as `WEBFLOW_GET_PAGE` is not found through the API, pass the toolkit/tool version explicitly. The default version can be older than the newest available Webflow toolkit version. Use the latest Webflow toolkit version shown by Composio for API calls that need newly added tools.

## Whatsapp: Does `WHATSAPP_SEND_TEMPLATE_MESSAGE` support `components` in newer toolkit versions?

Tool slug(s): `WHATSAPP_SEND_TEMPLATE_MESSAGE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Support for `components` was added to the WhatsApp send-template flow in a newer toolkit version. If a user cannot pass template variables/components, they should upgrade to the latest WhatsApp toolkit version and verify the `components` field is available in the tool schema.

## Whatsapp: When sending WhatsApp messages, pass real `phone_number_id` and `to_number` values?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For WhatsApp send-message actions, make sure the action arguments contain the actual `phone_number_id` and recipient `to_number`. Placeholder values in the tool arguments will fail even if the connected account itself is active.

## Wrike: When should I use the Wrike user id, not the account id, when assigning or updating task users?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Wrike task update or assignment fields, pass the Wrike user `id` value rather than the `accountId`. Wrike's API validates the user `id` shown in the user object, not the account ID.

## Wrike: Wrike task responses expose multiple user-id fields and can resolve names

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Wrike task data can contain several user-id fields, including `authorIds`, `responsibleIds`, `sharedIds`, and `followerIds`. For fetch-task results, use the `resolve_user_names` parameter, which is enabled by default, to return those ids along with their names. If identifying the creator specifically, check `authorIds`.

## Wrike: When should I use the Composio proxy endpoint or SDK executeRequest for direct Wrike API calls?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For direct Wrike API calls through an existing Composio connected account, call the Composio proxy endpoint with the Wrike path and method, for example `endpoint: "/tasks"`, `method: "GET"`, and the `connected_account_id`. In SDK code, the same pattern can be done with `toolset.client.actions.executeRequest({ connectedAccountId, endpoint: "/tasks", method: "GET", parameters: [] })`. Ensure endpoint values are quoted strings.

## Wrike: When should I use Wrike toolkit version 20260204_00 or latest for nested folder pagination?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Wrike folder APIs, avoid the older `00000000_00` toolkit version when dealing with nested folders. Use version `20260204_00` or `latest` for recursive nested-folder pagination.

## Youtube: How should I use `YOUTUBE_UPLOAD_VIDEO` with `videoFilePath`?

Tool slug(s): `YOUTUBE_UPLOAD_VIDEO`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `YOUTUBE_UPLOAD_VIDEO` is intended to be used through the SDK because it accepts `videoFilePath`. Pass a full local file path string such as `/path/to/video.mp4`, and use the latest toolkit version when troubleshooting older upload failures.

## Youtube: When should I use direct file paths or multipart upload for YouTube videos; `FileUploadable`/S3 has a 50 MB limit?

Tool slug(s): `YOUTUBE_MULTIPART_UPLOAD_VIDEO`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For YouTube video uploads, prefer passing a local file path through SDK automatic file handling. `FileUploadable` objects go through Composio S3 and may be too small for many videos. If `YOUTUBE_MULTIPART_UPLOAD_VIDEO` is available in the current toolkit version, use that path for larger uploads.

## Zendesk: Include `toolkit_versions` when listing Zendesk tools through the API

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When listing Zendesk tools through the API, include the toolkit version query parameter. For example, use `toolkit_versions=latest&toolkit_slug=zendesk&limit=1000`. Without the toolkit version query, the API response may not show the expected tool set.

## Zendesk: When should I use `ZENDESK_SEARCH_ZENDESK`?

Tool slug(s): `ZENDESK_SEARCH_ZENDESK`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `ZENDESK_SEARCH_ZENDESK` for Zendesk search workflows.

## Zendesk: When should I use `ZENDESK_UPDATE_ZENDESK_TICKET`?

Tool slug(s): `ZENDESK_UPDATE_ZENDESK_TICKET`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `ZENDESK_UPDATE_ZENDESK_TICKET` for Zendesk ticket updates. For endpoint-level context, the corresponding Zendesk API is the Update Ticket endpoint in Zendesk's ticketing API.

## Zoho: Does `ZOHO_MAIL_MESSAGES_SEND_EMAIL` support attachments in newer versions?

Tool slug(s): `ZOHO_MAIL_MESSAGES_SEND_EMAIL`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Attachment support was added to `ZOHO_MAIL_MESSAGES_SEND_EMAIL`. If a user cannot send attachments with Zoho Mail, they should use a current toolkit version and verify the send-email tool schema includes attachment fields.

## Zoho: What if Zoho Mail attachment download is not available?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Zoho Mail attachment download may need to be handled as a tool request when the action is not available in the current toolkit. File the exact attachment-download use case through the tool request flow.

## Zoho: Zoho Books create-estimate moved to the `zoho_invoice` toolkit

Tool slug(s): `ZOHO_INVOICE_CREATE_ESTIMATE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For creating estimates, use the `zoho_invoice` toolkit action `ZOHO_INVOICE_CREATE_ESTIMATE`. The estimate tool has shifted away from the Zoho Books toolkit.

## Zoho: Zoho Books bill tools exist, but missing purchase-order/bill flows may require a feature request

Tool slug(s): `ZOHO_BOOKS_GET_BILL`, `ZOHO_BOOKS_LIST_BILLS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Zoho Books has tools such as `ZOHO_BOOKS_GET_BILL` and `ZOHO_BOOKS_LIST_BILLS`. If the user's required bill or purchase-order endpoint is not exposed, capture the exact Zoho Books API endpoint and file it as a tool request.

## Zoho: `ZOHO_BOOKS_LIST_ITEMS` has no default `rate`; optional fields can be omitted

Tool slug(s): `ZOHO_BOOKS_LIST_ITEMS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `rate` on `ZOHO_BOOKS_LIST_ITEMS` is optional and has no default value in the schema. If an agent sends `rate: 25.5` or another value, that is coming from the model/tool-call generation, not from a Composio schema default. Prompt the model not to pass optional fields unless needed, or call the tool directly with only required arguments.

## Zoho: When should I use `ZOHO_GET_ZOHO_RECORDS` to find a `lead_id` before converting a Zoho lead?

Tool slug(s): `ZOHO_GET_ZOHO_RECORDS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Zoho lead conversion, verify the `lead_id` first. Use `ZOHO_GET_ZOHO_RECORDS` to retrieve the lead record and obtain the correct `lead_id`, then pass that value into the conversion tool.

## Zoho: How does Zoho record-list pagination work?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Zoho list endpoints may return around 200 records per request and require pagination with `page_token` for larger result sets. Multiple tool calls may be needed, and Zoho's own API rate limits can still apply.

## Zoho: Zoho Mail account IDs should be treated as strings to avoid JS safe-integer precision loss

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Zoho Mail account IDs can exceed JavaScript's safe integer range, so they should be modeled and passed as strings. Preserve `account_id` as a string all the way from user input to tool execution.

## Zoho Books: When should I use Zoho Invoice for create estimate?

Tool slug(s): `ZOHO_BOOKS_CREATE_ESTIMATE`, `ZOHO_INVOICE_CREATE_ESTIMATE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `ZOHO_BOOKS_CREATE_ESTIMATE` is no longer the Zoho Books tool to use for estimates. Route create-estimate workflows to the Zoho Invoice toolkit and use `ZOHO_INVOICE_CREATE_ESTIMATE` instead.

## Zoho Books: When should I use existing bill read tools or file a request for missing bill creation?

Tool slug(s): `ZOHO_BOOKS_GET_BILL`, `ZOHO_BOOKS_LIST_BILLS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For existing bill coverage in Zoho Books, point users to `ZOHO_BOOKS_GET_BILL` and `ZOHO_BOOKS_LIST_BILLS`. If they need an unavailable create/update flow, ask them to file a tool request and confirm the intended Zoho Books API endpoint, such as Zoho's create-a-bill endpoint, so the request can be tracked precisely.

## Zoho Books: Optional Zoho Books item rate filters do not have default values

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: The Zoho Books item `rate` field and related rate filters are optional. Composio does not set default values for those fields; if omitted, they default to null behavior. If an agent includes `0` or another value, treat that as model/tool-call behavior and inspect the tool schema with the get-tools-by-slug API reference or adjust the agent/tool-call layer so optional rate filters are not sent unless explicitly requested.

## Zoho Books: Pin Zoho Books toolkit version when reproducing list-items behavior

Tool slug(s): `ZOHO_BOOKS_LIST_ITEMS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When reproducing or sharing a controlled snippet for Zoho Books list-items behavior, pin the toolkit version in the SDK configuration, for example `toolkit_versions={"zoho_books": "20260211_00"}`, then request `ZOHO_BOOKS_LIST_ITEMS` explicitly for the user's connected account context.

## Zoho Mail: Does ZOHO_MAIL_MESSAGES_SEND_EMAIL support sending attachments?

Tool slug(s): `ZOHO_MAIL_MESSAGES_SEND_EMAIL`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `ZOHO_MAIL_MESSAGES_SEND_EMAIL` supports sending attachments. If a user previously saw missing attachment support, ask them to retry on the latest/current toolkit behavior and check the tool call details if attachment sending still fails.

## Zoho Mail: How should I pass Zoho Mail `account_id` values?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Treat Zoho Mail `account_id` values as strings, not integers. Zoho account IDs can exceed JavaScript's safe integer limit, and numeric coercion can silently truncate them before the tool call reaches Zoho. If a user sees unexpected account IDs or tool failures with long IDs, verify the schema and payload preserve `account_id` as a string.

## Zoho Mail: Zoho Mail attachment download support should be treated as a feature request when absent

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If a user needs Zoho Mail attachment download and the current toolkit does not expose that action, submit the exact attachment-download use case through the tool request flow.

## Zoom: What is needed for `ZOOM_GET_A_MEETING_SUMMARY`?

Tool slug(s): `ZOOM_GET_A_MEETING_SUMMARY`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Zoom meeting summaries, verify that the meeting was created with `settings__auto_start_meeting_summary=true`. Then fetch the correct past-meeting UUID from Zoom's `/v2/past_meetings/{meetingId}/instances` endpoint and use that UUID with `ZOOM_GET_A_MEETING_SUMMARY`; the numeric meeting ID alone may not be sufficient.

## Canvas: What should I know about `CANVAS_CREATE_CALENDAR_EVENT` user IDs and Canvas API field names?

Tool slug(s): `CANVAS_CREATE_CALENDAR_EVENT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For `CANVAS_CREATE_CALENDAR_EVENT`, a Canvas user ID can be used where accepted by the Canvas API. Composio keeps Canvas API field names to stay consistent with the provider API, so rely on each field description for accepted values when the field name is ambiguous.

## Canvas: How do Canvas list and fetch endpoints handle pagination?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Canvas list endpoints follow Canvas API pagination behavior. Where supported, pass `per_page` to control how many records are returned in a response. If a Canvas action appears capped or returns a smaller page, check whether the relevant tool version supports `per_page` and upgrade if needed.

## Canvas: Canvas discussion topics and announcements require `only_announcements` selection

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Canvas discussion topics, use `only_announcements: false` or omit it when calling the discussion-topic flow. For announcements, use `only_announcements: true`. Canvas cannot return both discussion topics and announcements in one combined call for this case, so make two separate API calls and merge the results client-side if both are needed.

## Canvas: Canvas quiz matching question answers use unprefixed answer field keys

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Canvas quiz matching question answers, use `comments_html`, `text`, `weight`, `match_left`, and `match_right`. Do not use `answer_comments_html`, `answer_text`, `answer_weight`, `answer_match_left`, or `answer_match_right` for this payload.

## Canvas: Older Canvas toolkit versions cannot be patched in place

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Composio cannot patch older toolkit versions in place. If a Canvas schema or behavior change is released in a newer version, the path is to upgrade the toolkit version. Users can compare differences between toolkit versions in the dashboard before upgrading.

## Canvas: What should I know about Canvas response schemas?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Canvas response schema improvements are not universal across all fetch/list tools yet. Some recently updated or newly released tools have response schemas, but older Canvas tools may still differ. Treat these response shapes as tool/version-specific and pin or upgrade versions carefully when response shape stability matters.

## Dropbox: What should I pass for file paths to SDK attachment arguments rather than base64/file metadata objects?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When using the SDK attachment argument for supported email tools, pass a file path rather than an object containing filename, data, and content type. The SDK handles the file path. If the source file is available at a Dropbox-backed path, pass that Dropbox file path directly in the attachment argument.

## Facebook: `FACEBOOK_DELETE_POST` failures on older toolkit versions

Tool slug(s): `FACEBOOK_DELETE_POST`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If `FACEBOOK_DELETE_POST` fails on an older pinned toolkit version, try the latest Facebook toolkit version first. Remove the toolkit version pin or pass `latest` according to the SDK/API path being used.

## Facebook: Meta Ads toolkit was updated to API version v24.0

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Meta Ads API version questions, verify the active toolkit version because Meta versions change over time and users may be pinned to an older toolkit version.

## Facebook: What is needed for WhatsApp template sending?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For WhatsApp template sending, the user needs an approved/existing template before sending. If the flow depends on automatically creating templates or discovering the Phone Number ID and the toolkit does not expose the needed tools, submit the exact template and phone number workflow through the tool request flow.

## Gemini: Which Gemini Veo model names should I use for video generation?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Gemini video generation, use supported Veo models such as `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.0-generate-001`, or `veo-3.0-fast-generate-001`. If the default model fails, explicitly pass a current supported Veo model.

## Gemini: When should I use `GEMINI_GET_VIDEOS_OPERATION` or `GEMINI_WAIT_FOR_VIDEO` before using generated video URLs?

Tool slug(s): `GEMINI_GET_VIDEOS_OPERATION`, `GEMINI_WAIT_FOR_VIDEO`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Gemini video generation is asynchronous. Wait until the operation completes with `GEMINI_GET_VIDEOS_OPERATION` or use `GEMINI_WAIT_FOR_VIDEO`; the completed result should include a temporary publicly accessible `s3url` that can be viewed or downloaded.

## Gemini: Disable automatic file handling when Gemini generated files should remain as URLs/content

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Composio SDKs automatically handle file upload/download by default. For Gemini generated images or similar file outputs, disable automatic file handling with `autoUploadDownloadFiles: false` / `auto_upload_download_files=False` where supported, or update to a version that supports that option.

## Gemini: What can cause Gemini schema errors?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Gemini models/providers can have schema compatibility differences because Gemini uses OpenAPI-style schema handling rather than full JSON Schema support in some paths. If a schema works in OpenAI/Claude but fails in Gemini, check provider schema limitations and upgrade Composio/provider SDKs.

## Google Analytics: When should I use latest toolkit version when Google Analytics tools return ToolNotFound or only a few tools?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If Google Analytics tools return `ToolNotFound` or the tools API only returns a small subset of Google Analytics tools, pass the latest toolkit version. For tools listing, use query params like `toolkit_versions=latest&toolkit_slug=google_analytics&limit=1000`. Older pinned/default versions can expose far fewer tools than the latest version.

## Google Maps: What should I use instead of deprecated `GEOCODING_API`?

Tool slug(s): `GEOCODING_API`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `GEOCODING_API` belongs to a different toolkit and has been deprecated. Do not require it as part of normal `google_maps` toolkit usage; use the current Google Maps toolkit tool slugs instead.

## Google Ads: Google Ads toolkit versions should be passed without the dashboard `v` prefix

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: The SDK expects toolkit version strings without the `v` prefix. If the dashboard shows `v20260429_00`, pass `20260429_00` in `toolkitVersions` or per-execution `version`. `dangerouslySkipVersionCheck` is a per-execution option inside the `tools.execute()` payload, not a constructor option. Sessions can manage toolkit versions automatically if the user migrates to session-based execution.

## Google Drive: Google Drive upload tools can accept local file paths or URLs through SDK auto file handling

Tool slug(s): `GOOGLEDRIVE_UPLOAD_FILE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For tools that support file-upload parameters such as `s3key`, `mimetype`, and `name`, the SDK can rewrite those parameters automatically. The caller can pass a local file path or URL string, and the SDK reads the file, uploads it to Composio-managed storage, and constructs the provider payload before executing the tool. For `GOOGLEDRIVE_UPLOAD_FILE`, passing `file_to_upload: "/path/to/file.pdf"` is the intended SDK pattern when auto file handling is enabled.

## Google Drive: When should I disable SDK auto file handling?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If the SDK is converting downloaded file output into a local path and the application needs the raw URL or file payload, disable automatic file handling for the execution path. Use the documented `auto_upload_download_files=False` / disabling-auto-file-handling option, and make sure the relevant Composio SDK packages are upgraded to a version that supports that behavior.

## Google Drive: A missing Google Drive tool can be caused by passing an invalid toolkit version

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If a Google Drive tool appears missing, check whether the request is pinned to a toolkit version that exists. Passing an invalid version such as a non-existent dated version can make tools unavailable. Retry with a valid Google Drive toolkit version, or use the latest version when a pinned version is not required.

## Google Drive: Do Google Drive tool-execution requests need an `arguments` object?

Tool slug(s): `GOOGLEDRIVE_LIST_FILES`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When calling tool execution APIs such as `GOOGLEDRIVE_LIST_FILES`, include the `arguments` object in the request body. If the tool does not need arguments for that call, send an empty object such as `"arguments": {}` along with the connected account, user/entity ID, and version fields.

## Google Slides: When should I use the same Google account when pairing Drive discovery with Google Slides reads?

Tool slug(s): `GOOGLEDRIVE_FIND_FILE`, `GOOGLESLIDES_PRESENTATIONS_GET`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: When a workflow discovers presentations with `GOOGLEDRIVE_FIND_FILE` and then reads them with `GOOGLESLIDES_PRESENTATIONS_GET`, make sure the connected Google Drive and Google Slides accounts are the same account. Otherwise the ID may be valid in Drive discovery but inaccessible to the Slides connection.

## Hubspot: Old HubSpot SDK/toolkit versions use old double-prefixed slugs

Tool slug(s): `HUBSPOT_HUBSPOT_LIST_CONTACTS`, `HUBSPOT_LIST_CONTACTS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Update the SDK and explicitly use the latest HubSpot toolkit version. Older versions used slugs like `HUBSPOT_HUBSPOT_LIST_CONTACTS`; newer versions use slugs like `HUBSPOT_LIST_CONTACTS`.

## Klaviyo: Klaviyo schema keys that exceed Claude's 64-character limit

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Klaviyo tool schemas that fail Claude validation because flattened nested property keys exceed 64 characters, update or re-fetch the latest tools/schema before retrying. Current schema generation avoids the long flattened keys and top-level `$` parameter names that can trigger model-provider validation errors.

## Linkedin: How do I fix LinkedIn 426 NONEXISTENT_VERSION by using the latest toolkit version?

Tool slug(s): `NONEXISTENT_VERSION`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: LinkedIn 426 `NONEXISTENT_VERSION` errors usually mean the request is using an older LinkedIn API version header. In Composio, this often happens when calls run on the base toolkit version `00000000_00` or another older pinned version. Specify the latest LinkedIn toolkit version on tool calls, or pin to the current fixed version if needed. If the error persists after switching to the latest version, collect a failed call `logId` or request ID so the actual `LinkedIn-Version` header can be verified.

## Outlook: What should I know about Outlook shared mailboxes, pass the shared mailbox address as `user_id`/mailbox target?

Tool slug(s): Toolkit-level tool metadata or missing-tool coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Outlook shared mailbox operations, pass the shared mailbox address, for example `shared@domain.com`, instead of `me`/primary mailbox where the tool expects the mailbox user. Delegated access must already be granted in the Microsoft tenant. This applies to delegated and S2S/application auth patterns where the tenant permissions allow shared mailbox access.

## Outlook: Outlook multi-account sessions require explicit per-call `account` selection and aliases

Tool slug(s): `COMPOSIO_MULTI_EXECUTE_TOOL`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For multi-account Outlook sessions, every connected account needs a unique non-null alias, the session should set `multi_account.enable=true` and `require_explicit_selection=true`, and the LLM must set the `account` field on each item in `COMPOSIO_MULTI_EXECUTE_TOOL.tools[]`. Without explicit selection, Tool Router cannot disambiguate and may default to one account.

## Spotify: Spotify playlist tools that fail on older endpoints

Tool slug(s): `SPOTIFY_GET_PLAYLIST_ITEMS`, `SPOTIFY_UPDATE_PLAYLIST_ITEMS`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If `SPOTIFY_GET_PLAYLIST_ITEMS` or `SPOTIFY_UPDATE_PLAYLIST_ITEMS` fails with 403 or older endpoint behavior, check whether the tool version is using a deprecated Spotify endpoint. Use the latest Spotify toolkit version where possible.

## Supabase: How do I use `SUPABASE_BETA_RUN_SQL_QUERY`?

Tool slug(s): `SUPABASE_BETA_RUN_SQL_QUERY`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `SUPABASE_BETA_RUN_SQL_QUERY` is still supported. Create a Supabase integration/MCP server and explicitly configure the Supabase SQL tool in that MCP server if it is not shown on the simplified Supabase MCP page.

## Canvas: When should I use shorter polling intervals for Canvas triggers when longer intervals misbehave?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Canvas trigger setups that need timely delivery, use shorter polling intervals where available, usually around 1-5 minutes.

## Canvas: Canvas trigger payloads expose Canvas user ID separately as `canvas_user_id`

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Canvas trigger payloads now separate the Canvas-side user identifier from Composio's user identifier. Use `canvas_user_id` for the Canvas LMS user and `user_id` for the Composio/project user. This avoids ambiguity when both identifiers are present in the same payload.

## Dropbox: What does `path` mean for Dropbox uploads?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For the Dropbox upload action, `path` is the destination path inside Dropbox, while `content` is the local file path that should be uploaded. Provide the local file path in `content`.

## Dropbox: When should I use DROPBOX_GET_ABOUT_ME to confirm which Dropbox account is connected?

Tool slug(s): `DROPBOX_GET_ABOUT_ME`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If Dropbox files or folders appear to be missing after a successful operation, confirm the connected Dropbox account before further investigation. Use `DROPBOX_GET_ABOUT_ME` to inspect the account tied to the active Composio connection and compare it with the Dropbox account the user is checking manually.

## Excel: Shared item listing cannot reliably search for a specific shared file

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: The shared-items response can change because the underlying Microsoft sharedWithMe API/tool lacks filters for retrieving a specific expected file after sharing, deleting, or stopping sharing items. Use the file ID or drive item metadata when you need to target a specific shared workbook.

## Figma: What should I know about Figma tools?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Figma tools should be usable regardless of whether the connection uses Composio-managed OAuth, a custom OAuth app, or token/API-key auth. If a user cannot find a tool, fetch available tools dynamically and check the auth scopes required by that tool.

## Figma: Common Figma design-token tools include extract, Tailwind conversion, and component fetch

Tool slug(s): `FIGMA_EXTRACT_DESIGN_TOKENS`, `FIGMA_DESIGN_TOKENS_TO_TAILWIND`, `FIGMA_GET_COMPONENT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Figma design token and component workflows, use `FIGMA_EXTRACT_DESIGN_TOKENS`, `FIGMA_DESIGN_TOKENS_TO_TAILWIND`, and `FIGMA_GET_COMPONENT`. If a needed Figma tool is missing, file a tool request.

## Gemini: When should I use newer Gemini models such as `gemini-2.5-flash` instead of old `gemini-1.5-flash` defaults?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If Gemini tool calls fail with older model names, switch to a newer Gemini model such as `gemini-2.5-flash`. Model availability changes over time, so verify the current model list when a model-name error appears.

## Gemini: What should I know about LangChain MCP tools?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Composio MCP tools with LangChain are not limited to OpenAI. They can work with any LLM/framework path that supports LangChain function calling capabilities, including Gemini and Claude.

## Github: List GitHub organizations and repositories for the authenticated user

Tool slug(s): `GITHUB_LIST_ORGANIZATIONS_FOR_THE_AUTHENTICATED_USER`, `GITHUB_LIST_ORGANIZATION_REPOSITORIES`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `GITHUB_LIST_ORGANIZATIONS_FOR_THE_AUTHENTICATED_USER` to list organizations available to the authenticated GitHub user. Then use `GITHUB_LIST_ORGANIZATION_REPOSITORIES` to list repositories for a selected organization. During connection, the user should be able to choose the organization they want to grant access to.

## Gmail: What should I know about Gmail attachments over MCP, upload files before tool execution?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Temporary S3/file instances are short-lived. Use `files.upload` before tool execution via the SDK or MCP flow, then pass the resulting `FileUploadable`/uploaded file object to the agent/tool call.

## Gmail: Filter Gmail new-message trigger by label/query instead of label IDs

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Gmail new-message trigger setup, use a Gmail query such as `label:sent OR label:category_personal` to filter matching messages. This avoids depending on label IDs for that trigger path.

## Gong: Gong MCP tool scopes can be read from tool annotations in the tools API

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Gong MCP tools, scopes were exposed through the `annotations` field from the `listTools` API per the newer MCP spec. If a user needs to reason about Gong scopes, inspect tool annotations from the tools API instead of relying only on static docs.

## Google Analytics: Add Google Analytics to an MCP config as a selected tool/toolkit

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: To use Google Analytics through MCP, create an MCP config with Google Analytics selected, or edit an existing MCP config and add Google Analytics as a tool/toolkit. Then follow the MCP quickstart to connect and use the generated MCP configuration.

## Google Maps: Validate Places `includedTypes` against Google's supported place types

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Google Maps Places requests, `includedTypes` must use values supported by Google's Places API. If a request fails with an invalid argument around `includedTypes`, compare the value against Google's supported place type lists and replace unsupported values before retrying.

## Googlecalendar: Which Google Calendar trigger should I use for full event data?

Tool slug(s): `GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_SYNC_TRIGGER`, `GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_CHANGE_TRIGGER`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_SYNC_TRIGGER` when your workflow needs full event details, attendees, and metadata. `GOOGLECALENDAR_GOOGLE_CALENDAR_EVENT_CHANGE_TRIGGER` is a real-time webhook trigger that returns event metadata only and is planned for deprecation. For basic real-time notifications, Event Changes can still be used; for richer event payloads, use Event Sync.

## Googledrive: Google Drive file-browser UIs should prefer direct tool execution over MCP

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Using Composio MCP for a Google Drive file browser is feasible, but MCP servers are designed primarily for AI assistant integrations. For a product UI or deterministic file browser, prefer Direct Tool Execution through the Composio SDK or APIs so the application controls the tool calls, arguments, and rendering flow directly.

## Googledrive: When should I use `GOOGLEDRIVE_GET_ABOUT` to confirm which Google Drive account is connected?

Tool slug(s): `GOOGLEDRIVE_GET_ABOUT`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Run `GOOGLEDRIVE_GET_ABOUT` for the connected account ID to confirm the email address and identity of the Google Drive account being used. This is the quickest check when actions appear to affect a different Drive account than expected.

## Googlemeet: When should I use Google Super tool slugs with a Google Super connected account?

Tool slug(s): `GOOGLESUPER_CREATE_MEET`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Google Super is a separate toolkit with its own tool slugs. If the connected account was created for Google Super, run the corresponding GOOGLESUPER_* tool, such as GOOGLESUPER_CREATE_MEET, instead of the GOOGLEMEET_* slug. A separate Google Meet auth config or connected account is not required when the workflow is intentionally using Google Super.

## Googleslides: What should I know about Google Slides creation tools?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Google Slide creation tools were added to the Google Super toolkit. For slide creation workflows, use the relevant Google Super tools rather than trying to create a native Slides file through generic Drive text upload.

## Googlesuper: Which Google Super Calendar trigger should I use?

Tool slug(s): `GOOGLESUPER_GOOGLE_CALENDAR_EVENT_CHANGE_TRIGGER`, `GOOGLESUPER_GOOGLE_CALENDAR_EVENT_SYNC_TRIGGER`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: `GOOGLESUPER_GOOGLE_CALENDAR_EVENT_CHANGE_TRIGGER` is planned for deprecation. Use `GOOGLESUPER_GOOGLE_CALENDAR_EVENT_SYNC_TRIGGER` instead for calendar event sync/change workflows.

## Hubspot: How do I create custom HubSpot tools through toolkit-authenticated API requests?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: You can create a custom tool that sends authenticated requests to HubSpot API endpoints; Composio handles authentication for the connected account. Alternatively, call the provider directly with connection config/custom headers if needed.

## Hubspot: HubSpot marketing campaign objects do not expose a properties API like CRM objects

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For HubSpot marketing objects such as campaigns, HubSpot does not expose a properties API in the same way it does for CRM objects. Users may need to inspect/configure these from the HubSpot portal.

## Mailchimp: Mailchimp has trigger support in the supported-trigger toolkit list

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Mailchimp appears in the supported-trigger toolkit list. If a user asks for a specific Mailchimp trigger, verify the exact trigger/event exists in the current toolkit; if it does not, collect the use case and file a toolkit request.

## Marketstack: API Coverage

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: - `/stockprice` - `/intraday` - `/intraday/latest` - `/intraday/{date}` - `/tickers/{symbol}/intraday` - `/tickers/{symbol}/intraday/latest` - `/exchanges/{mic}/intraday` - `/exchanges/{mic}/intraday/latest` - `/exchanges/{mic}/intraday/{date}` Supported intraday intervals in the OpenAPI spec are `1min`, `5min`, `10min`, `15min`, `30min`, and `1hour`. Intraday docs note that some TOPS feed fields can be null without IEX entitlement, while derived intraday data is available without an additional IEX market data agreement.

## Notion: Large unfiltered Notion responses can hurt agent quality

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Large response payloads and overly complex structures can degrade agent behavior. Prefer narrower fetches/filters where available and track product improvements for simpler response structures.

## Openai: When should I use `OpenAIAgentsProvider` when wiring Composio tools into OpenAI Agents?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For OpenAI Agents, initialize Composio with `OpenAIAgentsProvider`, create a session for the user, fetch tools from the session, and pass those tools into the OpenAI Agent. This is the expected provider path when using the OpenAI Agents SDK with Composio.

## Openai: When should I use `beforeExecute` modifiers to add a human approval layer before tool execution?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Composio SDK modifiers can be used to add a gating layer before tool execution. Implement a `beforeExecute` modifier to inspect the tool call, request approval, and only allow the execution to continue when the user's approval logic passes.

## Openai: When should I append `session.experimental.assistivePrompt` for GPT models?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If GPT model behavior is flaky during tool execution, append `session.experimental.assistivePrompt` to the agent prompt to improve execution reliability. Use this alongside checking tool-call logs and the model/session configuration.

## Outlook: When should I remove old/bad Outlook tool slugs from MCP configs and patch `allowed_tools`?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If an Outlook MCP config fails due to older/bad tool slugs, update the MCP config to remove invalid slugs and include only current supported tools in `allowed_tools`. This can be done through the dashboard or the MCP patch endpoint.

## Serpapi: When should I use toolkit details to inspect SerpAPI required auth fields?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `.toolkits.get("serpapi")` to fetch the toolkit details, including required and optional auth fields. For SerpAPI, the connection initiation payload should include a required `generic_api_key` field displayed as `API Key`.

## Serpapi: Which search and scraping toolkits can I use alongside SerpAPI?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For search and scraping use cases, Composio has multiple relevant toolkits. SerpAPI is one option, and alternatives include Firecrawl, Exa, Tavily, and Composio Search. Composio Search provides search providers such as Exa and Tavily without separate auth.

## Shopify: Fetch more than the default 20 Shopify tools and enable the tool in MCP config

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Tool fetching can default to a limited number of tools. Pass a higher `limit`, for example `tools.get(user_id="<userId>", toolkits=["shopify"], limit=1000)`, to fetch the full Shopify tool set. For MCP, also confirm the target Shopify tool is enabled when creating the MCP config or by modifying the existing config.

## Shopify: Custom Shopify tools can call GraphQL with Composio-injected auth

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Create a custom tool/action under the Shopify toolkit and call Shopify's GraphQL endpoint from inside it. Composio injects the Shopify auth automatically through the custom tool execution path. For newer examples, the endpoint can be `/graphql.json`; older snippets used the full `https://<shopify-sub-domain>.myshopify.com/admin/api/<version>/graphql.json` endpoint. Include the JSON content type header and pass the GraphQL query in the body.

## Slack: When should I use Slack V2 trigger slugs for channel and direct messages?

Tool slug(s): `SLACK_CHANNEL_MESSAGE_RECEIVED`, `SLACK_DIRECT_MESSAGE_RECEIVED`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use the Slack V2 triggers for message events. `SLACK_CHANNEL_MESSAGE_RECEIVED` is intended for channel messages, and `SLACK_DIRECT_MESSAGE_RECEIVED` is intended for DMs. Slack V2 triggers include dedicated endpoints, signature verification, better DM handling, and richer filtering. Older V1 Slack trigger slugs may still work, but V2 is the recommended path for new setups.

## Slackbot: Slackbot trigger payloads include `connection_id` and `trigger_id`

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Slackbot trigger payloads include identifiers such as `connection_id` and `trigger_id` inside the payload data. Use `connection_id` to map the event back to the connected account involved in the trigger.

## Snowflake: Fetch connected-account fields or toolkit metadata to discover Snowflake account details

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: To discover fields collected during connection initiation, call the toolkit-by-slug endpoint and inspect the accepted initiation fields. After a connection exists, fetch the connected account by ID to retrieve the stored connection fields. Provider schemas are mostly static, but providers can change them, so the toolkit metadata endpoint is the safer source for current required/accepted fields.

## Snowflake: When should I use processors or tool description overrides to reduce Snowflake tool output/token load?

Tool slug(s): `SNOWFLAKE_DESCRIBE_TABLE`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For Snowflake tools that return too much data or need LLM-facing schema/description changes, use processors to post-process tool output before returning it to the model. For local agent setup, you can also modify the returned tool object's description before passing it to the LLM, for example changing the description on `SNOWFLAKE_DESCRIBE_TABLE`.

## Stripe: Additional Stripe endpoints can be added as toolkit requests

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: If a Stripe endpoint/tool is missing, submit the exact endpoints needed through the toolkit request flow. Useful examples include balance transactions, search for charges, cash balance, credit balances, coupons, and payouts.

## Tavily: When should I use composio_search for auth-free Exa/Tavily-style search?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For auth-free web search through Composio, use the `composio_search` toolkit. It provides search capabilities without separate authentication. Use the standalone Tavily toolkit when a workflow specifically needs Tavily as its own provider-backed integration.

## Trello: Route Trello MCP calls by appending user_id or connected_account_id

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For multi-user Trello MCP usage, create the Trello auth config and have users complete the auth flow. Then route MCP calls to the right user/connection by appending `user_id=<external-user-id>` or `connected_account_id=<ca_...>` to the MCP server URL, for example `/mcp?user_id=abcd`.

## Trello: Get the authenticated Trello user with TRELLO_GET_MEMBERS_BY_ID_MEMBER and idMember=me

Tool slug(s): `TRELLO_GET_MEMBERS_BY_ID_MEMBER`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `TRELLO_GET_MEMBERS_BY_ID_MEMBER` with `idMember` set to `me` to retrieve the authenticated Trello user/member for the current connection.

## Xero: Connect MCP discovers Xero tools through meta-tools instead of preloading every tool

Tool slug(s): `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_MULTI_EXECUTE_TOOL`

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Connect MCP uses meta-tools such as `COMPOSIO_SEARCH_TOOLS` and `COMPOSIO_MULTI_EXECUTE_TOOL` to discover and execute toolkit-specific tools dynamically. For Xero, the expected flow is: ask/search for the task such as `get Xero contacts`, let the agent discover the relevant Xero tool, then execute it through the multi-execute tool. This avoids loading 1000+ tools into context up front.

## Zendesk: When should I use the Zendesk get-ticket-by-id action?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: The Zendesk get-ticket-by-id action is available and returns the ticket details in a single tool call. Use it when the user has a Zendesk ticket ID and needs the ticket's metadata/details rather than searching first.

## Zoho: Zoho auth config and connection required fields can be fetched from toolkit schema APIs/SDK

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Use `toolkits.get("<toolkit-slug>")` or the toolkit-by-slug API to inspect the full Zoho toolkit schema, including auth config creation fields and connected account initiation fields. This is the reliable way to discover region/domain fields and other required inputs.

## Zoho: Some Zoho surfaces may be auth-only or lack formal tools; use custom tools or file requests

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: Some Zoho toolkits/surfaces may be auth-only or may not yet have a formal tool set. Users can use custom tools with the connected account credentials, or file a tool request with the exact API endpoint and use case.

## Zoominfo: When should I use the v3 connected accounts API for BASIC and BASIC_WITH_JWT connection initiation?

Tool slug(s): Toolkit-level tool, trigger, schema, or metadata coverage

Reason to keep out of the FAQ: this is better represented in tool metadata, schema guidance, trigger metadata, or tool coverage tracking than as a standalone public FAQ.

Candidate note: For BASIC or BASIC_WITH_JWT connection initiation, use the connected accounts API. The reusable v3 shape is `POST https://backend.composio.dev/api/v3/connected_accounts` with `x-api-key`, an `auth_config.id`, and `connection.data` containing the auth fields required by that toolkit plus `connection.user_id`. For BASIC-style apps the data object commonly contains fields such as username, password, and subdomain; for ZoomInfo/BASIC_WITH_JWT, use the required fields returned by that auth config.
