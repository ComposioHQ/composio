# flake8: noqa E203

import json
import os
import re
from datetime import datetime

from swekit.benchmark.docker_utils.docker_file_generator.const import (
    MAP_REPO_TO_ENV_YML_PATHS,
    MAP_REPO_TO_REQS_PATHS,
    NON_TEST_EXTS,
    SWE_BENCH_URL_RAW,
)


def get_environment_yml(
    instance: dict,
    env_name: str,
    save_path: str = None,
    python_version: str = None,
) -> str:
    """
    Get environment.yml for given task instance

    Args:
        instance (dict): SWE Bench Task instance
        env_name (str): Rename retrieved environment.yml to this name
        save_path (str): If provided, save environment.yml to this path
    Returns:
        environment.yml (str): If save_path given, returns path to saved environment.yml.
            Otherwise, returns environment.yml as string
    """
    import requests

    # Attempt to find environment.yml at each path based on task instance's repo
    path_worked = False

    commit = (
        "environment_setup_commit"
        if "environment_setup_commit" in instance
        else "base_commit"
    )
    for req_path in MAP_REPO_TO_ENV_YML_PATHS[instance["repo"]]:
        reqs_url = os.path.join(
            SWE_BENCH_URL_RAW, instance["repo"], instance[commit], req_path
        )
        reqs = requests.get(reqs_url)
        if reqs.status_code == 200:
            path_worked = True
            break
    if not path_worked:
        print(
            f"Could not find environment.yml at paths {MAP_REPO_TO_ENV_YML_PATHS[instance['repo']]}"
        )
        return None

    lines = reqs.text.split("\n")
    cleaned = []
    for line in lines:
        # Rename environment to given name
        if line.startswith("name:"):
            cleaned.append(f"name: {env_name}")
            continue
        if line.startswith("dependencies:"):
            cleaned.append(line)
            if python_version is not None:
                cleaned.append(f"  - python={python_version}")
            continue
        cleaned.append(line)

    # Return environment.yml as string if no save path given
    if save_path is None:
        return "\n".join(cleaned)

    # Save environment.yml to given path and return path
    path_to_reqs = os.path.join(save_path, "environment.yml")
    with open(path_to_reqs, "w") as f:
        f.write("\n".join(cleaned))
    return path_to_reqs


def get_instances(instance_path: str) -> list:
    """
    Get task instances from given path

    Args:
        instance_path (str): Path to task instances
    Returns:
        task_instances (list): List of task instances
    """
    if any([instance_path.endswith(x) for x in [".jsonl", ".jsonl.all"]]):
        task_instances = list()
        with open(instance_path) as f:
            for line in f.readlines():
                task_instances.append(json.loads(line))
        return task_instances

    with open(instance_path) as f:
        task_instances = json.load(f)
    return task_instances


def get_requirements(instance: dict, save_path: str = None):
    """
    Get requirements.txt for given task instance

    Args:
        instance (dict): task instance
        save_path (str): If provided, save requirements.txt to this path
    Returns:
        requirements.txt (str): If save_path given, returns path to saved requirements.txt.
            Otherwise, returns requirements.txt as string
    """
    import requests

    # Attempt to find requirements.txt at each path based on task instance's repo
    path_worked = False
    commit = (
        "environment_setup_commit"
        if "environment_setup_commit" in instance
        else "base_commit"
    )

    for req_path in MAP_REPO_TO_REQS_PATHS[instance["repo"]]:
        reqs_url = os.path.join(
            SWE_BENCH_URL_RAW, instance["repo"], instance[commit], req_path
        )

        reqs = requests.get(reqs_url)
        if reqs.status_code == 200:
            path_worked = True
            break
    if not path_worked:
        print(
            f"Could not find requirements.txt at paths {MAP_REPO_TO_REQS_PATHS[instance['repo']]}"
        )
        return None

    lines = reqs.text
    original_req = []
    additional_reqs = []
    req_dir = "/".join(req_path.split("/")[:-1])
    exclude_line = lambda line: any(
        [line.strip().startswith(x) for x in ["-e .", "#", ".[test"]]
    )

    for line in lines.split("\n"):
        line = line.replace("sys.platform", "sys_platform")  # Django specific?

        if line.strip().startswith("-r"):
            # Handle recursive requirements
            file_name = line[len("-r") :].strip()
            reqs_url = os.path.join(
                SWE_BENCH_URL_RAW,
                instance["repo"],
                instance[commit],
                req_dir,
                file_name,
            )
            reqs = requests.get(reqs_url)
            if reqs.status_code == 200:
                for line_extra in reqs.text.split("\n"):
                    if not exclude_line(line_extra):
                        additional_reqs.append(line_extra)
        else:
            if not exclude_line(line):
                original_req.append(line)

    # Combine all requirements into single text body
    additional_reqs.append("\n".join(original_req))
    all_reqs = "\n".join(additional_reqs)

    if save_path is None:
        return all_reqs

    path_to_reqs = os.path.join(save_path, "requirements.txt")
    with open(path_to_reqs, "w") as f:
        f.write(all_reqs)
    return path_to_reqs


