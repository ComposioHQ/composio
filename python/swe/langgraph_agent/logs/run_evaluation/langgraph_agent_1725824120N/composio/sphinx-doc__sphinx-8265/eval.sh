#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff b428cd2404675475a5c3dc2a2b0790ba57676202
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .[test]
git checkout b428cd2404675475a5c3dc2a2b0790ba57676202 tests/test_pycode_ast.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/test_pycode_ast.py b/tests/test_pycode_ast.py
--- a/tests/test_pycode_ast.py
+++ b/tests/test_pycode_ast.py
@@ -53,7 +53,7 @@
     ("+ a", "+ a"),                             # UAdd
     ("- 1", "- 1"),                             # UnaryOp
     ("- a", "- a"),                             # USub
-    ("(1, 2, 3)", "1, 2, 3"),                   # Tuple
+    ("(1, 2, 3)", "(1, 2, 3)"),                   # Tuple
     ("()", "()"),                               # Tuple (empty)
 ])
 def test_unparse(source, expected):

EOF_114329324912
tox --current-env -epy39 -v -- tests/test_pycode_ast.py
git checkout b428cd2404675475a5c3dc2a2b0790ba57676202 tests/test_pycode_ast.py
