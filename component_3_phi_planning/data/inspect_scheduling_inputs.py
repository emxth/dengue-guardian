
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = (
    BASE_DIR / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
)

TABLES = [
    "PHI_Master",
    "PHI_Daily",
    "Daily_Workload",
    "Locations",
    "Case_Notifications",
    "Citizen_Complaints",
    "Inspection_History",
]


def main():
    if not DATABASE_PATH.is_file():
        raise FileNotFoundError(DATABASE_PATH)

    connection = sqlite3.connect(
        f"{DATABASE_PATH.resolve().as_uri()}?mode=ro",
        uri=True,
    )

    try:
        cursor = connection.cursor()

        print(f"Database: {DATABASE_PATH.name}")

        for table in TABLES:
            cursor.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name = ?;
                """,
                (table,),
            )

            if cursor.fetchone() is None:
                print(f"\nTable not found: {table}")
                continue

            cursor.execute(f'PRAGMA table_info("{table}");')
            columns = cursor.fetchall()

            print("\n" + "=" * 60)
            print(f"TABLE: {table}")
            print("=" * 60)
            print("Columns:", [column[1] for column in columns])

            cursor.execute(f'SELECT COUNT(*) FROM "{table}";')
            print("Total records:", cursor.fetchone()[0])

            # Show a small sample to identify scheduling fields.
            cursor.execute(f'SELECT * FROM "{table}" LIMIT 3;')
            for row in cursor.fetchall():
                print(row)

    finally:
        connection.close()


if __name__ == "__main__":
    main()
