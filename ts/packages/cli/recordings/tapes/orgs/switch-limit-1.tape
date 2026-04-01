Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/orgs/switch-limit-1.svg"
Output "recordings/ascii/orgs/switch-limit-1.ascii"

Hide
Type "# Show a truncated org list with --limit"
Enter
Show
Type "bun ./scripts/run-mock-orgs-switch-demo.ts"
Sleep 300ms
Enter
Sleep 6s
