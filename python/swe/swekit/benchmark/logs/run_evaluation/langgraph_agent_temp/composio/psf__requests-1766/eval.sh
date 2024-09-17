#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 847735553aeda6e6633f2b32e14ba14ba86887a4
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install .
git checkout 847735553aeda6e6633f2b32e14ba14ba86887a4 test_requests.py
git apply -v - <<'EOF_114329324912'
diff --git a/test_requests.py b/test_requests.py
--- a/test_requests.py
+++ b/test_requests.py
@@ -320,6 +320,14 @@ def test_DIGESTAUTH_WRONG_HTTP_401_GET(self):
         r = s.get(url)
         assert r.status_code == 401
 
+    def test_DIGESTAUTH_QUOTES_QOP_VALUE(self):
+
+        auth = HTTPDigestAuth('user', 'pass')
+        url = httpbin('digest-auth', 'auth', 'user', 'pass')
+
+        r = requests.get(url, auth=auth)
+        assert '"auth"' in r.request.headers['Authorization']
+
     def test_POSTBIN_GET_POST_FILES(self):
 
         url = httpbin('post')

EOF_114329324912
pytest -rA test_requests.py
git checkout 847735553aeda6e6633f2b32e14ba14ba86887a4 test_requests.py
