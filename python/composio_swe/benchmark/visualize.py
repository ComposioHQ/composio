import argparse
import glob
import json


def extract_details(agent_logs):
    data = []
    for log in agent_logs:
        tool_name_or_agent_action = ""
        tool_input = ""
        tool_output_or_agent_output = ""
        agent_thought = ""
        if log["agent_action"] in ["agent_finish", "final_patch"]:
            tool_name_or_agent_action = "agent_finish"
            tool_output_or_agent_output = log["agent_output"]
        else:
            agent_action = json.loads(log["agent_action"])
            tool_name_or_agent_action = agent_action.get("tool", "N/A")
            tool_input = agent_action.get("tool_input", "N/A")
            tool_output_or_agent_output = log.get("tool_output", "N/A")
            agent_thought = agent_action.get("log", "No thoughts recorded")

        data.append(
            {
                "tool_name": tool_name_or_agent_action,
                "tool_input": tool_input,
                "tool_output": tool_output_or_agent_output,
                "agent_thought": agent_thought,
            }
        )
    return data


def generate_html_1(issues_data, output_file):
    html_content = """
    <html>
    <head>
        <title>Agent Action Report by Issue</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #dddddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
        </style>
    </head>
    <body>
        <h1>Agent Action Report by Issue</h1>
    """
    for issue, data in issues_data.items():
        html_content += f"<h2>{issue}</h2>"
        html_content += """
        <table>
            <tr>
                <th>Tool Name</th>
                <th>Tool Input</th>
                <th>Tool Output</th>
                <th>Agent Thought</th>
            </tr>
        """
        for entry in data:
            html_content += f"""
                <tr>
                    <td>{entry['tool_name']}</td>
                    <td>{entry['tool_input']}</td>
                    <td>{entry['tool_output']}</td>
                    <td>{entry['agent_thought']}</td>
                </tr>
            """
        html_content += "</table>"
    html_content += """
    </body>
    </html>
    """

    with open(output_file, "w", encoding="utf-8") as file:
        file.write(html_content)
    print(f"HTML report generated: {output_file}")


def format_thought(thought):
    # print(thought)
    # Initial setup for default values if any of the parts are missing
    action = "No action specified"
    action_input = "No input provided"
    thought_text = "No thoughts recorded"

    # Extracting "Action"
    if "Action: " in thought:
        action_start = thought.find("Action:") + len("Action:")
        action_end = thought.find("Action Input:")
        action = thought[action_start:action_end].strip()

    # Extracting "Action Input"
    if "Action Input: " in thought:
        input_start = thought.find("Action Input:") + len("Action Input:")
        # input_end = thought.find("Thought:")
        action_input = thought[input_start:].strip()

    # Extracting "Thought"
    if "Thought: " in thought:
        thought_start = thought.find("Thought:") + len("Thought:")
        thought_end = thought.find("Action: ")
        thought_text = thought[thought_start:thought_end].strip()

    return f'<div class="action">Action: {action}</div><div class="action-input">Action Input: {action_input}</div><div class="thought">Thought: {thought_text}</div>'


def generate_html(issues_data, output_file):
    html_content = """
    <html>
    <head>
        <title>Agent Action Report by Issue</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #dddddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .collapsible { cursor: pointer; color: blue; text-decoration: underline; }
            .content { display: none; padding: 4px; }
            .action { font-weight: bold; color: green; }
            .action-input { font-weight: bold; color: darkorange; }
            .thought { color: darkblue; }
        </style>
        <script>
            function toggleVisibility(id) {
                var x = document.getElementById(id);
                if (x.style.display === "none") {
                    x.style.display = "block";
                } else {
                    x.style.display = "none";
                }
            }
        </script>
    </head>
    <body>
        <h1>Agent Action Report by Issue</h1>
    """
    for issue_idx, (issue, data) in enumerate(issues_data.items()):
        html_content += f"<h2>{issue}</h2><table><tr><th>Tool Name</th><th>Tool Input</th><th>Tool Output</th><th>Agent Thought</th></tr>"
        for entry_idx, entry in enumerate(data):
            content_id = f"content-{issue_idx}-{entry_idx}"
            short_output = (
                (entry["tool_output"][:75] + "...")
                if len(entry["tool_output"]) > 78
                else entry["tool_output"]
            )
            formatted_thought = format_thought(entry["agent_thought"])
            html_content += (
                f'<tr><td>{entry["tool_name"]}</td><td>{entry["tool_input"]}</td>'
                f'<td><span class="collapsible" onclick="toggleVisibility(\'{content_id}\')">{short_output}</span>'
                f'<div id="{content_id}" class="content">{entry["tool_output"]}</div></td><td>{formatted_thought}</td></tr>'
            )
        html_content += "</table>"
    html_content += "</body></html>"

    with open(output_file, "w", encoding="utf-8") as file:
        file.write(html_content)
    print(f"HTML report generated: {output_file}")


def load_logs(directory_path):
    all_issues = {}
    for file_path in glob.glob(
        f"{directory_path}/agent_logs.json*"
    ):  # Adjust the pattern as needed
        with open(file_path, "r", encoding="utf-8") as file:
            issue_log = json.load(file)
            all_issues.update(issue_log)  # Load and combine logs from each file
    return all_issues


def main(log_dir, output_html_file):
    issues = load_logs(log_dir)
    issues_data = {issue: extract_details(logs) for issue, logs in issues.items()}
    generate_html(issues_data, output_html_file)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--log_dir", type=str, required=True, help="Directory path for the logs"
    )
    parser.add_argument(
        "--output_html_file",
        type=str,
        default="agent_action_report_by_issue.html",
        help="Desired output HTML file",
    )
    args = parser.parse_args()
    main(args.log_dir, args.output_html_file)
