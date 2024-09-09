#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 4b6273b87442a4437d8b3873ea3022ae163f4fdf
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -v --no-use-pep517 --no-build-isolation -e .
git checkout 4b6273b87442a4437d8b3873ea3022ae163f4fdf sklearn/ensemble/_hist_gradient_boosting/tests/test_gradient_boosting.py
git apply -v - <<'EOF_114329324912'
diff --git a/sklearn/ensemble/_hist_gradient_boosting/tests/test_gradient_boosting.py b/sklearn/ensemble/_hist_gradient_boosting/tests/test_gradient_boosting.py
--- a/sklearn/ensemble/_hist_gradient_boosting/tests/test_gradient_boosting.py
+++ b/sklearn/ensemble/_hist_gradient_boosting/tests/test_gradient_boosting.py
@@ -415,3 +415,14 @@ def test_infinite_values_missing_values():
 
     assert stump_clf.fit(X, y_isinf).score(X, y_isinf) == 1
     assert stump_clf.fit(X, y_isnan).score(X, y_isnan) == 1
+
+
+@pytest.mark.parametrize("scoring", [None, 'loss'])
+def test_string_target_early_stopping(scoring):
+    # Regression tests for #14709 where the targets need to be encoded before
+    # to compute the score
+    rng = np.random.RandomState(42)
+    X = rng.randn(100, 10)
+    y = np.array(['x'] * 50 + ['y'] * 50, dtype=object)
+    gbrt = HistGradientBoostingClassifier(n_iter_no_change=10, scoring=scoring)
+    gbrt.fit(X, y)

EOF_114329324912
pytest -rA sklearn/ensemble/_hist_gradient_boosting/tests/test_gradient_boosting.py
git checkout 4b6273b87442a4437d8b3873ea3022ae163f4fdf sklearn/ensemble/_hist_gradient_boosting/tests/test_gradient_boosting.py
