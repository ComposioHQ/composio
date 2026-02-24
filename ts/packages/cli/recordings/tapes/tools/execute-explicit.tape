Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/tools/execute-explicit.svg"
Output "recordings/ascii/tools/execute-explicit.ascii"

Hide
Type "# Execute a tool, with explicit user ID and toolkit version"
Enter
Show
Type "composio tools execute GMAIL_CREATE_EMAIL_DRAFT \"
Enter
Type `  -d '{"recipient_email":"to@example.com","subject":"Draft","body":"Draft body"}' \`
Enter
Type "  --user-id jkomyno \"
Enter
Type "  --toolkit-version 20250909_00"
Sleep 300ms
Enter
Sleep 6s
