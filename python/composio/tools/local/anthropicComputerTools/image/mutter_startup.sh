echo "starting mutter"
XDG_SESSION_TYPE=x11 mutter --replace --sm-disable 2>/tmp/mutter_stderr.log &

# Wait for tint2 window properties to appear
timeout=30
while [ $timeout -gt 0 ]; do
    if xdotool search --class "mutter" >/dev/null 2>&1; then
        break
    fi
    sleep 1
    ((timeout--))
done

if [ $timeout -eq 0 ]; then
    echo "mutter stderr output:" >&2
    cat /tmp/mutter_stderr.log >&2
    exit 1
fi

rm /tmp/mutter_stderr.log
