import typing as t


InputType = t.TypeVar("InputType")


def read_user_input(
    prompt: str,
    metavar: str,
    validator: t.Callable[[str], InputType],
) -> InputType:
    """Read user input."""
    while True:
        value = input(f"{prompt} > ")
        try:
            return validator(value)
        except Exception as e:
            print(f"Invalid value for `{metavar}` error parsing `{value}`; {e}")


def _github_pull_request_validator(pr_url: str) -> t.Tuple[str, str, int]:
    """Extract owner, repo name and PR number from GitHub PR URL."""
    if not pr_url.startswith("https://github.com/"):
        raise ValueError(
            "Invalid GitHub PR URL format. Must start with 'https://github.com/'"
        )

    # Remove https://github.com/ from the start
    path = pr_url.replace("https://github.com/", "")

    # Split remaining path into parts
    parts = path.split("/")

    # Valid PR URL should have format: owner/repo/pull/number
    if len(parts) != 4 or parts[2] != "pull":
        raise ValueError(
            "Invalid GitHub PR URL format. Expected format: https://github.com/owner/repo/pull/number"
        )

    owner = parts[0]
    repo = parts[1]
    try:
        pr_number = int(parts[3])
    except ValueError:
        raise ValueError("Pull request number must be an integer")

    return owner, repo, pr_number


def from_github() -> t.Tuple[str, str, int]:
    """Take input from github."""
    owner, name, pull_number = read_user_input(
        prompt="Enter github pull request link",
        metavar="github pull request",
        validator=_github_pull_request_validator,
    )
    return owner, name, pull_number
