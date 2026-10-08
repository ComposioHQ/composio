Use this guide to choose supported Gemini models, handle generated media, connect through MCP, and troubleshoot provider compatibility.

## Choose supported models and handle generated media

**Use current Gemini model names.** If Gemini tool calls fail with older model names, switch to a currently supported Gemini model. For example, use `gemini-2.5-flash` instead of the older `gemini-1.5-flash`; model availability changes over time.

**Choose a supported Veo model for video generation.** For Gemini video generation, use supported Veo models such as `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.0-generate-001`, or `veo-3.0-fast-generate-001`. If the default model fails, explicitly pass a current supported Veo model.

**Wait for asynchronous video generation to complete.** Gemini video generation is asynchronous. Pass the `operation_name` returned by `GEMINI_GENERATE_VIDEOS` to `GEMINI_WAIT_FOR_VIDEO`, which polls for completion and returns the generated video file. The older `GEMINI_GET_VIDEOS_OPERATION` action is deprecated.

**Disable automatic file handling when outputs should remain as URLs or content.** Composio SDKs automatically handle file upload/download by default. For Gemini generated images or similar file outputs, disable automatic file handling with `autoUploadDownloadFiles: false` / `auto_upload_download_files=False` where supported, or update to a version that supports that option.

## Connect Gemini through MCP and frameworks

**Use Tool Router with any compatible MCP client.** Tool Router can be used with any MCP client or framework/LLM that supports tool calling or MCP. For Gemini, initialize Composio with `GeminiProvider`, create a session, then connect to the session MCP URL and headers using a streamable HTTP MCP client.

**Isolate Gemini CLI-specific MCP failures.** If a Composio MCP server URL returns tools but Gemini CLI still fails, the issue may be in the Gemini client. Try the latest Gemini CLI version and, if needed, compare with another MCP client to isolate whether the failure is client-specific.

**Use LangChain MCP tools with any capable model.** Composio MCP tools with LangChain are not limited to OpenAI. They can work with any LLM/framework path that supports LangChain function calling capabilities, including Gemini and Claude.

## Check provider compatibility and tool-call accounting

**Account for no-auth toolkit calls like regular tool calls.** Gemini no-auth toolkit calls are logged like other toolkit calls and can be tracked in Composio tool logs. Confirm the current plan's tool-call accounting when answering billing questions because pricing can change.

**Check Google's schema limitations when otherwise-valid tools fail.** Gemini models/providers can have schema compatibility issues because Gemini uses OpenAPI-style schema handling rather than full JSON Schema support in some paths. If a schema works in OpenAI/Claude but fails in Gemini, check provider schema limitations and upgrade Composio/provider SDKs where fixes exist.

**Verify current language-specific provider support.** Composio supports Google Gemini and Vertex AI providers. Verify the current SDK version and provider documentation when answering implementation-specific questions because language-specific support changes over time.
