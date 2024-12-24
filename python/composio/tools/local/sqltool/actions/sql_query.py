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
    Executes a SQL Query and returns the results for both local SQLite and remote databases
    """

    _tags = ["sql", "sql_query"]

    def _is_sqlite_connection(self, connection_string: str) -> bool:
        """Determine if the connection string is for a SQLite database"""
        return (
            connection_string.endswith(".db")
            or connection_string.endswith(".sqlite")
            or connection_string.endswith(".sqlite3")
            or connection_string.startswith("sqlite:///")
        )

    def execute(self, request: SqlQueryRequest, metadata: Dict) -> SqlQueryResponse:
        """Execute SQL query for either SQLite or remote databases"""
        import sqlalchemy.exc  # pylint: disable=import-outside-toplevel

        try:
            if self._is_sqlite_connection(request.connection_string):
                return self._execute_sqlite(request)

            return self._execute_remote(request)
        except sqlite3.Error as e:
            raise ValueError(f"SQLite database error: {str(e)}") from e
        except sqlalchemy.exc.SQLAlchemyError as e:
            raise ValueError(f"Database connection error: {str(e)}") from e
        except Exception as e:
            raise ValueError(f"Unexpected error: {str(e)}") from e

    def _execute_sqlite(self, request: SqlQueryRequest) -> SqlQueryResponse:
        """Execute query for SQLite database"""
        db_path = request.connection_string.replace("sqlite:///", "")
        if not Path(db_path).exists():
            raise ValueError(f"Error: Database file '{db_path}' does not exist.")
        with sqlite3.connect(db_path) as connection:
            cursor = connection.cursor()
            cursor.execute(request.query)
            response_data = [list(row) for row in cursor.fetchall()]
            connection.commit()
        return SqlQueryResponse(
            execution_details={"executed": True, "type": "sqlite"},
            response_data=response_data,
        )

    def _execute_remote(self, request: SqlQueryRequest) -> SqlQueryResponse:
        """Execute query for remote databases"""
        import sqlalchemy  # pylint: disable=import-outside-toplevel

        engine = sqlalchemy.create_engine(
            request.connection_string,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=3600,
            connect_args={"connect_timeout": 10},
        )
        with engine.connect() as connection:
            result = connection.execute(sqlalchemy.text(request.query), {})
            response_data = [list(row) for row in result.fetchall()]
        return SqlQueryResponse(
            execution_details={"executed": True, "type": "remote"},
            response_data=response_data,
        )
