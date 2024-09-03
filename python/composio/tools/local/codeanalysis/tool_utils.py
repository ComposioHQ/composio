import hashlib
import os
import sys
import time
from functools import wraps
from typing import Optional


def is_test_file(file_path: str) -> bool:
    """
    Determines whether a file is a test-related file or not.

    Args:
        file_path (str): The path of the file to be checked.

    Returns:
        bool: True if the file is a test-related file, False otherwise.

    Criteria to decide whether a file is a test-related file or not:
    - If the file name contains "_test" or "test_".
    - If the file path contains the directory "tests/".

    Reference: https://docs.pytest.org/en/7.1.x/explanation/goodpractices.html#test-discovery
    """
    file_path_name = os.path.basename(file_path)
    if "_test" in file_path_name:
        return True
    if "test_" in file_path_name:
        return True
    if "tests/" in file_path:
        return True
    return False


def find_python_files(
    directory: str,
    filter_test_files: bool = True,
    filter_out_unreadable_files: bool = True,
) -> list:
    """
    Fetch all python files in the given directory.

    Args:
        directory (str): The directory to search for python files.
        filter_test_files (bool, optional): Whether to filter out test files. Defaults to True.
        filter_out_unreadable_files (bool, optional): Whether to filter out unreadable files. Defaults to True.

    Returns:
        list: A list of absolute paths to the python files found.
    """
    directory = os.path.normpath(os.path.abspath(directory))
    python_files = [
        os.path.normpath(os.path.abspath(os.path.join(root, file)))
        for root, _, files in os.walk(directory)
        for file in files
        if file.endswith(".py")
    ]
    print(f"[ToolObj] Total number of python files found: {len(python_files)}")

    if filter_test_files:
        python_files = [
            file
            for file in python_files
            if not is_test_file(file.replace(directory, ""))
        ]
        print(
            f"[ToolObj] Total number of python files after filtering out test files: {len(python_files)}"
        )

    if filter_out_unreadable_files:
        readable_files = []
        for file in python_files:
            try:
                with open(file, "r", encoding="utf-8") as f:
                    f.read()
                readable_files.append(file)
            except Exception:
                pass
        python_files = readable_files
        print(
            f"Total number of python files found (after removing test-files + unreadable files): {len(python_files)}"
        )

    return python_files


def get_virtual_env_name() -> Optional[str]:
    """
    Infers the name of the virtual environment from the path to the Python executable.

    Returns:
        Optional[str]: The name of the virtual environment, or None if not in a virtual environment.
    """
    executable_path = sys.executable
    path_parts = executable_path.split(os.sep)

    try:
        # Look for a directory name typically associated with a virtual environment
        env_index = path_parts.index("bin") - 1
        return path_parts[env_index]
    except ValueError:
        # If "bin" is not found in the path, we're likely not in a virtual environment
        return None


def fetch_hash(message) -> str:
    """
    Calculates the SHA256 hash of the given message.

    Args:
        message (str): The message to calculate the hash for.

    Returns:
        str: The hexadecimal representation of the SHA256 hash.
    """
    encoded_message = message.encode()

    hash_object = hashlib.sha256()
    hash_object.update(encoded_message)

    hex_dig = hash_object.hexdigest()
    return hex_dig


def retry_handler(max_attempts=3, delay=1):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            attempts = 0
            while attempts < max_attempts:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    attempts += 1
                    if attempts == max_attempts:
                        raise RuntimeError(
                            f"Failed after {max_attempts} attempts: {e}"
                        ) from e
                    time.sleep(delay)
            raise RuntimeError(f"Failed after {max_attempts} attempts")

        return wrapper

    return decorator
