#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 5d36a8266c7d5d1994d7a7eeb4016f80d9cb0401
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 5d36a8266c7d5d1994d7a7eeb4016f80d9cb0401 tests/migrations/test_commands.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/migrations/test_commands.py b/tests/migrations/test_commands.py
--- a/tests/migrations/test_commands.py
+++ b/tests/migrations/test_commands.py
@@ -2391,9 +2391,10 @@ def test_makemigrations_check(self):
         makemigrations --check should exit with a non-zero status when
         there are changes to an app requiring migrations.
         """
-        with self.temporary_migration_module():
+        with self.temporary_migration_module() as tmpdir:
             with self.assertRaises(SystemExit):
                 call_command("makemigrations", "--check", "migrations", verbosity=0)
+            self.assertFalse(os.path.exists(tmpdir))
 
         with self.temporary_migration_module(
             module="migrations.test_migrations_no_changes"

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 migrations.test_commands
git checkout 5d36a8266c7d5d1994d7a7eeb4016f80d9cb0401 tests/migrations/test_commands.py
