from agent import crew


# Agent variables
ROLE = "Software Engineer"
GOAL = "Fix the coding issues given by the user"
BACKSTORY = (
    "You are a software engineer that understands the requirements given by "
    "the user and address them by writing or updating the code as required in "
    "the given environment"
)

# Task variables
DESCRIPTION = (
    "Create a calculator where one file contains mathematical functions (add, "
    "subtract, multiply, divide), another file handles input/output operations, "
    "and a third file is the main script that integrates these modules."
)
EXPECTED_OUTPUT = "Correctly compute and display results based on user inputs."


def main() -> None:
    """Run the agent."""
    crew.kickoff(
        inputs={
            "role": ROLE,
            "goal": GOAL,
            "backstory": BACKSTORY,
            "description": DESCRIPTION,
            "expected_output": EXPECTED_OUTPUT,
        }
    )


if __name__ == "__main__":
    main()
