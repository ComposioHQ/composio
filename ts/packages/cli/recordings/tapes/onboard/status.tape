Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/onboard/status.svg"
Output "recordings/ascii/onboard/status.ascii"

Hide
Type "# Report onboarding progress without taking action"
Enter
Show
Type "composio onboard --status"
Sleep 300ms
Enter
Sleep 6s
