from typing import Dict, Optional
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
import psycopg2
from psycopg2 import OperationalError

class DBRequest(BaseModel):
    dbname: str = Field(..., description="Name of the database")
    user: str = Field(..., description="Username for the database")
    password: str = Field(..., description="Password for the database")
    host: str = Field("localhost", description="Host address of the database")
    port: int = Field(5432, description="Port number for the database")  

class DBResponse(BaseModel):
    status: str = Field(..., description="Status of the database connection")

class ConnectToDB(LocalAction[DBRequest, DBResponse]):
    """
    Action to connect to the PostgreSQL database using provided credentials.
    """

    _tags = ["database", "connection"]

    def execute(self, request: DBRequest, metadata: Dict) -> DBResponse:
        try:
            conn = psycopg2.connect(
                dbname=request.dbname,
                user=request.user,
                password=request.password,
                host=request.host,
                port=request.port,
            )
            conn.close()
            return DBResponse(status="Connected to the database.")
        except OperationalError as e:
            return DBResponse(status=f"Error : {e}")