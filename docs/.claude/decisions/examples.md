# Examples Page Plan

Based on user interview analysis from #user-interviews Slack channel (50 use cases extracted).

## Structure

### Getting started
| Example | What it demonstrates |
|---------|---------------------|
| Hello, world | First tool execution, basic setup |
| Connect your first app in 60 seconds | OAuth flow, connected accounts |

### Guides
| Example | What it demonstrates |
|---------|---------------------|
| Building a Chat Agent | Core agentic loop, conversation context |
| Building a RAG Agent | Tool router + knowledge retrieval |
| Building a Slackbot Agent | Real-time messaging, event handling |
| Building a Natural Language Data Analysis Agent | Complex queries, structured output |
| Get started with Claude Code | MCP setup, Claude integration |
| Get started with OpenAI Agents SDK | Native tools with OpenAI |
| Get started with Vercel AI SDK | Streaming, Next.js integration |
| Get started with LangChain | LangChain tools wrapper |
| Get started with Mastra | Mastra framework integration |
| Get started with CrewAI | Multi-agent with CrewAI |

### Agents
| Example | What it demonstrates |
|---------|---------------------|
| Build a PR review agent with GitHub and Claude | Multi-tool (GitHub + AI), code context |
| Deploy an email assistant that drafts responses | Email integration, response generation |
| Create a Slack bot with access to 250+ tools | Tool router, many toolkits |
| Run a research agent that searches, scrapes, and summarizes | Web tools, chaining outputs |
| Build an AI SDR that enriches leads automatically | CRM + web research, data enrichment |
| Build an agentic RAG agent over your docs | RAG + tool calling combined |
| Build a data analysis agent with natural language queries | Database tools, natural language to SQL |
| Build a voice agent with real-time tool calling | Voice + tools, real-time streaming |
| Spawn sub-agents for parallel task execution | Sub-agents, parallel processing |
| Orchestrate multiple agents on a complex workflow | Multi-agent coordination, handoffs |
| SEO data retrieval agent | Specialized data APIs, reporting |

### Code & DevOps
| Example | What it demonstrates |
|---------|---------------------|
| Auto-triage GitHub issues and assign owners | GitHub API, classification, automation |
| Sync Linear tickets to Slack on status change | Cross-tool sync, webhooks |
| Post CI failure summaries to Discord | CI integration, notifications |
| Create Jira tickets from Slack messages | Slack → Jira, message parsing |

### Communication & Social
| Example | What it demonstrates |
|---------|---------------------|
| Send personalized emails at scale with Gmail | Bulk operations, personalization |
| Build a Discord bot that manages your server | Discord API, bot commands |
| Auto-respond to Slack DMs with context | Slack events, contextual responses |
| LinkedIn content strategy agent | LinkedIn API, content generation |

### Sales & CRM
| Example | What it demonstrates |
|---------|---------------------|
| HubSpot CRM automation: new lead → research → enrich | CRM integration, data enrichment pipeline |

### Productivity & Data
| Example | What it demonstrates |
|---------|---------------------|
| Sync databases to Google Sheets automatically | Database + Sheets, data sync |
| Build a meeting notes → Notion pipeline | Transcription + Notion, structured data |
| Create calendar events from natural language | NLP input, calendar APIs |
| Download attachments and process them | File download, file processing |
| Turn documents into structured output | Document parsing, structured extraction |
| Shopify sales reporting to Slack | E-commerce data, scheduled reports |

### Triggers & Background jobs
| Example | What it demonstrates |
|---------|---------------------|
| Build a Shopify customer support agent | E-commerce + support, always-on agent |
| Run an agent when new emails arrive | Email triggers, event-driven |
| Auto-review PRs on push | GitHub webhooks, automated review |
| Daily digest: Summarize GitHub activity to Slack | Scheduled jobs, aggregation |
| Weekly business report automation | Cron-style scheduling, multi-source data |
| Webhook → process → route to the right tool | Generic webhooks, routing logic |

---

## Summary

**Total: ~45 examples** across 8 categories

## Design Notes

- Style inspired by [Modal examples](https://modal.com/docs/examples) (domain categories, action-oriented naming)
- "Get started with..." section inspired by [Vercel AI SDK cookbook](https://ai-sdk.dev/cookbook)
- Framework (AI SDK, LangChain, etc.) shown as tabs within examples, not as primary categories
- Advanced features (file upload/download, sub-agents) embedded in real use cases, not separate sections

## Data Source

- Google Sheet with all 50 use cases: https://docs.google.com/spreadsheets/d/16AH6LQyS5SZh2IezvwJptEGjR-LwLt0YfLEvtfqq94o/edit
- Extracted from Slack #user-interviews channel (157 messages, 77 substantial)

---

## Future Plans

### Featured Section
- Add a hero grid at the top with 5 "wow" examples prominently displayed
- Similar to Modal's featured examples

### Templates
- Pre-built starters users can clone
- "AI Email Assistant Template"
- "GitHub Bot Template"
- "Slack Bot Template"

### More Sales & CRM Examples
- Salesforce automation
- Deal tracking agent
- Pipeline management agent

### MCP-Specific Section
- Connect Composio MCP to Claude Desktop
- Use Composio MCP with Cursor
- MCP setup with other clients
- (This is a big entry point for users)

### File Handling Example
- Process uploaded PDFs and summarize them
- Download attachments and analyze them
- (Users mentioned this frequently in interviews)

### Additional Examples to Match Modal Quality
- Need ~20 more examples total
- More specific, action-oriented naming
- Cover edge cases and advanced patterns