def get_test_directives(instance: dict) -> list:
    """
    Get test directives from the test_patch of a task instance

    Args:
        instance (dict): task instance
    Returns:
        directives (list): List of test directives
    """
    # For seq2seq code repos, testing command is fixed
    if instance["repo"] == "swe-bench/humaneval":
        return ["test.py"]

    # Get test directives from test patch and remove non-test files
    diff_pat = r"diff --git a/.* b/(.*)"
    test_patch = instance["test_patch"]
    directives = re.findall(diff_pat, test_patch)
    directives = [
        d for d in directives if not any(d.endswith(ext) for ext in NON_TEST_EXTS)
    ]

    # For Django tests, remove extension + "tests/" prefix and convert slashes to dots (module referencing)
    if instance["repo"] == "django/django":
        directives_transformed = []
        for d in directives:
            d = d[: -len(".py")] if d.endswith(".py") else d
            d = d[len("tests/") :] if d.startswith("tests/") else d
            d = d.replace("/", ".")
            directives_transformed.append(d)
        directives = directives_transformed

    return directives


def split_instances(input_list: list, n: int) -> list:
    """
    Split a list into n approximately equal length sublists

    Args:
        input_list (list): List to split
        n (int): Number of sublists to split into
    Returns:
        result (list): List of sublists
    """
    avg_length = len(input_list) // n
    remainder = len(input_list) % n
    result, start = [], 0

    for i in range(n):
        length = avg_length + 1 if i < remainder else avg_length
        sublist = input_list[start : start + length]
        result.append(sublist)
        start += length

    return result


def find_python_by_date(target_date, date_format="%Y%m%d"):
    """
    Find python version closest to given date

    Args:
        target_date (str): Date to find python version for
        date_format (str): Format of target_date
    Returns:
        python_version (str): Python version closest to target_date
    """
    import requests

    # Make web request to versions + date page
    url = "https://www.python.org/doc/versions/"
    response = requests.get(url)

    # Look for all matches
    pattern = r"Python (.*)</a>, documentation released on (.*)\.</"
    matches = re.findall(pattern, response.text)

    # Convert NL dates to date time format
    def convert_to_yyyymmdd(input_date):
        # Parse the input date string using datetime
        date_obj = datetime.strptime(input_date, date_format)
        # Format the date object into YYYYMMDD format
        return date_obj.strftime("%Y%m%d")

    version_to_date = [(match[0], convert_to_yyyymmdd(match[1])) for match in matches]

    # Find Python
    for x in version_to_date:
        if target_date >= x[1]:
            return x[0]
    return None


class DotDict:
    """
    Wrapper class for accessing dictionary keys as attributes
    """

    def __init__(self, data):
        self.data = data

    def __getattr__(self, key):
        return self.data.get(key)


# MARK - Patch Correction
PATCH_PATTERN = re.compile(
    r"(?:diff[\w\_\.\ \/\-]+\n)?\-\-\-\s+a\/(?:.*?)\n\+\+\+\s+b\/(?:.*?)(?=diff\ |\-\-\-\ a\/|\Z)",
    re.DOTALL,
)
PATCH_FILE_PATTERN = re.compile(r"\-\-\-\s+a\/(?:.+)\n\+\+\+\s+b\/(?:.+)")
PATCH_HUNK_PATTERN = re.compile(
    r"\@\@\s+\-(\d+),(\d+)\s+\+(\d+),(\d+)\s+\@\@(.+?)(?=diff\ |\-\-\-\ a\/|\@\@\ \-|\Z)",
    re.DOTALL,
)


