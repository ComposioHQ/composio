
import argparse
from .actions import connect_db, execute_query, list_tables

def main():
    parser = argparse.ArgumentParser(description='PostgresDB Tool')
    subparsers = parser.add_subparsers(dest='command')

    # Subparser for executing a query
    query_parser = subparsers.add_parser('execute_query', help='Execute a SQL query')
    query_parser.add_argument('host', type=str, help='Database host')
    query_parser.add_argument('database', type=str, help='Database name')
    query_parser.add_argument('user', type=str, help='Database user')
    query_parser.add_argument('password', type=str, help='Database password')
    query_parser.add_argument('query', type=str, help='SQL query to execute')

    # Subparser for listing tables
    list_tables_parser = subparsers.add_parser('list_tables', help='List all tables in the database')
    list_tables_parser.add_argument('host', type=str, help='Database host')
    list_tables_parser.add_argument('database', type=str, help='Database name')
    list_tables_parser.add_argument('user', type=str, help='Database user')
    list_tables_parser.add_argument('password', type=str, help='Database password')

    args = parser.parse_args()

    if args.command in ['execute_query', 'list_tables']:
        conn = connect_db(args.host, args.database, args.user, args.password)

        if args.command == 'execute_query':
            result = execute_query(conn, args.query)
            if result:
                for row in result:
                    print(row)

        elif args.command == 'list_tables':
            tables = list_tables(conn)
            for table in tables:
                print(table[0])

if __name__ == '__main__':
    main()
