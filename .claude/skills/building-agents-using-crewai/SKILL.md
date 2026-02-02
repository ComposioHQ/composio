# Building Agents using CrewAI with Composio

Build multi-agent teams using CrewAI with Composio Tool Router.

## Installation

```bash
pip install composio-crewai crewai crewai-tools
```

**Find Latest Versions:**
```bash
pip index versions crewai | grep "Available versions" | head -1
pip index versions composio-crewai | grep "Available versions" | head -1
```

## Integration Method

**CrewAI is an agentic provider** - use MCP for multi-agent teams.

### MCP Integration

```python
from crewai import Agent, Task, Crew
from crewai.mcp import MCPServerHTTP
from composio import Composio

composio = Composio()

def create_crew(user_id: str):
    # Create session
    session = composio.create(user_id=user_id, toolkits=["github"])

    # Create agent with MCP server
    agent = Agent(
        role="GitHub Manager",
        goal="Manage GitHub repositories",
        backstory="You are an expert at GitHub operations",
        mcps=[
            MCPServerHTTP(
                url=session.mcp.url,
                headers=session.mcp.headers
            )
        ]
    )

    # Define task
    task = Task(
        description="Create a GitHub issue titled 'Bug Report'",
        expected_output="Confirmation of issue creation",
        agent=agent
    )

    # Execute crew
    crew = Crew(agents=[agent], tasks=[task])
    return crew

crew = create_crew("user_123")
result = crew.kickoff()
print(result)
```

### Multi-Agent Team Example

```python
from crewai import Agent, Task, Crew, Process
from crewai.mcp import MCPServerHTTP
from composio import Composio

composio = Composio()

def create_team(user_id: str):
    session = composio.create(user_id=user_id, toolkits=["github", "slack"])

    # Create MCP server connection
    mcp_server = MCPServerHTTP(
        url=session.mcp.url,
        headers=session.mcp.headers
    )

    # Create specialized agents
    researcher = Agent(
        role="GitHub Researcher",
        goal="Analyze repositories",
        backstory="Expert at code analysis",
        mcps=[mcp_server]
    )

    reporter = Agent(
        role="Report Writer",
        goal="Create reports",
        backstory="Expert at documentation",
        mcps=[mcp_server]
    )

    # Define tasks
    research_task = Task(
        description="Analyze the repository",
        expected_output="Analysis report",
        agent=researcher
    )

    report_task = Task(
        description="Create a summary report",
        expected_output="Markdown report",
        agent=reporter,
        context=[research_task]
    )

    crew = Crew(
        agents=[researcher, reporter],
        tasks=[research_task, report_task],
        process=Process.sequential
    )

    return crew

team = create_team("user_123")
result = team.kickoff()
```

## Key Features

- **Multi-Agent Teams**: Agents collaborate on tasks
- **Task Dependencies**: Sequential or hierarchical execution
- **YAML Configs**: Clean agent/task definitions
- **Production Ready**: Mature framework

## Key Resources

- **CrewAI Docs**: https://docs.crewai.com/
- **Tool Router Guide**: `/building-agents`
- **Quickstart**: https://docs.crewai.com/en/quickstart
- **GitHub**: https://github.com/crewAIInc/crewAI

## Environment Variables

```bash
OPENAI_API_KEY=sk-...  # Or other LLM provider
COMPOSIO_API_KEY=...
```

## Next Steps

1. Use `/building-agents` for comprehensive guide
2. Check `python/providers/crewai/` for complete examples
3. See [CrewAI docs](https://docs.crewai.com/) for multi-agent patterns
