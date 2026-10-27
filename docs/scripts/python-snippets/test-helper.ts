/**
 * Python-enabled regression gate. Runs the real helper, local SDK/providers, and
 * locked mypy; deliberately separate from Bun's Python-free static test suite.
 * Run from docs/: bun scripts/python-snippets/test-helper.ts
 */
import assert from 'node:assert/strict';
import { runPythonHelper, pythonSnippetViolations, type PythonSnippet } from '../check-python-snippets';

type Fixture = {
  id: string;
  code: string;
  /** Expected snippet-relative SDK error line and mypy code, not recorded prose. */
  api?: [number, string][];
  syntax?: number[];
  /** Expected rejected `# type: ignore` lines, with mypy's code when it reports one. */
  directives?: [number, string | undefined][];
  typeCheck?: boolean;
  other?: RegExp;
};

const fixtures: Fixture[] = [
  { id: 'control', code: 'composio.tools.exectue("X", user_id="u", arguments={})', api: [[1, 'attr-defined']] },
  { id: 'constructor', code: 'Composio(apikey="bad")', api: [[1, 'call-overload']] },
  {
    id: 'constructor_import', code: 'from composio import Composio\nComposio(apikey="bad")',
    api: [[2, 'call-overload']],
  },
  {
    id: 'constructor_alias', code: 'from composio import Composio as C\nC(apikey="bad")',
    api: [[2, 'call-overload']],
  },
  { id: 'instance_alias', code: 'c = Composio()\nc.create(user="u")', api: [[2, 'call-overload']] },
  {
    id: 'import_alias', code: 'from composio import Composio as C\nc = C()\nc.create(user="u")',
    api: [[3, 'call-overload']],
  },
  {
    id: 'typed_parameter', code: 'def example(c: Composio) -> None:\n    c.create(user="u")',
    api: [[2, 'call-overload']],
  },
  {
    id: 'class_collision',
    code: 'class Tools:\n    pass\ncomposio.tools.exectue("X", user_id="u", arguments={})\nTools().not_real()',
    api: [[3, 'attr-defined']], other: /"Tools" has no attribute "not_real"/,
  },
  {
    id: 'nested_parameter',
    code: 'def unrelated(composio: int) -> None:\n    composio.not_real()\ncomposio.tools.exectue("X", user_id="u", arguments={})',
    api: [[3, 'attr-defined']], other: /"int" has no attribute "not_real"/,
  },
  {
    id: 'package_named_parameters',
    code: 'def unrelated(composio_client: int, composio_openai: int) -> None:\n    composio_client.not_real()\n    composio_openai.not_real()',
    other: /"int" has no attribute "not_real"/,
  },
  {
    id: 'nested_local',
    code: 'def unrelated() -> None:\n    composio = 1\ncomposio.tools.exectue("X", user_id="u", arguments={})',
    api: [[3, 'attr-defined']],
  },
  {
    id: 'nested_constructor_name',
    code: 'def unrelated(Composio: int) -> None:\n    pass\nComposio(apikey="bad")', api: [[3, 'call-overload']],
  },
  {
    id: 'comprehension_binding',
    code: 'values = [composio for composio in (1,)]\ncomposio.tools.exectue("X", user_id="u", arguments={})',
    api: [[2, 'attr-defined']],
  },
  {
    id: 'invalid_method', code: 'method = "NOT_AN_HTTP_METHOD"\ncomposio.tools.proxy(endpoint="/me", method=method)',
    api: [[2, 'arg-type']],
  },
  {
    id: 'invalid_dictionary', code: 'composio.auth_configs.create(toolkit="gmail", options={"totally_wrong": 1})',
    api: [[1, 'call-overload']],
  },
  {
    id: 'invalid_literal_dictionary',
    code: 'from composio.types import auth_scheme\nauth_scheme.api_key({"totally_wrong": 1})',
    api: [[2, 'arg-type']],
  },
  {
    id: 'provider', code: 'from composio_openai import OpenAIProvider\np = OpenAIProvider()\np.not_real()',
    api: [[3, 'attr-defined']],
  },
  {
    id: 'sdk_missing_import', code: 'from composio.missing import Missing', api: [[1, 'import-not-found']],
  },
  {
    id: 'sdk_missing_export', code: 'from composio import Missing', api: [[1, 'attr-defined']],
  },
  {
    id: 'sdk_module_alias', code: 'import composio as sdk\nsdk.not_real()', api: [[2, 'attr-defined']],
  },
  {
    id: 'non_sdk_attribute_in_sdk_chain',
    code: 'from composio.types import Tool\ndef transform(schema: Tool) -> None:\n    schema.input_parameters["properties"].pop("page", None)',
    other: /"object" has no attribute "pop"/,
  },
  {
    id: 'upload_context_callback',
    code: 'from composio import before_file_upload\n@before_file_upload(tools=["GOOGLEDRIVE_UPLOAD_FILE"])\ndef audit_path(context) -> str | bool:\n    return context["path"]',
  },
  {
    id: 'future_import',
    code: 'from __future__ import annotations\ncomposio.tools.exectue("X", user_id="u", arguments={})',
    api: [[2, 'attr-defined']],
  },
  { id: 'top_level_shadow', code: 'composio = "local"\ncomposio.not_real()', other: /"str" has no attribute/ },
  {
    id: 'third_party_alias', code: 'from pathlib import Path as Composio\nComposio(1)',
    other: /\[arg-type\]/,
  },
  { id: 'unknown_provider', code: 'import composio_custom_provider', other: /\[import-not-found\]/ },
  {
    id: 'local_class', code: 'class Composio:\n    pass\nComposio(apikey="bad")',
    other: /\[call-arg\]/,
  },
  { id: 'legacy', code: 'from composio import ComposioToolSet\nComposioToolSet(apikey="x")', typeCheck: false },
  { id: 'legacy_syntax', code: 'if True print("bad")', typeCheck: false, syntax: [1] },
  { id: 'valid', code: 'c = Composio(api_key="test")\nc.create(user_id="u")' },
  { id: 'top_level_await', code: 'await unknown_async_function()', other: /\[name-defined\]/ },
  {
    id: 'sdk_model_index',
    code: 'r = composio.tools.proxy(endpoint="/me", method="GET", connected_account_id="ca_1")\nprint(r["status"])',
    api: [[2, 'index']],
  },
  { id: 'local_index', code: 'value = 1\nprint(value[0])', other: /\[index\]/ },
  {
    id: 'sdk_typeddict_union_key',
    code: 'parsed = composio.triggers.parse(body=b"", headers={}, verify_secret="s")\nprint(parsed["raw_payload"]["id"])',
    api: [[2, 'typeddict-item'], [2, 'typeddict-item']],
  },
  {
    id: 'sdk_result_assignment', code: 'count: int = composio.tools.get_raw_composio_tool_by_slug("X")',
    api: [[1, 'assignment']],
  },
  { id: 'local_assignment', code: 'count: int = "one"', other: /\[assignment\]/ },
  { id: 'sdk_binding_typo', code: 'sesion.tools()', api: [[1, 'name-defined']] },
  { id: 'local_binding_typo', code: 'values = [1]\nprint(valuse)', other: /\[name-defined\]/ },
  { id: 'bare_type_ignore', code: 'composio.tools.exectue("X", user_id="u", arguments={})  # type: ignore', directives: [[1, undefined]] },
  {
    id: 'unexplained_type_ignore', code: 'composio.tools.exectue("X", user_id="u", arguments={})  # type: ignore[attr-defined]',
    directives: [[1, undefined]],
  },
  {
    id: 'explained_type_ignore',
    code: '# Fixture: a documented typing gap above the statement.\ncomposio.tools.exectue("X", user_id="u", arguments={})  # type: ignore[attr-defined]',
  },
  {
    id: 'unused_type_ignore',
    code: 'composio.tools.execute(  # type: ignore[call-overload]\n    # Fixture: the gap no longer exists.\n    "X", user_id="u", arguments={}, dangerously_skip_version_check=True,\n)',
    directives: [[1, 'unused-ignore']],
  },
];

