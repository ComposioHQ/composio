# Vulture allowlist — confirmed false positives.
#
# Vulture (see the `dead_code` nox session) cannot see some usages: symbols
# referenced only through `__all__`, dynamic attribute access, framework entry
# points, or `TYPE_CHECKING`-only re-exports look "unused" to it. List such
# confirmed-intentional names here so they stop showing up in the report.
#
# The idiom is a *bare reference* to the name (a load), one per line — that is
# what marks it "used". Keep a comment explaining why each entry is a false
# positive, and prune entries when the underlying symbol is deleted.

# Re-exported for downstream typing via `__all__` in
# composio/core/models/custom_tool.py (TYPE_CHECKING-only imports, so vulture
# does not connect the __all__ string to the import binding).
SessionAttachResponseExperimental  # noqa: B018, F821
SessionCreateResponseExperimental  # noqa: B018, F821
SessionRetrieveResponseExperimental  # noqa: B018, F821
