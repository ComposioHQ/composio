## Gong base URL differs by user and should be provided at connection time

Gong's base URL can differ per user/user. Avoid hardcoding a single Gong base URL in a shared auth config for all users; collect and pass the user's `gong_url`/base URL when initiating the connected account.

## Gong connection initiation can use Basic auth fields: access key, access key secret, and Gong URL

For Gong Basic auth, collect the access key as username, access key secret as password, and the user's Gong URL/base URL. Pass those fields when initiating the connected account; hosted auth can also collect required fields for the user instead of manually building the frontend form.
