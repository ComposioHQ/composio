from re import search
import typing as t
from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class FilterToolRequest(BaseModel):
    subreddit: str = Field(..., description="The subreddit to filter")
    query: t.List[str] = Field(..., description="The query to filter by")
    sort: str = Field(
        default="new", description="The sorting method can be one of: new, hot, top, relevance, or comments")
    limit: int = Field(default=10, description="The number of posts to return")
    time_filter: str = Field(
        default="all", description="The time filter can be one of: all, day, hour, month, week, or year")


class FilterToolResponse(BaseModel):
    posts: t.List[t.Dict[str, str]
                  ] = Field(..., description="The filtered posts")


class Filter(Action[FilterToolRequest, FilterToolResponse]):
    """
    Filter the posts in a subreddit by a query
    """

    _display_name = "Filter Posts"
    _request_schema = FilterToolRequest
    _response_schema = FilterToolResponse
    # _tags = ["Web"]
    _tool_name = "reddit"


    def execute(self, request_data: FilterToolRequest, authorisation_data: dict) -> dict | FilterToolResponse:
        try:
            # pylint: disable=import-outside-toplevel
            import praw
            import os
            import datetime

            # pylint: enable=import-outside-toplevel

        except ImportError as e:
            raise ImportError("Failed to import praw:", e) from e
        
        # Search parameters
        search_params = {}

        if request_data.query:
            search_params["query"] = "".join(request_data.query)
        if request_data.sort:
            search_params["sort"] = request_data.sort
        if request_data.limit:
            search_params["limit"] = request_data.limit
        if request_data.time_filter:
            search_params["time_filter"] = request_data.time_filter

        # Load the environment variables
        client_id = os.getenv("CLIENT_ID")
        if not client_id:
            self.logger.error(
                "The Reddit client ID was not found in the environment variables")
            raise ValueError(
                "The Reddit client ID was not found in the environment variables")

        client_secret = os.getenv("CLIENT_SECRET")
        if not client_secret:
            self.logger.error(
                "The Reddit client secret was not found in the environment variables")
            raise ValueError(
                "The Reddit client secret was not found in the environment variables")

        user_agent = os.getenv("USER_AGENT")
        if not user_agent:
            self.logger.error(
                "The Reddit user agent was not found in the environment variables")
            raise ValueError(
                "The Reddit user agent was not found in the environment variables")

        # Create the Reddit instance
        reddit = praw.Reddit(
            client_id=client_id, client_secret=client_secret, user_agent=user_agent)
        
        
        posts: t.List[t.Dict[str, str]] = []

        for submission in reddit.subreddit(request_data.subreddit).search(**search_params):
            post = {
                "id": submission.id,
                "title": submission.title,
                "author": submission.author.name,
                "url": submission.url,
                "created": datetime.datetime.fromtimestamp(submission.created_utc).strftime('%Y-%m-%d %H:%M:%S'),
            }

            posts.append(post)


        return FilterToolResponse(posts=posts)
