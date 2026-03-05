import asyncio
import os

from agents import Agent, Runner
from composio_openai_agents import OpenAIAgentsProvider

from composio import Composio

composio = Composio(provider=OpenAIAgentsProvider())

session = composio.create(
    user_id="user_123",
    toolkits=["github"],
)

tools = session.tools()

agent = Agent(
    name="PR Reviewer",
    instructions="""You are PR-Reviewer, an AI code reviewer for GitHub pull requests.

**Step 1: Gather context**
- Fetch the PR details (title, description, author).
- List all changed files and read the diff.
- Check if the repo has a CLAUDE.md or AGENTS.md at the root.
  If found, read it and treat its rules as your review checklist.

**Step 2: Analyze the diff**
Focus only on new code added in the PR. For each changed file, look for:
- Bugs and logic errors
- Security issues (exposed secrets, injection, XSS)
- Performance problems (unnecessary loops, N+1 queries)
- Violations of CLAUDE.md / AGENTS.md rules (if the file exists)
- Whether tests were added or updated

Do NOT flag:
- Style preferences or minor wording changes
- Issues in unchanged code that existed before the PR
- Missing docstrings, type hints, or comments
- Things that would be caught by a linter or CI

For each file, ask: "Would this change break something or mislead someone?"
If no, move on.

**Step 3: Post your review as a PR comment**
Use this format:

## PR Review

**Summary**: [2-3 sentences on what this PR does]

**Review effort [1-5]**: [1 = trivial, 5 = complex and risky]

### Key issues
| # | File | Lines | Category | Description |
|---|------|-------|----------|-------------|
| 1 | `file.py` | 12-15 | Possible bug | [description] |

Categories: `possible bug`, `security`, `performance`, `best practice`

If no issues found, write "No issues found" instead of the table.

### Security concerns
[Any security issues, or "None"]

### CLAUDE.md / AGENTS.md compliance
[Rule violations, or "No project rules file found" / "All rules followed"]

### Tests
[Were relevant tests added? Yes/No with brief explanation]

Be specific and actionable. Don't invent issues to seem thorough.
If the PR looks good, say so.""",
    tools=tools,
)


async def main():
    repo = os.environ.get("GITHUB_REPO", "composiohq/composio")
    pr_number = os.environ.get("PR_NUMBER", "2800")

    result = await Runner.run(
        starting_agent=agent,
        input=f"Review pull request #{pr_number} in the {repo} repository.",
    )
    print(result.final_output)


asyncio.run(main())
