#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff fdc707f73a65a429935c01532cd3970d3355eab6
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout fdc707f73a65a429935c01532cd3970d3355eab6 sympy/utilities/tests/test_lambdify.py
git apply -v - <<'EOF_114329324912'
diff --git a/sympy/utilities/tests/test_lambdify.py b/sympy/utilities/tests/test_lambdify.py
--- a/sympy/utilities/tests/test_lambdify.py
+++ b/sympy/utilities/tests/test_lambdify.py
@@ -1192,6 +1192,8 @@ def test_issue_14941():
     # test tuple
     f2 = lambdify([x, y], (y, x), 'sympy')
     assert f2(2, 3) == (3, 2)
+    f2b = lambdify([], (1,))  # gh-23224
+    assert f2b() == (1,)
 
     # test list
     f3 = lambdify([x, y], [y, x], 'sympy')

EOF_114329324912
PYTHONWARNINGS='ignore::UserWarning,ignore::SyntaxWarning' bin/test -C --verbose sympy/utilities/tests/test_lambdify.py
git checkout fdc707f73a65a429935c01532cd3970d3355eab6 sympy/utilities/tests/test_lambdify.py
