#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff 31eba1a76dd485dc633cae48227b46879eda5df4
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .[test]
git checkout 31eba1a76dd485dc633cae48227b46879eda5df4 tests/test_directive_code.py
git apply -v - <<'EOF_114329324912'
diff --git a/tests/test_directive_code.py b/tests/test_directive_code.py
--- a/tests/test_directive_code.py
+++ b/tests/test_directive_code.py
@@ -251,6 +251,19 @@ def test_LiteralIncludeReader_dedent(literal_inc_path):
                        "\n")
 
 
+@pytest.mark.xfail(os.name != 'posix', reason="Not working on windows")
+def test_LiteralIncludeReader_dedent_and_append_and_prepend(literal_inc_path):
+    # dedent: 2
+    options = {'lines': '9-11', 'dedent': 2, 'prepend': 'class Foo:', 'append': '# comment'}
+    reader = LiteralIncludeReader(literal_inc_path, options, DUMMY_CONFIG)
+    content, lines = reader.read()
+    assert content == ("class Foo:\n"
+                       "  def baz():\n"
+                       "      pass\n"
+                       "\n"
+                       "# comment\n")
+
+
 @pytest.mark.xfail(os.name != 'posix', reason="Not working on windows")
 def test_LiteralIncludeReader_tabwidth(testroot):
     # tab-width: 4

EOF_114329324912
tox --current-env -epy39 -v -- tests/test_directive_code.py
git checkout 31eba1a76dd485dc633cae48227b46879eda5df4 tests/test_directive_code.py
