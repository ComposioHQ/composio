Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/onboard/json.svg"
Output "recordings/ascii/onboard/json.ascii"

Hide
Type "# Emit the agent-facing onboarding state document"
Enter
Show
Type "composio onboard --status --json"
Sleep 300ms
Enter
Sleep 6s
