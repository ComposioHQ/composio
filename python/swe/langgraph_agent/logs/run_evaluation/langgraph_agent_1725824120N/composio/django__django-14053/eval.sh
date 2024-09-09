#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 179ee13eb37348cd87169a198aec18fedccc8668
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 179ee13eb37348cd87169a198aec18fedccc8668 tests/staticfiles_tests/test_storage.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/staticfiles_tests/test_storage.py b/tests/staticfiles_tests/test_storage.py
--- a/tests/staticfiles_tests/test_storage.py
+++ b/tests/staticfiles_tests/test_storage.py
@@ -203,6 +203,8 @@ def test_post_processing(self):
         self.assertIn(os.path.join('cached', 'css', 'window.css'), stats['post_processed'])
         self.assertIn(os.path.join('cached', 'css', 'img', 'window.png'), stats['unmodified'])
         self.assertIn(os.path.join('test', 'nonascii.css'), stats['post_processed'])
+        # No file should be yielded twice.
+        self.assertCountEqual(stats['post_processed'], set(stats['post_processed']))
         self.assertPostCondition()
 
     def test_css_import_case_insensitive(self):

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 staticfiles_tests.test_storage
git checkout 179ee13eb37348cd87169a198aec18fedccc8668 tests/staticfiles_tests/test_storage.py
