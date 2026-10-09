
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = (
    BASE_DIR / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
)

PRIORITY_COLUMNS = {
    "risk_indicator",
    "task_type",
    "inspection_required",
    "complaint_type",
    "urgency",
    "follow_up_required",
    "initial_priority",
}


def quote_identifier(name):
    """Safely quote a SQLite table or column identifier."""
    return '"' + name.replace('"', '""') + '"'


def inspect_priority_inputs():
    if not DATABASE_PATH.exists():
        raise FileNotFoundError(
            f"Database not found: {DATABASE_PATH}"
        )

    connection = sqlite3.connect(
        f"{DATABASE_PATH.as_uri()}?mode=ro",
        uri=True,
    )

    try:
        cursor = connection.cursor()

        cursor.execute("""
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name;
        """)

        tables = [row[0] for row in cursor.fetchall()]
        found_columns = []

        print("=" * 65)
        print("C3 PRIORITY INPUT INSPECTION")
        print("=" * 65)
        print(f"Database: {DATABASE_PATH.name}")

        for table in tables:
            cursor.execute(
                f"PRAGMA table_info({quote_identifier(table)});"
            )
            columns = [row[1] for row in cursor.fetchall()]

            matched = [
                column for column in columns
                if column.lower() in PRIORITY_COLUMNS
            ]

            for column in matched:
                found_columns.append((table, column))

                print("\n" + "-" * 65)
                print(f"Table: {table}")
                print(f"Column: {column}")

                query = f"""
                    SELECT {quote_identifier(column)}, COUNT(*)
                    FROM {quote_identifier(table)}
                    GROUP BY {quote_identifier(column)}
                    ORDER BY COUNT(*) DESC;
                """

                cursor.execute(query)

                for value, count in cursor.fetchall():
                    print(f"  {value!r}: {count:,}")

        print("\n" + "=" * 65)
        print("INSPECTION SUMMARY")
        print("=" * 65)

        if found_columns:
            print(f"Matching columns found: {len(found_columns)}")
            for table, column in found_columns:
                print(f"- {table}.{column}")
        else:
            print("No expected priority columns found.")
            print("Check the actual database schema.")

    finally:
        connection.close()


if __name__ == "__main__":
    inspect_priority_inputs()
