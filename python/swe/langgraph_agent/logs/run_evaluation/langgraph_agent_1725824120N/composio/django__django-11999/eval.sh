#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
export LANG=en_US.UTF-8
export LANGUAGE=en_US:en
export LC_ALL=en_US.UTF-8
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 84633905273fc916e3d17883810d9969c03f73c2
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 84633905273fc916e3d17883810d9969c03f73c2 tests/model_fields/tests.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/model_fields/tests.py b/tests/model_fields/tests.py
--- a/tests/model_fields/tests.py
+++ b/tests/model_fields/tests.py
@@ -168,6 +168,16 @@ def test_get_FIELD_display_translated(self):
         self.assertIsInstance(val, str)
         self.assertEqual(val, 'translated')
 
+    def test_overriding_FIELD_display(self):
+        class FooBar(models.Model):
+            foo_bar = models.IntegerField(choices=[(1, 'foo'), (2, 'bar')])
+
+            def get_foo_bar_display(self):
+                return 'something'
+
+        f = FooBar(foo_bar=1)
+        self.assertEqual(f.get_foo_bar_display(), 'something')
+
     def test_iterator_choices(self):
         """
         get_choices() works with Iterators.

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 model_fields.tests
git checkout 84633905273fc916e3d17883810d9969c03f73c2 tests/model_fields/tests.py
