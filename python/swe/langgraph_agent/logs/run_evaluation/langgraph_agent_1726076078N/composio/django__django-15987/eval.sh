#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 7e6b537f5b92be152779fc492bb908d27fe7c52a
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 7e6b537f5b92be152779fc492bb908d27fe7c52a tests/fixtures_regress/tests.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/fixtures_regress/tests.py b/tests/fixtures_regress/tests.py
--- a/tests/fixtures_regress/tests.py
+++ b/tests/fixtures_regress/tests.py
@@ -569,6 +569,20 @@ def test_fixture_dirs_with_default_fixture_path(self):
         with self.assertRaisesMessage(ImproperlyConfigured, msg):
             management.call_command("loaddata", "absolute.json", verbosity=0)
 
+    @override_settings(FIXTURE_DIRS=[Path(_cur_dir) / "fixtures"])
+    def test_fixture_dirs_with_default_fixture_path_as_pathlib(self):
+        """
+        settings.FIXTURE_DIRS cannot contain a default fixtures directory
+        for application (app/fixtures) in order to avoid repeated fixture loading.
+        """
+        msg = (
+            "'%s' is a default fixture directory for the '%s' app "
+            "and cannot be listed in settings.FIXTURE_DIRS."
+            % (os.path.join(_cur_dir, "fixtures"), "fixtures_regress")
+        )
+        with self.assertRaisesMessage(ImproperlyConfigured, msg):
+            management.call_command("loaddata", "absolute.json", verbosity=0)
+
     @override_settings(
         FIXTURE_DIRS=[
             os.path.join(_cur_dir, "fixtures_1"),

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 fixtures_regress.tests
git checkout 7e6b537f5b92be152779fc492bb908d27fe7c52a tests/fixtures_regress/tests.py
