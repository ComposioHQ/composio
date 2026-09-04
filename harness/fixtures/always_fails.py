"""Known-bad selftest fixture: must exit non-zero."""

import sys

print("fixture: failing on purpose", file=sys.stderr)
sys.exit(1)