def get_first_idx(charlist):
    """Get index of first occurrence of "-" or "+" in charlist"""
    first_min = charlist.index("-") if "-" in charlist else len(charlist)
    first_plus = charlist.index("+") if "+" in charlist else len(charlist)
    return min(first_min, first_plus)


def get_last_idx(charlist):
    """Get index of last occurrence of "-" or "+" in charlist"""
    char_idx = get_first_idx(charlist[::-1])
    last_idx = len(charlist) - char_idx
    return last_idx + 1


def strip_content(hunk):
    """Remove trailing non +/- lines and trailing whitespace per line per hunk"""
    first_chars = list(map(lambda x: None if not len(x) else x[0], hunk.split("\n")))
    first_idx = get_first_idx(first_chars)
    last_idx = get_last_idx(first_chars)
    new_lines = list(map(lambda x: x.rstrip(), hunk.split("\n")[first_idx:last_idx]))
    new_hunk = "\n" + "\n".join(new_lines) + "\n"
    return new_hunk, first_idx - 1


def get_hunk_stats(pre_start, pre_len, post_start, post_len, hunk, total_delta):
    """Recalculate hunk start/end position and diff delta"""
    stats = {"context": 0, "added": 0, "subtracted": 0}
    hunk = hunk.split("\n", 1)[-1].strip("\n")
    for line in hunk.split("\n"):
        if line.startswith("-"):
            stats["subtracted"] += 1
        elif line.startswith("+"):
            stats["added"] += 1
        else:
            stats["context"] += 1
    context = stats["context"]
    added = stats["added"]
    subtracted = stats["subtracted"]
    pre_len = context + subtracted
    post_start = pre_start + total_delta
    post_len = context + added
    total_delta = total_delta + (post_len - pre_len)
    return pre_start, pre_len, post_start, post_len, total_delta


def extract_minimal_patch(model_patch):
    """
    Wrapper function that takes hunk and
    * Removes trailing non +/- lines and trailing whitespace per line per hunk
    * Recalculates hunk start/end position and diff delta
    * Returns new patch
    """
    model_patch = model_patch.lstrip("\n")
    new_patch = ""
    for patch in PATCH_PATTERN.findall(model_patch):
        total_delta = 0
        patch_header = PATCH_FILE_PATTERN.findall(patch)[0]
        if patch_header:
            new_patch += patch_header + "\n"
        for hunk in PATCH_HUNK_PATTERN.findall(patch):
            pre_start, pre_len, post_start, post_len, content = hunk
            pre_start, pre_len, post_start, post_len, content = list(
                map(lambda x: int(x) if x.isnumeric() else x, hunk)
            )
            content, adjust_pre_start = strip_content(content)
            pre_start += adjust_pre_start
            pre_start, pre_len, post_start, post_len, total_delta = get_hunk_stats(
                pre_start, pre_len, post_start, post_len, content, total_delta
            )
            new_patch += (
                f"@@ -{pre_start},{pre_len} +{post_start},{post_len} @@{content}"
            )
    return new_patch


def has_attribute_or_import_error(log_before):
    """
    Check to see if Attribute/Import-prefix is in log text

    Args:
        log_before (str): Validation log text before patch application
    """
    log_before = log_before.lower()

    if any([x in log_before for x in ["attribute", "import"]]):

        def get_lines_with_word(text, target_word):
            # Function to extract line(s) that contains target_word
            text, target_word = text.lower(), target_word.lower()
            lines, hits = text.split("\n")[::-1], []
            for line in lines:
                if target_word in line:
                    hits.append(line)
            return hits

        # Get line with Attribute/Import error
        lines_1 = get_lines_with_word(log_before, "attribute")
        lines_2 = get_lines_with_word(log_before, "import")
        lines_1 = " ".join(lines_1)
        lines_2 = " ".join(lines_2)

        if any([(x in lines_1 or x in lines_2) for x in ["error", "fail"]]):
            return True
    return False