const snippets: PythonSnippet[] = fixtures.map(({ id, code, typeCheck = true }) => ({
  id, code, typeCheck, path: `fixtures/${id}.mdx`, line: 100,
}));
const result = runPythonHelper(snippets);
const violations = pythonSnippetViolations(snippets, result);
for (const fixture of fixtures) {
  const actual = violations.filter(({ path }) => path === `fixtures/${fixture.id}.mdx`);
  const expected = [
    ...(fixture.api ?? []).map(([line, code]) => ({ line: 100 + line, rule: 'python-api', code })),
    ...(fixture.syntax ?? []).map((line) => ({ line: 100 + line, rule: 'python-syntax', code: undefined })),
    ...(fixture.directives ?? []).map(([line, code]) => ({ line: 100 + line, rule: 'python-directive', code })),
  ];
  assert.deepEqual(actual.map(({ line, rule, message }) => ({
    line, rule, code: /\[([\w-]+)\]$/.exec(message)?.[1],
  })), expected, `${fixture.id}: unexpected SDK/syntax attribution\n${JSON.stringify(result, null, 2)}`);
  if (fixture.other) {
    assert.ok(result.other.some(({ id, message }) => id === fixture.id && fixture.other!.test(message)),
      `${fixture.id}: expected separate non-SDK diagnostic ${fixture.other}`);
  }
}

// Syntax-only mode must not invoke mypy attribution, but still compile legacy code.
const syntaxOnly = runPythonHelper(snippets, true);
assert.deepEqual(syntaxOnly.api, []);
assert.deepEqual(syntaxOnly.other, []);
assert.deepEqual(syntaxOnly.directives, []);
assert.deepEqual(syntaxOnly.mypy, []);
assert.deepEqual(syntaxOnly.syntax.map(({ id, line }) => [id, line]), [['legacy_syntax', 1]]);
console.log(`Real Python helper regressions passed (${fixtures.length} fixtures; no snippets executed).`);
