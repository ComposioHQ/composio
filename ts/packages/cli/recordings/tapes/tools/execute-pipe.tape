Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/tools/execute-pipe.svg"
Output "recordings/ascii/tools/execute-pipe.ascii"

Hide
Type "# Execute a tool, with piped input"
Enter
Show
Type `echo '{"recipient_email":"to@example.com","subject":"Hello","body":"From stdin"}' \`
Enter
Type "  | composio tools execute GMAIL_SEND_EMAIL \"
Enter
Type "    --user-id jkomyno \"
Enter
Type "  | jq"
Sleep 300ms
Enter
Sleep 6s
