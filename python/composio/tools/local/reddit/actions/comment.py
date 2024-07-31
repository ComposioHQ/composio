from pydantic import BaseModel, Field
from composio.tools.local.base import Action


class CommentToolRequest(BaseModel):
    post_id: str = Field(..., description="The post to comment on")
    type: str = Field(default="submission", description="The type of post to comment on like submission or comment")
    message: str = Field(..., description="The comment to make")


class CommentToolResponse(BaseModel):
    success: bool = Field(..., description="Whether the comment was successful")


class Comment(Action[CommentToolRequest, CommentToolResponse]):
    """
    Comment on a post
    """

    _display_name = "Comment on Post"
    _request_schema = CommentToolRequest
    _response_schema = CommentToolResponse
    # _tags = ["Web"]
    _tool_name = "reddit"

    def execute(self, request_data: CommentToolRequest, authorisation_data: dict) -> dict | CommentToolResponse:
        try:
            # pylint: disable=import-outside-toplevel
            import praw
            import os

            # pylint: enable=import-outside-toplevel

        except ImportError as e:
            raise ImportError("Failed to import praw:", e) from e

        # Load the environment variables
        client_id = os.getenv("CLIENT_ID")
        if client_id is None:
            self.logger.error("CLIENT_ID environment variable not set")
            raise ValueError("CLIENT_ID environment variable not set")

        client_secret = os.getenv("CLIENT_SECRET")
        if client_secret is None:
            self.logger.error("CLIENT_SECRET environment variable not set")
            raise ValueError("CLIENT_SECRET environment variable not set")

        user_agent = os.getenv("USER_AGENT")
        if user_agent is None:
            self.logger.error("USER_AGENT environment variable not set")
            raise ValueError("USER_AGENT environment variable not set")

        username = os.getenv("USERNAME")
        if username is None:
            self.logger.error("USERNAME environment variable not set")
            raise ValueError("USERNAME environment variable not set")

        password = os.getenv("PASSWORD")
        if password is None:
            self.logger.error("PASSWORD environment variable not set")
            raise ValueError("PASSWORD environment variable not set")

        # Initialise the Reddit instance
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
            username=username,
            password=password
        )

        # Get the post
        if request_data.type == "submission":
            post = reddit.submission(request_data.post_id)

        elif request_data.type == "comment":
            post = reddit.comment(request_data.post_id) 
        else:
            self.logger.error("Invalid post type")
            raise ValueError("Invalid post type")

        post.reply(request_data.message)  # Comment on the post

        return CommentToolResponse(success=True)
