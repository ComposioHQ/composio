from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class PostgresIndexRequest(BaseModel):
    connection_string: str = Field(..., description="Database connection string")
    table_name: str = Field(..., description="Name of the table to index")
    column_name: str = Field(..., description="Name of the column to create index on")
    index_name: str = Field(..., description="Name of the index to be created")


class PostgresIndexResponse(BaseModel):
    execution_details: dict = Field(..., description="Execution details")
    response_data: str = Field(..., description="Result after creating the index")


class PostgresIndex(Action):
    """
    Creates an index on a specified column in a PostgreSQL table
    """

    _display_name = "Create PostgreSQL Index"
    _request_schema = PostgresIndexRequest
    _response_schema = PostgresIndexResponse
    _tags = ["postgresql", "postgres_index"]
    _tool_name = "postgresstool"

    def execute(
        self, request_data: PostgresIndexRequest, authorisation_data: dict = {}
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
            with psycopg2.connect(request_data.connection_string) as connection:
                with connection.cursor() as cursor:
                    # Create the index
                    create_index_query = sql.SQL("CREATE INDEX {} ON {} ({})").format(
                        sql.Identifier(request_data.index_name),
                        sql.Identifier(request_data.table_name),
                        sql.Identifier(request_data.column_name),
                    )
                    cursor.execute(create_index_query)

                    # Commit the transaction
                    connection.commit()

            return {
                "execution_details": {"executed": True},
                "response_data": f"Index {request_data.index_name} created successfully on {request_data.table_name}.{request_data.column_name}",
            }
        except psycopg2.Error as e:
            print(f"PostgreSQL error: {str(e)}")

            return {
                "execution_details": {"executed": False},
                "response_data": f"PostgreSQL error: {str(e)}",
            }
