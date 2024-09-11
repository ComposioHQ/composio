#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 6918e69600810a4664e53653d6ff0290c3c4a788
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .[test]
git checkout 6918e69600810a4664e53653d6ff0290c3c4a788 tests/test_pycode_ast.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/test_pycode_ast.py b/tests/test_pycode_ast.py
--- a/tests/test_pycode_ast.py
+++ b/tests/test_pycode_ast.py
@@ -53,8 +53,9 @@
     ("+ a", "+ a"),                             # UAdd
     ("- 1", "- 1"),                             # UnaryOp
     ("- a", "- a"),                             # USub
-    ("(1, 2, 3)", "(1, 2, 3)"),                   # Tuple
+    ("(1, 2, 3)", "(1, 2, 3)"),                 # Tuple
     ("()", "()"),                               # Tuple (empty)
+    ("(1,)", "(1,)"),                           # Tuple (single item)
 ])
 def test_unparse(source, expected):
     module = ast.parse(source)

EOF_114329324912
tox --current-env -epy39 -v -- tests/test_pycode_ast.py
git checkout 6918e69600810a4664e53653d6ff0290c3c4a788 tests/test_pycode_ast.py
