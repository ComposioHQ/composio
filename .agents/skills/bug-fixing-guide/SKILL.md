# Bug Fixing Guide

Standard practices for fixing bugs in Composio SDK. Always add regression tests for major bugs.

## Bug Fix Process

### 1. Understand the Bug

- **Reproduce the issue** - Create a minimal reproduction case
- **Identify root cause** - Debug and trace the issue to its source
- **Check existing tests** - See if tests exist for the affected code
- **Review related code** - Check for similar issues elsewhere

### 2. Fix the Bug

- **Implement the fix** - Make minimal changes to address the root cause
- **Avoid scope creep** - Don't refactor unrelated code
- **Follow coding standards** - Maintain consistency with existing code
- **Test locally** - Verify the fix works as expected

### 3. Verify the Fix (Quick Functional Testing)

**Optional but Recommended:** Test actual functionality before adding unit tests.

For bugs affecting framework integrations or real-world usage:

- Use **ephemeral E2E tests** to quickly verify the fix works end-to-end
- Read `ephemeral-e2e-sdk-tests` skill for quick verification setup
- Test in `.agent_cache/test-<bug-description>` (never commit these)
- Example: `.agent_cache/test-fix-openai-tool-execution`

### 4. Add Regression Tests (Required for Major Bugs)

**Critical:** For major bugs, always add tests to prevent regressions.

See `.Codex/rules/bug-fix-testing.mdc` for detailed testing requirements:

- Where to add tests (TypeScript: `ts/packages/<package>/test/`, Python: `python/tests/`)
- How to structure tests (Vitest for TS, pytest for Python)
- Test naming conventions and patterns
- Mocking strategies

**Key Points:**

- Add tests to **existing test files** for the affected feature
- Tests should **fail before the fix** and **pass after**
- Cover edge cases related to the bug
- Run tests before committing: `pnpm test` (TS) or `make tst` (Python)

### 5. Document the Fix

- **Clear commit message** - Describe what was fixed and why
- **Reference issues** - Link to GitHub issues or tickets
- **Update docs** - If the bug exposed unclear documentation
- **Add comments** - Explain non-obvious fixes in the code

## When to Add Tests

**Always add tests for:**

- Logic errors and incorrect behavior
- Edge cases and boundary conditions
- Race conditions and async issues
- Security vulnerabilities
- Data corruption or loss issues

**Consider tests for:**

- Type errors (if not caught by TypeScript/mypy)
- Minor UI/UX issues
- Performance optimizations

**May skip tests for:**

- Trivial typo fixes in comments/docs
- Formatting or linting issues

## Testing Resources

- **Quick verification**: Read `ephemeral-e2e-sdk-tests` skill (test in `.agent_cache/`)
- **Full testing guidelines**: `.Codex/rules/bug-fix-testing.mdc`
- **TypeScript tests**: `ts/packages/<package>/test/`
- **Python tests**: `python/tests/`
- **E2E tests**: `ts/e2e-tests/` (for runtime compatibility issues)

## Common Pitfalls

- Fixing symptoms instead of root cause
- Not adding regression tests for major bugs
- Breaking existing tests without updating them
- Adding tests in new files instead of existing ones
- Not running the full test suite before committing
