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
git diff 5573a54d409bb98b5c5acdb308310bed02d392c2
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 5573a54d409bb98b5c5acdb308310bed02d392c2 tests/admin_changelist/tests.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/admin_changelist/tests.py b/tests/admin_changelist/tests.py
--- a/tests/admin_changelist/tests.py
+++ b/tests/admin_changelist/tests.py
@@ -844,6 +844,26 @@ def test_get_list_editable_queryset(self):
         queryset = m._get_list_editable_queryset(request, prefix='form')
         self.assertEqual(queryset.count(), 2)
 
+    def test_get_list_editable_queryset_with_regex_chars_in_prefix(self):
+        a = Swallow.objects.create(origin='Swallow A', load=4, speed=1)
+        Swallow.objects.create(origin='Swallow B', load=2, speed=2)
+        data = {
+            'form$-TOTAL_FORMS': '2',
+            'form$-INITIAL_FORMS': '2',
+            'form$-MIN_NUM_FORMS': '0',
+            'form$-MAX_NUM_FORMS': '1000',
+            'form$-0-uuid': str(a.pk),
+            'form$-0-load': '10',
+            '_save': 'Save',
+        }
+        superuser = self._create_superuser('superuser')
+        self.client.force_login(superuser)
+        changelist_url = reverse('admin:admin_changelist_swallow_changelist')
+        m = SwallowAdmin(Swallow, custom_site)
+        request = self.factory.post(changelist_url, data=data)
+        queryset = m._get_list_editable_queryset(request, prefix='form$')
+        self.assertEqual(queryset.count(), 1)
+
     def test_changelist_view_list_editable_changed_objects_uses_filter(self):
         """list_editable edits use a filtered queryset to limit memory usage."""
         a = Swallow.objects.create(origin='Swallow A', load=4, speed=1)

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 admin_changelist.tests
git checkout 5573a54d409bb98b5c5acdb308310bed02d392c2 tests/admin_changelist/tests.py
