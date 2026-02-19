Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/connected-accounts/list-limit-1.svg"
Output "recordings/ascii/connected-accounts/list-limit-1.ascii"

Hide
Type "# List with --limit flag"
Enter
Show
Type "composio connected-accounts list --limit 1"
Sleep 300ms
Enter
Sleep 6s
