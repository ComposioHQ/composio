#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 5f7a3a74aab1625c2bb65f643197ee885e3da576
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install .
git checkout 5f7a3a74aab1625c2bb65f643197ee885e3da576 test_requests.py
git apply -v - <<'EOF_114329324912'
diff --git a/test_requests.py b/test_requests.py
--- a/test_requests.py
+++ b/test_requests.py
@@ -157,6 +157,11 @@ def test_params_bytes_are_encoded(self):
                                    params=b'test=foo').prepare()
         assert request.url == 'http://example.com/?test=foo'
 
+    def test_binary_put(self):
+        request = requests.Request('PUT', 'http://example.com',
+                                   data=u"ööö".encode("utf-8")).prepare()
+        assert isinstance(request.body, bytes)
+
     def test_mixed_case_scheme_acceptable(self, httpbin):
         s = requests.Session()
         s.proxies = getproxies()

EOF_114329324912
pytest -rA test_requests.py
git checkout 5f7a3a74aab1625c2bb65f643197ee885e3da576 test_requests.py
