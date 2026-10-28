"""Offline regression and randomized tests for the downloadable No Auth migration helper.

HTTP is mocked; no Composio or provider requests are made.
Run from docs/: bun run test:migration-helper
"""
import contextlib, http.client, importlib.util, io, json, os, pathlib, random, socket, string, sys, unittest, urllib.error
from unittest import mock

sys.dont_write_bytecode = True
PATH = pathlib.Path(__file__).resolve().parents[2] / "public/assets/migrations/migrate_no_auth_to_instant.py"
spec = importlib.util.spec_from_file_location("helper", PATH)
helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)


class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): self.close()


def tool_meta(slug, toolkit, supported=True, price="$0.01 per call", discount=None):
    t = {"slug": slug, "toolkit": {"slug": toolkit}}
    if supported is not None:
        t["instant"] = {"supported": supported, "price": {"description": price} if price is not None else None}
        if discount is not None: t["instant"]["price"]["discount"] = discount
    return t


class Fake:
    def __init__(self, metas, post):
        self.metas, self.post, self.calls = metas, post, []
    def __call__(self, req, timeout=None):
        self.calls.append((req.get_method(), req.full_url, req.data))
        assert req.headers.get("X-api-key") == "k"
        if req.get_method() == "GET":
            slug = req.full_url.split("/tools/")[1].split("?")[0]
            m = self.metas[slug]
            if isinstance(m, BaseException): raise m
            return Resp(json.dumps(m).encode())
        if isinstance(self.post, BaseException): raise self.post
        return Resp(json.dumps(self.post).encode() if not isinstance(self.post, bytes) else self.post)
    def posts(self): return [c for c in self.calls if c[0] == "POST"]


def run(argv, fake=None, key="k"):
    out, err = io.StringIO(), io.StringIO()
    env = {"COMPOSIO_API_KEY": key} if key else {}
    opener = fake or mock.Mock(side_effect=AssertionError("network used"))
    with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(helper.urllib.request, "urlopen", opener), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try: code = helper.main(argv)
        except SystemExit as e: code = e.code
    return code, out.getvalue(), err.getvalue()


def http_err(code): return urllib.error.HTTPError("u", code, "x", {}, io.BytesIO(b""))

BASE = ["--user-id", "user_123", "--tool", "exa:EXA_SEARCH"]


