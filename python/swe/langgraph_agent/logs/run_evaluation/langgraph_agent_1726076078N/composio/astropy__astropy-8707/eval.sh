#!/bin/bash
set -uxo pipefail
source /opt/miniconda3/bin/activate
conda activate testbed
cd /testbed
git config --global --add safe.directory /testbed
cd /testbed
git status
git show
git diff a85a0747c54bac75e9c3b2fe436b105ea029d6cf
source /opt/miniconda3/bin/activate
conda activate testbed
python -m pip install -e .[test] --verbose
git checkout a85a0747c54bac75e9c3b2fe436b105ea029d6cf astropy/io/fits/tests/test_header.py
git apply -v - <<'EOF_114329324912'
diff --git a/astropy/io/fits/tests/test_header.py b/astropy/io/fits/tests/test_header.py
--- a/astropy/io/fits/tests/test_header.py
+++ b/astropy/io/fits/tests/test_header.py
@@ -85,6 +85,15 @@ def test_card_constructor_default_args(self):
         c = fits.Card()
         assert '' == c.keyword
 
+    def test_card_from_bytes(self):
+        """
+        Test loading a Card from a `bytes` object (assuming latin-1 encoding).
+        """
+
+        c = fits.Card.fromstring(b"ABC     = 'abc'")
+        assert c.keyword == 'ABC'
+        assert c.value == 'abc'
+
     def test_string_value_card(self):
         """Test Card constructor with string value"""
 
@@ -2329,6 +2338,21 @@ def test_newlines_in_commentary(self):
             else:
                 c.verify('exception')
 
+    def test_header_fromstring_bytes(self):
+        """
+        Test reading a Header from a `bytes` string.
+
+        See https://github.com/astropy/astropy/issues/8706
+        """
+
+        with open(self.data('test0.fits'), 'rb') as fobj:
+            pri_hdr_from_bytes = fits.Header.fromstring(fobj.read())
+
+        pri_hdr = fits.getheader(self.data('test0.fits'))
+        assert pri_hdr['NAXIS'] == pri_hdr_from_bytes['NAXIS']
+        assert pri_hdr == pri_hdr_from_bytes
+        assert pri_hdr.tostring() == pri_hdr_from_bytes.tostring()
+
 
 class TestRecordValuedKeywordCards(FitsTestCase):
     """

EOF_114329324912
pytest -rA astropy/io/fits/tests/test_header.py
git checkout a85a0747c54bac75e9c3b2fe436b105ea029d6cf astropy/io/fits/tests/test_header.py
