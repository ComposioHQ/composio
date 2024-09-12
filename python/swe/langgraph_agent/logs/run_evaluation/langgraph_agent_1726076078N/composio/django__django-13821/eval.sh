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
git diff e64c1d8055a3e476122633da141f16b50f0c4a2d
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout e64c1d8055a3e476122633da141f16b50f0c4a2d tests/backends/sqlite/tests.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/backends/sqlite/tests.py b/tests/backends/sqlite/tests.py
--- a/tests/backends/sqlite/tests.py
+++ b/tests/backends/sqlite/tests.py
@@ -30,9 +30,9 @@ class Tests(TestCase):
     longMessage = True
 
     def test_check_sqlite_version(self):
-        msg = 'SQLite 3.8.3 or later is required (found 3.8.2).'
-        with mock.patch.object(dbapi2, 'sqlite_version_info', (3, 8, 2)), \
-                mock.patch.object(dbapi2, 'sqlite_version', '3.8.2'), \
+        msg = 'SQLite 3.9.0 or later is required (found 3.8.11.1).'
+        with mock.patch.object(dbapi2, 'sqlite_version_info', (3, 8, 11, 1)), \
+                mock.patch.object(dbapi2, 'sqlite_version', '3.8.11.1'), \
                 self.assertRaisesMessage(ImproperlyConfigured, msg):
             check_sqlite_version()
 

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 backends.sqlite.tests
git checkout e64c1d8055a3e476122633da141f16b50f0c4a2d tests/backends/sqlite/tests.py
