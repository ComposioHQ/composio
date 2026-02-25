Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/tools/execute-failure-no-connected-account.svg"
Output "recordings/ascii/tools/execute-failure-no-connected-account.ascii"

Hide
Type "# Execeute a tool, with no connected account associated"
Enter
Show
Type "composio tools execute GMAIL_CREATE_EMAIL_DRAFT \"
Enter
Type `  -d '{"recipient":"to@example.com","subject":"Draft","body":"Draft body"}' \`
Enter
Type "  --user-id default"
Sleep 300ms
Enter
Sleep 6s
