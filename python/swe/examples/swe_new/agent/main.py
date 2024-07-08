from composio_crewai import Action

from agent import composio_toolset, crew


def main() -> None:
    """Run the agent."""
    repo = "ComposioHQ/composio"
    calc_resp = composio_toolset.execute_action(
        entity_id="123",
        action=Action.MATHEMATICAL_CALCULATOR,
        params={"operation": "220*3387"},
    )
    print(calc_resp)
    return
    clone_resp = composio_toolset.execute_action(
        entity_id="123",
        action=Action.GITCMDTOOL_GITHUB_CLONE_CMD,
        params={
            "repo_name": repo,
            "commit_id": "",
        },
    )
    if isinstance(clone_resp, dict) and clone_resp.get("status") == "failure":
        raise Exception(f"Error cloning repository: {clone_resp['details']}")
    crew.kickoff(
        inputs={
            "repo": repo,
            "issue": """Currently ExecEnv is not working properly, Docker is getting initialized even if I pass Host env. Please fix this.""",
        }
    )


if __name__ == "__main__":
    main()
