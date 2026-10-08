import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "Kaduwela_C3_6_Month_Synthetic_Database_CORRECTED.sqlite"


def get_connection():
    """Create a connection to the C3 SQLite database."""
    return sqlite3.connect(DATABASE_PATH)


def get_table_names(connection):
    """Return all table names in the database."""
    cursor = connection.cursor()

    cursor.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name;
    """)

    return [row[0] for row in cursor.fetchall()]


def get_table_columns(connection, table_name):
    """Return column information for a table."""
    cursor = connection.cursor()

    cursor.execute(f'PRAGMA table_info("{table_name}");')

    return cursor.fetchall()


def get_row_count(connection, table_name):
    """Return the number of records in a table."""
    cursor = connection.cursor()

    cursor.execute(f'SELECT COUNT(*) FROM "{table_name}";')

    return cursor.fetchone()[0]


def get_missing_values(connection, table_name, columns):
    """Count NULL values for each column."""
    cursor = connection.cursor()

    missing = {}

    for column in columns:
        cursor.execute(
            f'SELECT COUNT(*) FROM "{table_name}" '
            f'WHERE "{column}" IS NULL;'
        )

        missing[column] = cursor.fetchone()[0]

    return missing


def inspect_database():
    """Inspect all tables, columns, row counts and missing values."""
    connection = get_connection()

    try:
        print("=" * 70)
        print("KADUWELA C3 DATABASE INSPECTION")
        print("=" * 70)

        print(f"\nDatabase:")
        print(DATABASE_PATH)

        tables = get_table_names(connection)

        print(f"\nTotal tables: {len(tables)}")

        for table in tables:
            print("\n" + "-" * 70)
            print(f"TABLE: {table}")
            print("-" * 70)

            row_count = get_row_count(connection, table)
            print(f"Rows: {row_count:,}")

            column_info = get_table_columns(connection, table)

            column_names = []

            print("\nColumns:")

            for column in column_info:
                column_id = column[0]
                column_name = column[1]
                data_type = column[2]
                not_null = column[3]

                column_names.append(column_name)

                print(
                    f"  {column_id}. "
                    f"{column_name} "
                    f"({data_type})"
                )

            missing_values = get_missing_values(
                connection,
                table,
                column_names
            )

            print("\nMissing values:")

            for column, count in missing_values.items():
                print(f"  {column}: {count:,}")

    finally:
        connection.close()


if __name__ == "__main__":
    inspect_database()