from typing import Dict
from pydantic import BaseModel, Field, field_validator
from composio.tools.base.local import LocalAction
from connection import DBRequest, DBResponse, ConnectToDB
import psycopg2
from psycopg2 import sql, ProgrammingError, DatabaseError


class TableRequest(BaseModel):
    table_name: str = Field(
        ..., 
        description="The name of the table to be created in the database",
        json_schema_extra={"file_readable": True},
    )

    @field_validator("table_name")
    def validate_table_name(cls, value):
        sanitized_name = "".join(c for c in value if c.isalnum() or c == "_")
        if not sanitized_name:
            raise ValueError("Invalid table name after sanitization.")
        return sanitized_name


class TableResponse(BaseModel):
    status: str = Field(..., description="Status of the table creation")


class CreateTable(LocalAction[TableRequest, TableResponse]):
    """
    Action to create a new table in the PostgreSQL database with a given name.
    """

    _tags = ["database", "table_creation"]

    def __init__(self, db_request: DBRequest):
        self.db_request = db_request
        self.connection_action = ConnectToDB()

    def execute(self, request: TableRequest, metadata: Dict) -> TableResponse:
        db_response = self.connection_action.execute(self.db_request, metadata)
        if db_response.status != "Connected to the database successfully.":
            return TableResponse(status=db_response.status)

        conn = psycopg2.connect(
            dbname=self.db_request.dbname,
            user=self.db_request.user,
            password=self.db_request.password,
            host=self.db_request.host,
            port=self.db_request.port,
        )
        cur = None
        try:
            cur = conn.cursor()
            processed_table_name = request.table_name

            # Basic SQL Query
            query = sql.SQL("CREATE TABLE {} (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100));").format(
                sql.Identifier(processed_table_name)
            )

            # Execute
            cur.execute(query)
            conn.commit()
            return TableResponse(status=f"Table '{processed_table_name}' created successfully.")
        except ProgrammingError as e:
            return TableResponse(status=f"SQL error: {e}")
        except DatabaseError as e:
            return TableResponse(status=f"Database error: {e}")
        except ValueError as e:
            return TableResponse(status=f"Value error: {e}")
        except Exception as e:
            return TableResponse(status=f"An unexpected error occurred: {e}")
        finally:
            if cur:
                cur.close()
            conn.close()
