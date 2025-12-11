"""
DeepAgents Chat Agent with Gmail and Google Drive Integration

This example demonstrates how to create a chat agent using LangChain's DeepAgents
framework integrated with Composio tools for Gmail and Google Drive operations.

The agent can:
- Send and read emails via Gmail
- Create, read, and manage files in Google Drive
- Plan and execute multi-step tasks using DeepAgents' built-in planning capabilities

Prerequisites:
1. Install dependencies: pip install deepagents composio composio-langchain langchain-anthropic
2. Set up Composio authentication:
   - composio add gmail
   - composio add googledrive
3. Set environment variables:
   - COMPOSIO_API_KEY: Your Composio API key
   - ANTHROPIC_API_KEY: Your Anthropic API key (for Claude model)
"""

import os

from composio import Composio
from composio_langchain import LangchainProvider
from deepagents import create_deep_agent
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver


DEFAULT_OPENAI_MODEL = "gpt-4o"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929"


def create_gmail_gdrive_agent(
    user_id: str = "default",
    model_name: str | None = None,
    use_anthropic: bool = False,
):
    """
    Create a DeepAgent with Gmail and Google Drive tools from Composio.

    Args:
        user_id: The Composio user ID for authentication
        model_name: The model to use. Defaults to gpt-4o for OpenAI or
            claude-sonnet-4-5-20250929 for Anthropic if not specified.
        use_anthropic: Whether to use Anthropic's Claude model instead of OpenAI

    Returns:
        A compiled DeepAgent with Gmail and Google Drive capabilities
    """
    composio = Composio(provider=LangchainProvider())

    gmail_tools = composio.tools.get(
        user_id=user_id,
        toolkits=["GMAIL"],
    )

    gdrive_tools = composio.tools.get(
        user_id=user_id,
        toolkits=["GOOGLEDRIVE"],
    )

    all_tools = gmail_tools + gdrive_tools

    if use_anthropic:
        model = ChatAnthropic(
            model_name=model_name or DEFAULT_ANTHROPIC_MODEL,
            max_tokens=8192,
        )
    else:
        model = ChatOpenAI(
            model=model_name or DEFAULT_OPENAI_MODEL,
            temperature=0,
        )

    checkpointer = MemorySaver()

    agent = create_deep_agent(
        model=model,
        tools=all_tools,
        system_prompt="""You are a helpful assistant with access to Gmail and Google Drive.
You can help users with:
- Reading, sending, and managing emails in Gmail
- Creating, reading, updating, and organizing files in Google Drive
- Searching for emails and files
- Managing labels and folders

When performing tasks:
1. First understand what the user wants to accomplish
2. Break down complex tasks into smaller steps using your todo list
3. Execute each step carefully and report progress
4. If you encounter errors, try alternative approaches before giving up

Always be helpful and provide clear explanations of what you're doing.""",
        checkpointer=checkpointer,
    )

    return agent


def chat_loop(agent, thread_id: str = "default"):
    """
    Run an interactive chat loop with the agent.

    Args:
        agent: The compiled DeepAgent
        thread_id: The thread ID for conversation persistence
    """
    print("\n" + "=" * 60)
    print("DeepAgents Chat Agent with Gmail & Google Drive")
    print("=" * 60)
    print("\nThis agent can help you with:")
    print("  - Reading and sending emails via Gmail")
    print("  - Managing files in Google Drive")
    print("  - Multi-step tasks combining both services")
    print("\nType 'quit' or 'exit' to end the conversation.")
    print("Type 'clear' to start a new conversation thread.")
    print("=" * 60 + "\n")

    config = {"configurable": {"thread_id": thread_id}}

    while True:
        try:
            user_input = input("\nYou: ").strip()

            if not user_input:
                continue

            if user_input.lower() in ["quit", "exit"]:
                print("\nGoodbye!")
                break

            if user_input.lower() == "clear":
                thread_id = f"thread_{os.urandom(4).hex()}"
                config = {"configurable": {"thread_id": thread_id}}
                print("\nStarted a new conversation thread.")
                continue

            print("\nAgent: ", end="", flush=True)

            response = agent.invoke(
                {"messages": [{"role": "user", "content": user_input}]},
                config=config,
            )

            if response.get("messages"):
                last_message = response["messages"][-1]
                if hasattr(last_message, "content"):
                    print(last_message.content)
                else:
                    print(last_message.get("content", ""))

        except KeyboardInterrupt:
            print("\n\nInterrupted. Goodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}")
            print("Please try again or type 'quit' to exit.")


def run_single_task(agent, task: str, thread_id: str = "default"):
    """
    Run a single task with the agent.

    Args:
        agent: The compiled DeepAgent
        task: The task to execute
        thread_id: The thread ID for conversation persistence

    Returns:
        The agent's response
    """
    config = {"configurable": {"thread_id": thread_id}}

    response = agent.invoke(
        {"messages": [{"role": "user", "content": task}]},
        config=config,
    )

    if response.get("messages"):
        last_message = response["messages"][-1]
        if hasattr(last_message, "content"):
            return last_message.content
        return last_message.get("content", "")

    return None


def main():
    """Main entry point for the chat agent."""
    import argparse

    parser = argparse.ArgumentParser(
        description="DeepAgents Chat Agent with Gmail and Google Drive"
    )
    parser.add_argument(
        "--user-id",
        default="default",
        help="Composio user ID for authentication",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model to use (default: gpt-4o for OpenAI, claude-sonnet-4-5-20250929 for Anthropic)",
    )
    parser.add_argument(
        "--anthropic",
        action="store_true",
        help="Use Anthropic's Claude model instead of OpenAI",
    )
    parser.add_argument(
        "--task",
        type=str,
        help="Run a single task instead of interactive chat",
    )

    args = parser.parse_args()

    print("Initializing agent...")
    agent = create_gmail_gdrive_agent(
        user_id=args.user_id,
        model_name=args.model,
        use_anthropic=args.anthropic,
    )

    if args.task:
        print(f"\nExecuting task: {args.task}\n")
        result = run_single_task(agent, args.task)
        print(f"\nResult:\n{result}")
    else:
        chat_loop(agent)


if __name__ == "__main__":
    main()
