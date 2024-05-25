import subprocess

from composio.sdk.local_tools.local_workspace.commons.utils import communicate


def _print(container_process: subprocess.Popen, container_obj, parent_pids):
    """
    Prints details from the file opened in the environment, including cursor positions
    and a range of lines centered around a specified current line.
    """

    def my_communicate(in_cmd):
        return communicate(container_process, container_obj, in_cmd, parent_pids)
    cursor_warning = my_communicate("bash -c '_constrain_cursors'")
    cursor_values = my_communicate("echo '{}' | tail -n 1".format(cursor_warning))
    cursor_warning = my_communicate("echo '{}' | head -n -1".format(cursor_warning))

    # Extract START and END cursors from output
    start_cursor, end_cursor = cursor_values.strip().split()
    my_communicate(f"export START_CURSOR={start_cursor}")
    my_communicate(f"export END_CURSOR={end_cursor}")

    output, return_code = my_communicate("awk 'END {{print NR}}' $CURRENT_FILE")
    total_lines = int(output)
    current_file_path = my_communicate("realpath $CURRENT_FILE")

    print(f"[File: {current_file_path} ({total_lines} lines total)]")

    current_line = int(os.getenv('CURRENT_LINE', 1))
    window_size = int(os.getenv('WINDOW', 10))  # Default window size

    start_line = max(current_line - window_size // 2, 1)
    end_line = min(current_line + window_size // 2, total_lines)

    # Get lines from start_line to end_line
    lines = communicate(f"awk 'NR>={start_line} && NR<={end_line} {{print}}' $CURRENT_FILE").split('\n')

    # Printing lines with cursor marks
    for i, line in enumerate(lines, start=start_line):
        if i == int(start_cursor):
            print(">", end="")  # START_CURSOR_MARK
        if i == int(end_cursor):
            print("<", end="")  # END_CURSOR_MARK
        print(f"{i}:{line}")

    lines_below = max(total_lines - end_line, 0)
    if lines_below > 0:
        print(f"({lines_below} more lines below)")

    if cursor_warning.strip():
        print(cursor_warning)


# Usage
try:
    _print()
except Exception as e:
    print(e)
