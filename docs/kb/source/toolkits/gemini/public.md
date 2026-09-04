---
type: "reference"
title: "Gemini"
description: "Public support knowledge for Gemini."
category: "authentication"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "gemini"
---
# Gemini

The sections below provide public guidance for Gemini.

## Gemini no-auth/toolkit usage is counted as regular Composio tool calls

Gemini no-auth toolkit calls are logged like other toolkit calls and can be tracked in Composio tool logs. Confirm the current plan's tool-call accounting when answering billing questions because pricing can change.

## Use newer Gemini models such as `gemini-2.5-flash` instead of old `gemini-1.5-flash` defaults

If Gemini tool calls fail with older model names, switch to a currently supported Gemini model. For example, use `gemini-2.5-flash` instead of the older `gemini-1.5-flash`; model availability changes over time.

## Gemini video generation should use supported Veo model names

For Gemini video generation, use supported Veo models such as `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.0-generate-001`, or `veo-3.0-fast-generate-001`. If the default model fails, explicitly pass a current supported Veo model.

## Use `GEMINI_WAIT_FOR_VIDEO` before using generated video output

Gemini video generation is asynchronous. Pass the `operation_name` returned by `GEMINI_GENERATE_VIDEOS` to `GEMINI_WAIT_FOR_VIDEO`, which polls for completion and returns the generated video file. The older `GEMINI_GET_VIDEOS_OPERATION` action is deprecated.

## Disable automatic file handling when Gemini generated files should remain as URLs/content

Composio SDKs automatically handle file upload/download by default. For Gemini generated images or similar file outputs, disable automatic file handling with `autoUploadDownloadFiles: false` / `auto_upload_download_files=False` where supported, or update to a version that supports that option.

## Gemini can use Composio Tool Router through any MCP client

Tool Router can be used with any MCP client or framework/LLM that supports tool calling or MCP. For Gemini, initialize Composio with `GeminiProvider`, create a session, then connect to the session MCP URL and headers using a streamable HTTP MCP client.

## Gemini CLI MCP issues may be client-side; Claude can be a more stable fallback

If a Composio MCP server URL returns tools but Gemini CLI still fails, the issue may be in the Gemini client. Try the latest Gemini CLI version and, if needed, compare with another MCP client to isolate whether the failure is client-specific.

## Gemini schema errors can come from Google's OpenAPI-vs-JSON-Schema limitations

Gemini models/providers can have schema compatibility issues because Gemini uses OpenAPI-style schema handling rather than full JSON Schema support in some paths. If a schema works in OpenAI/Claude but fails in Gemini, check provider schema limitations and upgrade Composio/provider SDKs where fixes exist.

## Composio supports Google Gemini/Vertex AI providers, with Python support historically ahead of JS

Composio supports Google Gemini and Vertex AI providers. Verify the current SDK version and provider documentation when answering implementation-specific questions because language-specific support changes over time.

## LangChain MCP tools are not OpenAI-only and can work with Gemini-capable tool calling

Composio MCP tools with LangChain are not limited to OpenAI. They can work with any LLM/framework path that supports LangChain function calling capabilities, including Gemini and Claude.
