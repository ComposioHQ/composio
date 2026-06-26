## How does Gemini shared quota work?

Gemini toolkit quota has historically been backed by shared Composio credentials, so users can hit shared-provider quota limits. If a user needs independent quota management, use BYOK or custom API key support when available.

## What does Gemini no-auth/toolkit usage mean?

Gemini no-auth toolkit calls are logged like other toolkit calls and can be tracked in Composio tool logs. Treat Gemini usage as regular toolkit usage based on tool calls.

## When should I use newer Gemini models such as `gemini-2.5-flash` instead of old `gemini-1.5-flash` defaults?

If Gemini tool calls fail with older model names, switch to a newer Gemini model such as `gemini-2.5-flash`. Model availability changes over time, so verify the current model list when a model-name error appears.

## Which Gemini Veo model names should I use for video generation?

For Gemini video generation, use supported Veo models such as `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.0-generate-001`, or `veo-3.0-fast-generate-001`. If the default model fails, explicitly pass a current supported Veo model.

## When should I use `GEMINI_GET_VIDEOS_OPERATION` or `GEMINI_WAIT_FOR_VIDEO` before using generated video URLs?

Gemini video generation is asynchronous. Wait until the operation completes with `GEMINI_GET_VIDEOS_OPERATION` or use `GEMINI_WAIT_FOR_VIDEO`; the completed result should include a temporary publicly accessible `s3url` that can be viewed or downloaded.

## How should I handle disable automatic file handling when Gemini generated files should remain as URLs/content?

Composio SDKs automatically handle file upload/download by default. For Gemini generated images or similar file outputs, disable automatic file handling with `autoUploadDownloadFiles: false` / `auto_upload_download_files=False` where supported, or update to a version that supports that option.

## How should I handle gemini can use Composio Tool Router through any MCP client?

Tool Router can be used with any MCP client or framework/LLM that supports tool calling or MCP. For Gemini, initialize Composio with `GeminiProvider`, create a session, then connect to the session MCP URL and headers using a streamable HTTP MCP client.

## How should I handle gemini CLI MCP issues may be client-side; Claude can be a more stable fallback?

If a Composio MCP server URL returns tools but Gemini CLI still fails, the behavior may be in the Gemini client. Try the latest Gemini CLI version, or use another MCP client as a fallback.

## What can cause Gemini schema errors?

Gemini models/providers can have schema compatibility differences because Gemini uses OpenAPI-style schema handling rather than full JSON Schema support in some paths. If a schema works in OpenAI/Claude but fails in Gemini, check provider schema limitations and upgrade Composio/provider SDKs.

## What should I know about LangChain MCP tools?

Composio MCP tools with LangChain are not limited to OpenAI. They can work with any LLM/framework path that supports LangChain function calling capabilities, including Gemini and Claude.
