from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class SqlQueryRequest(BaseModel):
    # Define input schema for your action
    # Example:
    # text: str = Field(..., description="Input text for the action")
    query: str = Field(..., description="SQL query to be executed")
    connection_string: str = Field(..., description="Database connection string")


class SqlQueryResponse(BaseModel):
    # Define output schema for your action
    # Example:
    # result: str = Field(..., description="Result of the action")
    result: str = Field(..., description="Result after executing the query")


class SqlQuery(Action):
    """
    Executes a SQL Query and returns the results
    """

    _display_name = "Execute a query"
    _request_schema = SqlQueryRequest
    _response_schema = SqlQueryResponse
    _tags = ["sql", "sql_query"]  # Optional tags to categorize your action
    _tool_name = "sqltool"  # Tool name, same as directory name

    def execute(
        self, request_data: SqlQueryRequest, authorisation_data: dict = {}
    ) -> dict:
        # Implement logic to process input and return output
        # Example:
        # response_data = {"result": "Processed text: " + request_data.text}
        # Implement logic to process input and return output
        import sqlite3  # pylint: disable=import-outside-toplevel

        # Connect to the database
        connection = sqlite3.connect(request_data.connection_string)
        cursor = connection.cursor()

        # Execute the query
        cursor.execute(request_data.query)

        response_data = cursor.fetchall()
        connection.commit()
        # Close the connection
        connection.close()

        # Prepare the response data
        return {"execution_details": {"executed": True}, "response_data": response_data}
