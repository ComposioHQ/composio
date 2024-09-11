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
git diff d746f28949c009251a8741ba03d156964050717f
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout d746f28949c009251a8741ba03d156964050717f tests/auth_tests/test_forms.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/auth_tests/test_forms.py b/tests/auth_tests/test_forms.py
--- a/tests/auth_tests/test_forms.py
+++ b/tests/auth_tests/test_forms.py
@@ -1022,6 +1022,7 @@ def test_render(self):
 
     def test_readonly_field_has_changed(self):
         field = ReadOnlyPasswordHashField()
+        self.assertIs(field.disabled, True)
         self.assertFalse(field.has_changed('aaa', 'bbb'))
 
 

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 auth_tests.test_forms
git checkout d746f28949c009251a8741ba03d156964050717f tests/auth_tests/test_forms.py
