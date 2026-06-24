import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { experimental_createPythonWorkbenchHelperSource } from '../../src/experimental';

describe('experimental_createPythonWorkbenchHelperSource', () => {
  it('emits the Apollo-parity Python helpers without remote workbench-only helpers', () => {
    const source = experimental_createPythonWorkbenchHelperSource();

    expect(source).toContain('def run_composio_tool(');
    expect(source).toContain('def invoke_llm(');
    expect(source).toContain('def web_search(');
    expect(source).toContain('"x-api-key": api_key');
    expect(source).toContain('/api/v3/tool_router/session/%s/execute');
    // Config is injected via an `_INTERNAL` prologue, read by the helper.
    expect(source).toContain('_INTERNAL = _composio_internal_json.loads(');
    expect(source).toContain('openai/gpt-oss-120b');
    expect(source).toContain(
      'DEFAULT_INVOKE_LLM_MODEL = _INTERNAL.get("invoke_llm_model", "openai/gpt-oss-120b")'
    );
    expect(source).not.toContain('__COMPOSIO_INVOKE_LLM_MODEL__');
    expect(source).not.toContain('proxy_execute');
    expect(source).not.toContain('upload_local_file');
    expect(source).not.toContain('smart_file_extract');
    expect(source).not.toContain('get_mount_file_url');
    expect(source).not.toContain('x-session-access-key');
    expect(source).not.toContain('COMPOSIO_WORKBENCH_ACCESS_KEY');
    expect(source).not.toContain('runComposioTool');
    expect(source).not.toContain('export async');
  });

  it('injects a custom invoke LLM model into the _INTERNAL prologue', () => {
    const source = experimental_createPythonWorkbenchHelperSource({
      invokeLlmModel: 'custom/model-x',
    });

    expect(source).toContain('_INTERNAL = _composio_internal_json.loads(');
    expect(source).toContain('custom/model-x');
    // The injected JSON is a valid Python double-quoted string literal.
    expect(source).toContain('loads("{\\"invoke_llm_model\\":\\"custom/model-x\\"}")');
    // The prologue must precede the helper body so `_INTERNAL` is defined first.
    expect(source.indexOf('_INTERNAL = _composio_internal_json.loads(')).toBeLessThan(
      source.indexOf('DEFAULT_INVOKE_LLM_MODEL = _INTERNAL.get(')
    );
  });

  it('checks HTTP status before parsing successful JSON responses', () => {
    const source = experimental_createPythonWorkbenchHelperSource();

    expect(source.indexOf('if status >= 400:')).toBeLessThan(
      source.indexOf('response_data = _parse_json(text)')
    );
  });

  it('round-trips helper calls through the session execute endpoint shape', () => {
    const source = experimental_createPythonWorkbenchHelperSource({
      invokeLlmModel: 'test/model',
    });
    const directory = mkdtempSync(join(tmpdir(), 'composio-helper-'));
    const scriptPath = join(directory, 'helper_test.py');
    const testScript = `${source}

import json as _json

_calls = []

def _post_json(url, headers, payload, timeout=120):
    _calls.append({"url": url, "headers": headers, "payload": payload})
    if payload["tool_slug"] == "COMPOSIO_SEARCH_GROQ_CHAT":
        _content = (chr(96) * 3) + 'json\\n{"ok": true}\\n' + (chr(96) * 3)
        return 200, {}, _json.dumps({
            "data": {
                "choices": [
                    {"message": {"content": _content}}
                ]
            }
        })
    if payload["tool_slug"] == "COMPOSIO_SEARCH_EXA_ANSWER":
        return 200, {}, _json.dumps({"data": {"answer": "answer text"}})
    return 200, {}, _json.dumps({"data": {"ok": True}})

tool_result, tool_error = run_composio_tool(
    "github_get_repo",
    {"owner": "composio"},
    {"max_retries": 0, "delay_ms": 0},
    False,
    account="acct_123",
)
llm_result, llm_error = invoke_llm("return JSON")
search_result, search_error = web_search("what is Composio?")

print(_json.dumps({
    "calls": _calls,
    "tool_result": tool_result,
    "tool_error": tool_error,
    "llm_result": llm_result,
    "llm_error": llm_error,
    "search_result": search_result,
    "search_error": search_error,
}))
`;

    try {
      writeFileSync(scriptPath, testScript);
      const output = execFileSync('python3', [scriptPath], {
        env: {
          ...process.env,
          BACKEND_URL: 'https://backend.test/',
          COMPOSIO_TOOLROUTER_SESSION_ID: 'session_123',
          COMPOSIO_API_KEY: 'project_key',
        },
        encoding: 'utf8',
      });
      const parsed = JSON.parse(output);

      expect(parsed.tool_result).toEqual({ data: { ok: true } });
      expect(parsed.tool_error).toBe('');
      expect(parsed.llm_result).toBe('{"ok": true}');
      expect(parsed.llm_error).toBe('');
      expect(parsed.search_result).toBe('answer text');
      expect(parsed.search_error).toBe('');
      expect(parsed.calls).toHaveLength(3);
      expect(parsed.calls[0]).toMatchObject({
        url: 'https://backend.test/api/v3/tool_router/session/session_123/execute',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'project_key',
        },
        payload: {
          tool_slug: 'GITHUB_GET_REPO',
          arguments: { owner: 'composio' },
          account: 'acct_123',
        },
      });
      expect(parsed.calls[1].payload).toMatchObject({
        tool_slug: 'COMPOSIO_SEARCH_GROQ_CHAT',
        arguments: {
          model: 'test/model',
          temperature: 0.5,
        },
      });
      expect(parsed.calls[2].payload).toEqual({
        tool_slug: 'COMPOSIO_SEARCH_EXA_ANSWER',
        arguments: { content: 'what is Composio?' },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
