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
    user_id = ""

    # retrieve the auth config id from your app
    auth_config_id = ""

    # initiate the connection request
    connection_request = composio.connected_accounts.initiate(
        user_id=user_id,
        auth_config_id=auth_config_id,
    )
    return RedirectResponse(url=connection_request.redirect_url)
