import sqlite3
from pathlib import Path
from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class SqlQueryRequest(BaseModel):
    query: str = Field(
        ...,
        description="SQL query to be executed",
    )
    connection_string: str = Field(
        ...,
        description="Database connection string",
    )


class SqlQueryResponse(BaseModel):
    execution_details: dict = Field(..., description="Execution details")
    response_data: list = Field(..., description="Result after executing the query")


class SqlQuery(LocalAction[SqlQueryRequest, SqlQueryResponse]):
    """
    Executes a SQL Query and returns the results
    """

    _tags = ["sql", "sql_query"]

    def execute(self, request: SqlQueryRequest, metadata: Dict) -> SqlQueryResponse:
        """Execute SQL query"""
        # Implement logic to process input and return output
        # Example:
        # response_data = {"result": "Processed text: " + request.text}
        # Implement logic to process input and return output

        # Check if the database file exists
        if not Path(request.connection_string).exists():
            raise ValueError(
                f"Error: Database file '{request.connection_string}' does not exist."
            )

        try:
            # Use 'with' statement to manage the database connection
            with sqlite3.connect(request.connection_string) as connection:
                cursor = connection.cursor()
                cursor.execute(request.query)
                response_data = cursor.fetchall()
                connection.commit()

            # Prepare the response data
            return SqlQueryResponse(
                execution_details={"executed": True},
                response_data=response_data,
            )

        except sqlite3.Error as e:
            raise ValueError(f"SQLite error: {str(e)}") from e
