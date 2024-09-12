#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 0192aac24123735b3eaf9b08df46429bb770c283
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install .
git checkout 0192aac24123735b3eaf9b08df46429bb770c283 tests/test_utils.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/test_utils.py b/tests/test_utils.py
--- a/tests/test_utils.py
+++ b/tests/test_utils.py
@@ -602,6 +602,14 @@ def test_parse_header_links(value, expected):
         ('example.com/path', 'http://example.com/path'),
         ('//example.com/path', 'http://example.com/path'),
         ('example.com:80', 'http://example.com:80'),
+        (
+            'http://user:pass@example.com/path?query',
+            'http://user:pass@example.com/path?query'
+        ),
+        (
+            'http://user@example.com/path?query',
+            'http://user@example.com/path?query'
+        )
     ))
 def test_prepend_scheme_if_needed(value, expected):
     assert prepend_scheme_if_needed(value, 'http') == expected

EOF_114329324912
pytest -rA tests/test_utils.py
git checkout 0192aac24123735b3eaf9b08df46429bb770c283 tests/test_utils.py
