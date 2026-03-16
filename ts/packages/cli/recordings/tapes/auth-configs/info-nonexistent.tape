Set Height 750
Source "recordings/tapes/shared-config.tape"
Output "recordings/svgs/auth-configs/info-nonexistent.svg"
Output "recordings/ascii/auth-configs/info-nonexistent.ascii"

Hide
Type "# Info with nonexistent ID"
Enter
Show
Type "composio auth-configs info nonexistent_id"
Sleep 300ms
Enter
Sleep 6s
