Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/onboard/status.svg"
Output "recordings/ascii/onboard/status.ascii"

Hide
Type "# Report where onboarding stands without advancing a gate"
Enter
Show
Type "composio onboard --status"
Sleep 300ms
Enter
Sleep 8s
