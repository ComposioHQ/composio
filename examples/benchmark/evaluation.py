import os
import json

SUBMIT_CMD = "submit"


def evaluate_accuracy_and_check_files(base_path="submit_logs", days_back=1):
    total_commands = 0
    total_submissions = 0
    patch_files_found = 0

    # Walk through the base directory
    for root, dirs, files in os.walk(base_path):
        # Check if the directory is after the start date
        for file in files:
            history_data = json.loads(file)

            # Initialize counters
            successful_commands = 0
            total_commands = len(history_data)
            patch_generated = 0

            # Check each command
            for entry in history_data:
                command = entry['command']
                output = entry['output'][1] if len(entry['output']) > 1 else ""
                if SUBMIT_CMD in command:
                    total_submissions += 1
                    if output:
                        patch_generated += 1

    # Calculate accuracy
    accuracy = total_submissions / total_commands if total_commands > 0 else 0

    # Output results
    return {
        "accuracy": accuracy,
        "total_submissions": total_submissions,
        "total_commands": total_commands,
    }


if __name__ == "__main__":
    submit_path_dir = ""
    results = evaluate_accuracy_and_check_files(base_path=submit_path_dir)
    from pprint import pprint
    pprint(results)
