from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class SqlQueryRequest(BaseModel):
    # Define input schema for your action
    # Example:
    # text: str = Field(..., description="Input text for the action")
    query: str = Field(..., description="SQL query to be executed")
    connection_string: str = Field(..., description="Database connection string")


class SqlQueryResponse(BaseModel):
    execution_details: dict = Field(..., description="Execution details")
    response_data: str = Field(..., description="Result after executing the query")


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
        from pathlib import Path  # pylint: disable=import-outside-toplevel

        # Check if the database file exists
        if not Path(request_data.connection_string).exists():
            return {
                "execution_details": {"executed": False},
                "response_data": f"Error: Database file '{request_data.connection_string}' does not exist.",
            }

        try:
            # Use 'with' statement to manage the database connection
            with sqlite3.connect(request_data.connection_string) as connection:
                cursor = connection.cursor()

                # Execute the query
                cursor.execute(request_data.query)

                response_data = cursor.fetchall()
                connection.commit()

            # Prepare the response data
            return {
                "execution_details": {"executed": True},
                "response_data": response_data,
            }
        except sqlite3.Error as e:
            print(f"SQLite error: {str(e)}")

            return {
                "execution_details": {"executed": False},
                "response_data": f"SQLite error: {str(e)}",
            }
