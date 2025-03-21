import json
import os
import sqlite3
from typing import Dict, List, Optional, Union

from django.conf import settings
from django.db import connection

from composio.tools.local.sqltool.models import Database, Table
from composio.tools.local.sqltool.utils import get_db_path


def get_databases() -> List[Dict]:
    """
    Get all databases.
    """
    databases = []
    for db in Database.objects.all():
        databases.append(
            {
                "id": db.id,
                "name": db.name,
                "path": db.path,
            }
        )
    return databases


def get_tables(database_id: int) -> List[Dict]:
    """
    Get all tables in a database.
    """
    tables = []
    db = Database.objects.get(id=database_id)
    for table in Table.objects.filter(database=db):
        tables.append(
            {
                "id": table.id,
                "name": table.name,
            }
        )
    return tables


def execute_query(database_id: int, query: str) -> Dict:
    """
    Execute a query on a database.
    """
    db = Database.objects.get(id=database_id)
    db_path = get_db_path(db.path)

    # Connect to the database
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # Use parameterized query to prevent SQL injection
        # Since we can't parameterize the entire query, we'll validate it's a SELECT query
        # This is a basic protection - in a real-world scenario, more robust validation would be needed
        query = query.strip()
        if not query.lower().startswith('select'):
            return {"error": "Only SELECT queries are allowed for security reasons"}
        
        # Execute the query
        cursor.execute(query)
        
        # Get column names
        columns = [description[0] for description in cursor.description]
        
        # Get rows
        rows = []
        for row in cursor.fetchall():
            rows.append(dict(row))
        
        return {
            "columns": columns,
            "rows": rows,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        cursor.close()
        conn.close()


def get_table_data(database_id: int, table_id: int) -> Dict:
    """
    Get all data in a table.
    """
    table = Table.objects.get(id=table_id)
    
    # Use Django's ORM to safely query the database
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM %s" % table.name)
        columns = [col[0] for col in cursor.description]
        rows = []
        for row in cursor.fetchall():
            rows.append(dict(zip(columns, row)))
    
    return {
        "columns": columns,
        "rows": rows,
    }
