#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 0b0998dc151feb77068e2387c34cc50ef6b356ae
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .
git checkout 0b0998dc151feb77068e2387c34cc50ef6b356ae tests/migrations/test_optimizer.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/migrations/test_optimizer.py b/tests/migrations/test_optimizer.py
--- a/tests/migrations/test_optimizer.py
+++ b/tests/migrations/test_optimizer.py
@@ -1158,3 +1158,17 @@ def test_rename_index(self):
                 ),
             ]
         )
+
+    def test_add_remove_index(self):
+        self.assertOptimizesTo(
+            [
+                migrations.AddIndex(
+                    "Pony",
+                    models.Index(
+                        fields=["weight", "pink"], name="idx_pony_weight_pink"
+                    ),
+                ),
+                migrations.RemoveIndex("Pony", "idx_pony_weight_pink"),
+            ],
+            [],
+        )

EOF_114329324912
./tests/runtests.py --verbosity 2 --settings=test_sqlite --parallel 1 migrations.test_optimizer
git checkout 0b0998dc151feb77068e2387c34cc50ef6b356ae tests/migrations/test_optimizer.py
