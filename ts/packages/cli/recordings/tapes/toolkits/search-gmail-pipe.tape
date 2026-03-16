Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/toolkits/search-gmail-pipe.svg"
Output "recordings/ascii/toolkits/search-gmail-pipe.ascii"

Hide
Type "# Pipe output to JSON"
Enter
Show
Type "composio toolkits search gmail | jq 'first'"
Sleep 300ms
Enter
Sleep 6s
