#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff b4817d20b9e55df30be0b1b2ca8c8bb6d61aab07
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout b4817d20b9e55df30be0b1b2ca8c8bb6d61aab07 tests/dbshell/test_postgresql.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/dbshell/test_postgresql.py b/tests/dbshell/test_postgresql.py
--- a/tests/dbshell/test_postgresql.py
+++ b/tests/dbshell/test_postgresql.py
@@ -154,7 +154,7 @@ def test_accent(self):
     def test_parameters(self):
         self.assertEqual(
             self.settings_to_cmd_args_env({"NAME": "dbname"}, ["--help"]),
-            (["psql", "dbname", "--help"], None),
+            (["psql", "--help", "dbname"], None),
         )
 
     @skipUnless(connection.vendor == "postgresql", "Requires a PostgreSQL connection")

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 dbshell.test_postgresql
git checkout b4817d20b9e55df30be0b1b2ca8c8bb6d61aab07 tests/dbshell/test_postgresql.py
