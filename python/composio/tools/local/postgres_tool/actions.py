
import psycopg2

def connect_db(host, database, user, password):
    """Establish a connection to the Postgres database."""
    return psycopg2.connect(host=host, database=database, user=user, password=password)

def execute_query(conn, query):
    """Execute a query on the Postgres database."""
    with conn.cursor() as cur:
        cur.execute(query)
        if query.strip().upper().startswith('SELECT'):
            return cur.fetchall()
        conn.commit()

def list_tables(conn):
    """List all tables in the Postgres database."""
    query = "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    return execute_query(conn, query)
