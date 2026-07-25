If `REDDIT_CREATE_REDDIT_POST` fails on tool version `00000000_00`, check whether the request is missing `flair_id`. That version requires it. Current Reddit tool versions do not.

## Fix it

Move to a current toolkit version, or supply `flair_id` if you are pinned to the old one. Use `REDDIT_LIST_SUBREDDIT_POST_FLAIRS` to look up the valid flair IDs for the target subreddit.

Pin a specific current toolkit version rather than tracking whatever is newest. Pinning is what keeps a provider-side or toolkit-side change from altering the shape of a request your code already sends.
