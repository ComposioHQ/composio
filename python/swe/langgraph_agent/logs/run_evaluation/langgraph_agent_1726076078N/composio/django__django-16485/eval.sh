#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 39f83765e12b0e5d260b7939fc3fe281d879b279
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 39f83765e12b0e5d260b7939fc3fe281d879b279 tests/template_tests/filter_tests/test_floatformat.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/template_tests/filter_tests/test_floatformat.py b/tests/template_tests/filter_tests/test_floatformat.py
--- a/tests/template_tests/filter_tests/test_floatformat.py
+++ b/tests/template_tests/filter_tests/test_floatformat.py
@@ -111,6 +111,8 @@ def test_zero_values(self):
         self.assertEqual(
             floatformat(0.000000000000000000015, 20), "0.00000000000000000002"
         )
+        self.assertEqual(floatformat("0.00", 0), "0")
+        self.assertEqual(floatformat(Decimal("0.00"), 0), "0")
 
     def test_negative_zero_values(self):
         tests = [

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 template_tests.filter_tests.test_floatformat
git checkout 39f83765e12b0e5d260b7939fc3fe281d879b279 tests/template_tests/filter_tests/test_floatformat.py
