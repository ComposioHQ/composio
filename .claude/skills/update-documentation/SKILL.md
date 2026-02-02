---
name: update-documentation
description: Maintain code documentation and inline docstrings after feature implementations or bug fixes. Use when implementing features, fixing bugs, or modifying APIs. Updates TypeScript docs (ts/docs), Python docs (python/docs), TSDoc/JSDoc comments, and Python docstrings.
---

# Update Documentation

Apply this skill **proactively** after every feature implementation or bug fix. Documentation updates are part of the implementation, not optional.

## Update Workflow

### 1. Update Inline Documentation

**TypeScript:**
- Update TSDoc/JSDoc for modified functions, classes, methods, interfaces
- Include `@param`, `@returns`, `@throws`, and `@example` tags
- Ensure type annotations are current

**Python:**
- Update docstrings for modified functions, classes, methods
- Include Args, Returns, Raises, and Examples sections
- Keep type hints synchronized

### 2. Update TypeScript Docs (ts/docs/)

**Documentation mapping:**
- Tools → `ts/docs/api/tools.md`
- Toolkits → `ts/docs/api/toolkits.md`
- Connected accounts → `ts/docs/api/connected-accounts.md`
- Custom tools → `ts/docs/api/custom-tools.md`
- Providers → `ts/docs/providers/` or `ts/docs/api/providers.md`
- Auth → `ts/docs/api/auth-configs.md`
- Modifiers → `ts/docs/advanced/modifiers.md`
- Error handling → `ts/docs/advanced/error-handling.md`

Update code examples to reflect changes.

### 3. Update Python Docs (python/docs/)

Update relevant files in `python/docs/` to match TypeScript documentation concepts.

### 4. Update Main Docs (fern/)

If changes affect user-facing APIs:
- Update `fern/pages/` documentation
- Update code snippets in `fern/snippets/` (both TS and Python)

## Documentation Checklist

- [ ] All modified functions have complete inline documentation
- [ ] Parameters, returns, and errors documented
- [ ] Code examples tested and working
- [ ] TypeScript and Python docs are consistent
- [ ] Breaking changes clearly marked with migration guides

## Special Cases

**Breaking Changes:**
- Add prominent notice at top of docs
- Show old vs new behavior side-by-side
- Provide migration examples

**New Features:**
- Add to appropriate API doc file
- Include common use case examples
- Link to related features

**Bug Fixes:**
- Update docstrings if behavior changed
- Update affected examples

## Finding Related Docs

```bash
# Find docs mentioning a function/class
rg "functionName" ts/docs/ python/docs/ fern/

# Find all code examples
rg "```(typescript|python|ts|py)" ts/docs/
```

## Key Principles

1. Update inline docs first (TSDoc/docstrings)
2. Update markdown docs second
3. Keep TypeScript and Python docs synchronized
4. Provide working, tested examples
5. Apply proactively without being asked
