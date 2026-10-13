
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = (
    BASE_DIR / "Kaduwela_C3_Research_Database_V2_SYNTHETIC.sqlite"
)

TABLES = [
    "Case_Notifications",
    "Citizen_Complaints",
    "Inspection_History",
]


def quote_identifier(name):
    return '"' + name.replace('"', '""') + '"'


def main():
    if not DATABASE_PATH.exists():
        raise FileNotFoundError(DATABASE_PATH)

    connection = sqlite3.connect(
        f"{DATABASE_PATH.as_uri()}?mode=ro",
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

            print("\n" + "=" * 65)
            print(f"TABLE: {table}")
            print("=" * 65)

            cursor.execute(
                f"PRAGMA table_info({quote_identifier(table)});"
            )
            columns = cursor.fetchall()

            print("\nColumns:")
            for column in columns:
                print(
                    f"- {column[1]} | type={column[2]} "
                    f"| primary_key={bool(column[5])}"
                )

            cursor.execute(
                f"PRAGMA foreign_key_list({quote_identifier(table)});"
            )
            foreign_keys = cursor.fetchall()

            print("\nDeclared foreign keys:")
            if foreign_keys:
                for key in foreign_keys:
                    print(
                        f"- {key[3]} -> {key[2]}.{key[4]}"
                    )
            else:
                print("- No declared foreign keys")

            cursor.execute(
                f"SELECT * FROM {quote_identifier(table)} LIMIT 3;"
            )
            rows = cursor.fetchall()
            column_names = [item[1] for item in columns]

            print("\nFirst 3 synthetic records:")
            print("Columns:", column_names)

            for row in rows:
                print(row)

    finally:
        connection.close()


if __name__ == "__main__":
    main()
