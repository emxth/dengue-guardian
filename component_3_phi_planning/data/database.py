import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"


def get_connection():
    """Create a connection to the C3 SQLite database."""
    return sqlite3.connect(DATABASE_PATH)


def get_table_names():
    """Return all table names in the database."""
    connection = get_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name;
            """
        )
        return [row[0] for row in cursor.fetchall()]
    finally:
        connection.close()


if __name__ == "__main__":
    print("C3 Database:", DATABASE_PATH)
    print("\nAvailable tables:")
    for table in get_table_names():
        print(f"- {table}")
