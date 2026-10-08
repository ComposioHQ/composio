import os

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from composio import Composio

# Create a FastAPI app
app = FastAPI()

# Create a Composio client
composio = Composio()


@app.get("/authorize/{toolkit}")
def authorize_app(toolkit: str):
    # retrieve the user id from your app
    user_id = os.environ.get("COMPOSIO_EXAMPLES_USER_ID", "")

    # retrieve the auth config id from your app
    auth_config_id = os.environ.get("COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID", "")

    # initiate the connection request
    connection_request = composio.connected_accounts.initiate(
        user_id=user_id,
        auth_config_id=auth_config_id,
    )
    return RedirectResponse(url=connection_request.redirect_url)  # type: ignore


if __name__ == "__main__":
    import uvicorn

    for var in ("COMPOSIO_EXAMPLES_USER_ID", "COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID"):
        if not os.environ.get(var):
            raise SystemExit(f"{var} is required")

    # Fail fast on bad credentials or a stale auth config before serving requests
    composio.auth_configs.get(os.environ["COMPOSIO_EXAMPLES_GMAIL_AUTH_CONFIG_ID"])

    uvicorn.run(app, host="127.0.0.1", port=8000)
