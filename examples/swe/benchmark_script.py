from datasets import load_dataset
from pathlib import Path
from composio_crewai import ComposioToolSet, Action
from crewai import Agent, Crew, Process, Task
from langchain_openai import ChatOpenAI


def filter_short_problem_statements(instance):
    """
    Filter function to exclude problem statements with fewer than 40 words.
    """
    return len(instance["problem_statement"].split()) > 200


def get_issues_dataset():
    # Load the SWE-bench dataset
    dev_dataset = load_dataset("princeton-nlp/SWE-bench_Lite", split="dev")
    test_dataset = load_dataset("princeton-nlp/SWE-bench_Lite", split="test")

    # Filter the dataset to include only longer problem statements
    filtered_test_dataset = test_dataset.filter(filter_short_problem_statements)

    # Display the first few entries of the filtered dataset
    print(filtered_test_dataset[:5])
    return filtered_test_dataset


def main():
    """
    Main function to load and display entries from the SWE-bench lite dataset.
    """
    composio_toolset = ComposioToolSet()
    llm = ChatOpenAI(model="gpt-4-turbo")
    base_role = (
        "You are the best programmer. You think carefully and step by step take action."
    )
    goal = "Help fix the given issue / bug in the code. And make sure you get it working. "
    tools = composio_toolset.get_actions(actions=[Action.GREPTILECODEQUERY])
    issues = get_issues_dataset()
    for issue in issues:
        backstory = issue["backstory"]
        issue_description = issue["issue_description"]
        repo_name = issue["repo_name"]
        instance_id = issue["instance_id"]
        print(f"Backstory: {backstory}")
        print(f"Issue Description: {issue_description}")
        print(f"Repository Name: {repo_name}")
        print(f"Instance ID: {instance_id}")
        print("--------------------------------------------------")
        expected_output = "Name of the file"
        agent_1 = Agent(
            role=base_role,
            goal=goal,
            backstory="You are the best programmer. You think carefully and step by step take action.",
            verbose=True,
            tools=tools,
            llm=llm,
            memory=True,
            cache=False,
        )

        task = Task(
            description=issue_description,
            agent=agent_1,
            expected_output=expected_output,
        )

        my_crew = Crew(
            agents=[agent_1],
            tasks=[task],
            process=Process.sequential,
            full_output=True,
            verbose=True,
            cache=False,
            memory=True,
        )

        my_crew.kickoff()
        print(my_crew.usage_metrics)

        print(f"total issues are: {len(issues)}")


if __name__ == "__main__":
    main()