import os
import json
from datetime import datetime, timedelta


def evaluate_accuracy_and_check_files(base_path="submit_logs", days_back=1):
    # Calculate the starting point for checking directories
    start_date = datetime.now() - timedelta(days=days_back)
    start_folder = start_date.strftime("%Y-%m-%d_%H-%M-%S")

    successful_submissions = 0
    total_submissions = 0
    patch_files_found = 0

    # Walk through the base directory
    for root, dirs, files in os.walk(base_path):
        # Check if the directory is after the start date
        dir_name = os.path.basename(root)
        if dir_name >= start_folder:
            for file in files:
                if file.endswith('.json'):
                    file_path = os.path.join(root, file)
                    with open(file_path, 'r') as f:
                        data = json.load(f)
                        # Assuming that success is defined by some condition in the output
                        if "success" in data["output"]:
                            successful_submissions += 1
                        total_submissions += 1
                        # Check for patch files in the same directory
                        patch_files = [f for f in os.listdir(root) if f.endswith('.patch')]
                        patch_files_found += len(patch_files)

    # Calculate accuracy
    accuracy = successful_submissions / total_submissions if total_submissions > 0 else 0

    # Output results
    return {
        "accuracy": accuracy,
        "total_submissions": total_submissions,
        "successful_submissions": successful_submissions,
        "patch_files_found": patch_files_found
    }


if __name__ == "__main__":
    results = evaluate_accuracy_and_check_files()
    print("Evaluation Results:")
    print(f"Accuracy: {results['accuracy']:.2f}")
    print(f"Total Submissions: {results['total_submissions']}")
    print(f"Successful Submissions: {results['successful_submissions']}")
    print(f"Patch Files Found: {results['patch_files_found']}")
