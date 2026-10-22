"""
TypeSafe (Jev) demo.

Jev picks a Hacker News tool from a plain-language request and binds the arguments
it can. You complete the rest, then execute.

Set COMPOSIO_API_KEY and TYPESAFE_API_KEY in your environment or in a .env file.
"""

import json

import dotenv
from composio_typesafe import TypesafeProvider

from composio import Composio

# Load environment variables from .env
dotenv.load_dotenv()

USER_ID = "default"
REQUEST = "Look up the Hacker News user 'pg'"

# What your application already knows. Jev never writes free text such as a username.
KNOWN_ARGUMENTS = {
    "HACKERNEWS_GET_USER": {"username": "pg"},
}

# Initialize tools
provider = TypesafeProvider()
composio = Composio(provider=provider)


def main():
    tool_set = composio.tools.get(
        user_id=USER_ID,
        tools=[
            "HACKERNEWS_GET_USER",
            "HACKERNEWS_GET_TOP_STORIES",
            "HACKERNEWS_SEARCH_POSTS",
        ],
    )
    print(f"Compiled {len(tool_set['tools'])} tools into Jev questions")

    decision = provider.decide(tool_set, REQUEST)
    print("Decision:")
    print(json.dumps(decision, indent=2))

    if decision["kind"] == "abstain":
        print(f"Jev abstained: {decision['reason']}")
        return

    # This demo runs against real accounts, so it only ever executes read-only tools.
    if decision["risk"] != "read_only":
        print(f"Not executing {decision['tool']}: its risk class is {decision['risk']}")
        return

    if decision["kind"] == "partial":
        print(
            "Still missing:", ", ".join(".".join(path) for path in decision["missing"])
        )

    # A partial call is completed with caller arguments. They win over Jev-bound values.
    result = provider.execute(
        USER_ID,
        decision,
        arguments=KNOWN_ARGUMENTS.get(decision["tool"], {}),
    )
    print("Result:")
    print(result["data"])


if __name__ == "__main__":
    main()
