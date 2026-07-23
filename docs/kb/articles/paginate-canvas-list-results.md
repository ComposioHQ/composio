Paginate Canvas list results instead of assuming one response is complete: use `page` and `per_page` only when the selected current action exposes those fields.

## Use the action's current schema

`CANVAS_FETCH_DATA` currently supports `page` and `per_page`, with a default and maximum `per_page` of 100. Other list or fetch actions can expose different pagination fields, defaults, or no pagination at all.

## Fetch the complete result

1. Inspect the selected action in the [Canvas toolkit](/toolkits/canvas).
2. Request a supported `per_page`, then advance the supported page value.
3. Continue until the returned pagination signal ends.

Do not add `per_page` to an action that does not advertise it, and do not assume all Canvas actions share one default. Canvas describes its response navigation in the [pagination guide](https://canvas.instructure.com/doc/api/file.pagination.html).
