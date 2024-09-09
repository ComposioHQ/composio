#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 652c68ffeebd510a6f59e1b56b3e007d07683ad8
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 652c68ffeebd510a6f59e1b56b3e007d07683ad8 tests/model_fields/tests.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/model_fields/tests.py b/tests/model_fields/tests.py
--- a/tests/model_fields/tests.py
+++ b/tests/model_fields/tests.py
@@ -128,9 +128,14 @@ class InheritAbstractModel2(AbstractModel):
         self.assertLess(abstract_model_field, inherit2_model_field)
         self.assertLess(inherit1_model_field, inherit2_model_field)
 
-        self.assertNotEqual(hash(abstract_model_field), hash(inherit1_model_field))
-        self.assertNotEqual(hash(abstract_model_field), hash(inherit2_model_field))
-        self.assertNotEqual(hash(inherit1_model_field), hash(inherit2_model_field))
+    def test_hash_immutability(self):
+        field = models.IntegerField()
+        field_hash = hash(field)
+
+        class MyModel(models.Model):
+            rank = field
+
+        self.assertEqual(field_hash, hash(field))
 
 
 class ChoicesTests(SimpleTestCase):

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 model_fields.tests
git checkout 652c68ffeebd510a6f59e1b56b3e007d07683ad8 tests/model_fields/tests.py