class Regression(unittest.TestCase):
    def test_preview_default_no_network(self):
        code, out, _ = run(BASE)
        self.assertEqual(code, 0); self.assertIn("Preview only", out)
        body = json.loads(out[: out.rindex("}") + 1])["body"]
        self.assertEqual(body, {"user_id": "user_123", "toolkits": {"enable": ["exa"]}, "tools": {"exa": {"enable": ["EXA_SEARCH"]}},
                                "instant": {"toolkits": {"enable": ["exa"]}, "tools": {"exa": {"enable": ["EXA_SEARCH"]}}}})

    def test_retired_toolkits_rejected(self):
        for tk in ["browser_tool", "composio_search", "text_to_pdf", "weathermap"]:
            code, _, err = run(["--user-id", "u", "--tool", f"{tk}:X_Y"])
            self.assertEqual(code, 2, tk); self.assertIn(tk, err)

    def test_text_to_pdf_points_to_pdf_co(self):
        _, _, err = run(["--user-id", "u", "--tool", "text_to_pdf:X"])
        self.assertIn("pdf_co", err)

    def test_bad_inputs(self):
        for t in ["exa", "exa:EXA:X", "EXA:EXA_SEARCH", "exa:exa_search", ":X", "exa:"]:
            self.assertEqual(run(["--user-id", "u", "--tool", t])[0], 2, t)
        self.assertEqual(run(BASE + ["--tool", "exa:EXA_SEARCH"])[0], 2)
        self.assertEqual(run(BASE + ["--tool", "tavily:EXA_SEARCH"])[0], 2)
        self.assertEqual(run(["--user-id", "  ", "--tool", "exa:EXA_SEARCH"])[0], 2)

    def test_apply_requires_key(self):
        self.assertEqual(run(BASE + ["--apply"], key=None)[0], 2)

    def test_apply_happy_path(self):
        f = Fake({"EXA_SEARCH": tool_meta("EXA_SEARCH", "exa", discount="10%")}, {"session_id": "trs_1"})
        code, out, _ = run(BASE + ["--apply"], f)
        self.assertEqual(code, 0); self.assertIn("trs_1", out); self.assertIn("Published discount: 10%", out)
        self.assertEqual([c[0] for c in f.calls], ["GET", "POST"])
        self.assertIn("toolkit_versions=latest&include_pricing=true", f.calls[0][1])

    def test_post_failures_never_retry(self):
        for exc in [http_err(500), http_err(502), http_err(408), http_err(429), socket.timeout(), TimeoutError(),
                    http.client.RemoteDisconnected(), ConnectionResetError(), http.client.IncompleteRead(b"")]:
            f = Fake({"EXA_SEARCH": tool_meta("EXA_SEARCH", "exa")}, exc)
            code, _, err = run(BASE + ["--apply"], f)
            self.assertEqual(code, 1, exc); self.assertEqual(len(f.posts()), 1, exc); self.assertIn("No automatic retry", err)

    def test_post_ambiguous_message_for_5xx(self):
        f = Fake({"EXA_SEARCH": tool_meta("EXA_SEARCH", "exa")}, http_err(503))
        self.assertIn("outcome is unknown", run(BASE + ["--apply"], f)[2])

    def test_post_bad_json_or_missing_id(self):
        for post in [b"not json", {"id": "x"}, [], {"session_id": ""}]:
            f = Fake({"EXA_SEARCH": tool_meta("EXA_SEARCH", "exa")}, post)
            code, _, _ = run(BASE + ["--apply"], f)
            self.assertEqual(code, 1, post); self.assertEqual(len(f.posts()), 1)

    def test_metadata_gates_block_creation(self):
        bad = [tool_meta("EXA_SEARCH", "exa", supported=None), tool_meta("EXA_SEARCH", "exa", supported=False),
               tool_meta("EXA_SEARCH", "tavily"), tool_meta("OTHER", "exa"), tool_meta("EXA_SEARCH", "exa", price=None),
               tool_meta("EXA_SEARCH", "exa", price="  "), [], {"slug": "EXA_SEARCH", "toolkit": "exa"},
               http_err(404), http_err(500), socket.timeout()]
        for m in bad:
            f = Fake({"EXA_SEARCH": m}, {"session_id": "trs_1"})
            self.assertEqual(run(BASE + ["--apply"], f)[0], 1, m); self.assertEqual(f.posts(), [], m)


class Randomized(unittest.TestCase):
    N = 2700

    def test_random(self):
        rng = random.Random(20261113)
        chars = string.ascii_letters + string.digits + "_:-. "
        for i in range(self.N):
            n = rng.randint(1, 4); tools = []
            for _ in range(n):
                if rng.random() < 0.6:
                    tk = rng.choice(["exa", "tavily", "serpapi", "browser_use", "pdf_co", "accu_weather", "gemini", "yelp", "seat_geek", "browser_tool", "weathermap"])
                    tools.append(f"{tk}:{tk.upper()}_{rng.choice(['SEARCH', 'GET', 'RUN'])}")
                else:
                    tools.append("".join(rng.choice(chars) for _ in range(rng.randint(0, 12))))
            argv = ["--user-id", "u"] + sum((["--tool", t] for t in tools), [])
            outcome = rng.choice(["ok", "unsupported", "post_err", "get_err", "no_id"])
            metas = {}
            for t in tools:
                if ":" in t:
                    tk, slug = t.split(":", 1)
                    metas[slug] = http_err(500) if outcome == "get_err" else tool_meta(slug, tk, supported=outcome != "unsupported")
            post = {"ok": {"session_id": "trs"}, "no_id": {}}.get(outcome, rng.choice([http_err(500), socket.timeout(), http_err(429)]))
            apply = rng.random() < 0.5
            f = Fake(metas, post)
            code, out, _ = run(argv + (["--apply"] if apply else []), f if apply else None)
            self.assertLessEqual(len(f.posts()), 1)
            if not apply: self.assertEqual(f.calls, [])
            if code == 0 and apply: self.assertEqual(outcome, "ok"); self.assertIn("trs", out)
            if outcome in ("unsupported", "get_err") and apply: self.assertEqual(f.posts(), [])
            if code == 0:
                body = json.loads(out[: out.index("\n}") + 2])["body"]
                self.assertEqual(body["toolkits"]["enable"], body["instant"]["toolkits"]["enable"])
                self.assertEqual(body["tools"], body["instant"]["tools"])
                self.assertFalse(set(body["tools"]) & set(helper.RETIRED))


if __name__ == "__main__":
    unittest.main(verbosity=1)
