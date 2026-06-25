import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { experimental_createPythonWorkbenchHelperSource } from '../../src/workbench';

describe('experimental_createPythonWorkbenchHelperSource', () => {
  it('emits the Apollo-parity Python helpers without remote workbench-only helpers', () => {
    const source = experimental_createPythonWorkbenchHelperSource();

    expect(source).toContain('def run_composio_tool(');
    expect(source).toContain('def invoke_llm(');
    expect(source).toContain('def web_search(');
    expect(source).toContain('def proxy_execute(');
    expect(source).toContain('"x-api-key": api_key');
    expect(source).toContain('/api/v3/tool_router/session/%s/execute');
    // proxy_execute uses the public session route with the project key.
    expect(source).toContain('/api/v3/tool_router/session/%s/proxy_execute');
    // Config is injected via an `_INTERNAL` prologue, read by the helper.
    expect(source).toContain('_INTERNAL = _composio_internal_json.loads(');
    expect(source).toContain('openai/gpt-oss-120b');
    expect(source).toContain(
      'DEFAULT_INVOKE_LLM_MODEL = _INTERNAL.get("invoke_llm_model", "openai/gpt-oss-120b")'
    );
    expect(source).not.toContain('__COMPOSIO_INVOKE_LLM_MODEL__');
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

  it('coerces a non-numeric envelope status instead of raising', () => {
    const source = experimental_createPythonWorkbenchHelperSource();
    const directory = mkdtempSync(join(tmpdir(), 'composio-helper-'));
    const scriptPath = join(directory, 'helper_status_test.py');
    const testScript = `${source}

import json as _json

def _post_json(url, headers, payload, timeout=120):
    # The session envelope can report status as a string; a bare ">= 400"
    # comparison would raise TypeError and mask the successful result.
    return 200, {}, _json.dumps({"data": {"ok": True}, "status": "200"})

ok_data, ok_error = proxy_execute("GET", "/user", "github")

def _post_json_error(url, headers, payload, timeout=120):
    return 200, {}, _json.dumps({"data": {"message": "nope"}, "status": "404"})

_post_json = _post_json_error
err_data, err_error = proxy_execute("GET", "/user", "github")

print(_json.dumps({
    "ok_data": ok_data,
    "ok_error": ok_error,
    "err_error": err_error,
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

      // String status "200" is treated as success, not a "Failed to execute" crash.
      expect(parsed.ok_data).toEqual({ ok: true });
      expect(parsed.ok_error).toBe('');
      // String status "404" is surfaced as a non-empty API error.
      expect(parsed.err_error).toContain('API returned status 404');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
    if "toolkit_slug" in payload:
        return 200, {}, _json.dumps({"data": {"login": "octocat"}, "status": 200})
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
proxy_result, proxy_error = proxy_execute(
    "GET", "/user", "github", query_params={"per_page": "1"}
)

print(_json.dumps({
    "calls": _calls,
    "tool_result": tool_result,
    "tool_error": tool_error,
    "llm_result": llm_result,
    "llm_error": llm_error,
    "search_result": search_result,
    "search_error": search_error,
    "proxy_result": proxy_result,
    "proxy_error": proxy_error,
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
      expect(parsed.proxy_result).toEqual({ login: 'octocat' });
      expect(parsed.proxy_error).toBe('');
      expect(parsed.calls).toHaveLength(4);
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
      expect(parsed.calls[3]).toMatchObject({
        url: 'https://backend.test/api/v3/tool_router/session/session_123/proxy_execute',
        headers: { 'x-api-key': 'project_key' },
        payload: {
          toolkit_slug: 'github',
          endpoint: '/user',
          method: 'GET',
          parameters: [{ name: 'per_page', value: '1', type: 'query' }],
        },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
