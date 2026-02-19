Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/auth-configs/list-toolkits-gmail.svg"
Output "recordings/ascii/auth-configs/list-toolkits-gmail.ascii"

Hide
Type "# List filtered by toolkit"
Enter
Show
Type "composio auth-configs list --toolkits gmail"
Sleep 300ms
Enter
Sleep 6s
