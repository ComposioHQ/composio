from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class PostgresQueryRequest(BaseModel):
    query: str = Field(..., description="PostgreSQL query to be executed")
    connection_string: str = Field(..., description="Database connection string")


class PostgresQueryResponse(BaseModel):
    execution_details: dict = Field(..., description="Execution details")
    response_data: str = Field(..., description="Result after executing the query")


class PostgresQuery(Action):
    """
    Executes a PostgreSQL Query and returns the results
    """

    _display_name = "Execute a PostgreSQL query"
    _request_schema = PostgresQueryRequest
    _response_schema = PostgresQueryResponse
    _tags = ["postgresql", "postgres_query"]
    _tool_name = "postgresstool"

    def execute(
        self, request_data: PostgresQueryRequest, authorisation_data: dict = {}
    ) -> dict:
        try:
            # pylint: disable=import-outside-toplevel
            import psycopg2
            from psycopg2 import sql

            # pylint: enable=import-outside-toplevel
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                "The 'psycopg2' package is required for using the postgres tool. Please install it using 'pip install psycopg2'."
            ) from e
        try:
            # Connect to the PostgreSQL database
            with psycopg2.connect(request_data.connection_string) as connection:
                with connection.cursor() as cursor:
                    # Execute the query
                    cursor.execute(sql.SQL(request_data.query))

                    # Fetch the results
                    response_data = cursor.fetchall()

                    # Commit the transaction
                    connection.commit()

            # Prepare the response data
            return {
                "execution_details": {"executed": True},
                "response_data": response_data,
            }
        except psycopg2.Error as e:
            print(f"PostgreSQL error: {str(e)}")

            return {
                "execution_details": {"executed": False},
                "response_data": f"PostgreSQL error: {str(e)}",
            }
