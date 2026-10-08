import argparse
import sqlite3
from pathlib import Path

import pandas as pd


DEFAULT_DATABASE_PATH = (
    Path(__file__).resolve().parent
    / "Kaduwela_C3_6_Month_Synthetic_Database_CORRECTED.sqlite"
)


def get_connection(database_path):
    """Create a read-only connection to the selected SQLite database."""
    return sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)


def load_table(connection, table_name):
    """Load a database table into a pandas DataFrame."""
    query = f'SELECT * FROM "{table_name}"'
    return pd.read_sql_query(query, connection)


def clean_text_columns(dataframe):
    """Remove unnecessary whitespace from text fields."""
    dataframe = dataframe.copy()

    for column in dataframe.select_dtypes(include="object").columns:
        dataframe[column] = dataframe[column].apply(
            lambda value: value.strip() if isinstance(value, str) else value
        )

    return dataframe


def prepare_case_notifications(dataframe):
    """
    Prepare case-notification records for C3 planning.

    This stage cleans data only. It does not calculate the final
    C3 priority score or assign a PHI.
    """
    dataframe = clean_text_columns(dataframe)

    dataframe["notification_date"] = pd.to_datetime(
        dataframe["notification_date"],
        errors="coerce"
    )

    dataframe["notification_time"] = pd.to_datetime(
        dataframe["notification_time"],
        format="%H:%M",
        errors="coerce"
    ).dt.time

    dataframe["risk_indicator"] = pd.to_numeric(
        dataframe["risk_indicator"],
        errors="coerce"
    )

    dataframe["inspection_required"] = (
        dataframe["inspection_required"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    return dataframe


def prepare_complaints(dataframe):
    """Prepare citizen complaint records for C3 planning."""
    dataframe = clean_text_columns(dataframe)

    dataframe["received_date"] = pd.to_datetime(
        dataframe["received_date"],
        errors="coerce"
    )

    dataframe["received_time"] = pd.to_datetime(
        dataframe["received_time"],
        format="%H:%M",
        errors="coerce"
    ).dt.time

    return dataframe


def prepare_phi_daily(dataframe):
    """Prepare daily PHI availability and capacity information."""
    dataframe = clean_text_columns(dataframe)

    dataframe["date"] = pd.to_datetime(
        dataframe["date"],
        errors="coerce"
    )

    dataframe["daily_capacity"] = pd.to_numeric(
        dataframe["daily_capacity"],
        errors="coerce"
    )

    dataframe["existing_workload"] = pd.to_numeric(
        dataframe["existing_workload"],
        errors="coerce"
    )

    return dataframe


def prepare_inspection_history(dataframe):
    """Prepare historical inspection records for later analysis."""
    dataframe = clean_text_columns(dataframe)

    dataframe["inspection_date"] = pd.to_datetime(
        dataframe["inspection_date"],
        errors="coerce"
    )

    dataframe["duration_min"] = pd.to_numeric(
        dataframe["duration_min"],
        errors="coerce"
    )

    return dataframe


def prepare_locations(dataframe):
    """Prepare geographic reference data for future GIS and routing."""
    dataframe = clean_text_columns(dataframe)

    dataframe["latitude"] = pd.to_numeric(
        dataframe["latitude"],
        errors="coerce"
    )

    dataframe["longitude"] = pd.to_numeric(
        dataframe["longitude"],
        errors="coerce"
    )

    return dataframe


def prepare_phi_master(dataframe):
    """Prepare PHI master/reference information."""
    dataframe = clean_text_columns(dataframe)

    dataframe["nominal_daily_capacity"] = pd.to_numeric(
        dataframe["nominal_daily_capacity"],
        errors="coerce"
    )

    return dataframe


def validate_dataframe(dataframe, name, required_columns):
    """
    Validate that the prepared DataFrame contains required fields
    and report missing values.
    """
    missing_columns = [
        column
        for column in required_columns
        if column not in dataframe.columns
    ]

    missing_values = dataframe[required_columns].isna().sum().sum()

    print(f"\n{name}")
    print("-" * 50)
    print(f"Rows: {len(dataframe):,}")
    print(f"Missing required columns: {missing_columns}")
    print(f"Missing values in required columns: {missing_values:,}")


def preprocess_database(database_path):
    """
    Load and preprocess the C3 data without modifying the source database.

    The returned DataFrames form a standard internal data layer that can
    later receive data from another authorized source or shared database.
    """
    connection = get_connection(database_path)

    try:
        # Load source tables.
        phi_master_raw = load_table(connection, "PHI_Master")
        phi_daily_raw = load_table(connection, "PHI_Daily")
        locations_raw = load_table(connection, "Locations")
        cases_raw = load_table(connection, "Case_Notifications")
        complaints_raw = load_table(connection, "Citizen_Complaints")
        inspections_raw = load_table(connection, "Inspection_History")

    finally:
        connection.close()

    # Prepare each dataset independently.
    phi_master = prepare_phi_master(phi_master_raw)
    phi_daily = prepare_phi_daily(phi_daily_raw)
    locations = prepare_locations(locations_raw)
    cases = prepare_case_notifications(cases_raw)
    complaints = prepare_complaints(complaints_raw)
    inspections = prepare_inspection_history(inspections_raw)

    return {
        "phi_master": phi_master,
        "phi_daily": phi_daily,
        "locations": locations,
        "cases": cases,
        "complaints": complaints,
        "inspections": inspections,
    }


def print_preprocessing_summary(prepared_data, database_path):
    """Display a concise summary of the prepared C3 datasets."""

    print("=" * 70)
    print("C3 DATA PREPROCESSING")
    print("=" * 70)

    print(f"\nSource database:")
    print(database_path)

    print("\nPrepared datasets:")

    for name, dataframe in prepared_data.items():
        print(f"  {name:<20} {len(dataframe):>6,} rows")

    validate_dataframe(
        prepared_data["phi_master"],
        "PHI Master",
        ["phi_id", "phi_range", "nominal_daily_capacity"]
    )

    validate_dataframe(
        prepared_data["phi_daily"],
        "PHI Daily",
        ["date", "phi_id", "availability", "daily_capacity"]
    )

    validate_dataframe(
        prepared_data["locations"],
        "Locations",
        ["location_id", "latitude", "longitude"]
    )

    validate_dataframe(
        prepared_data["cases"],
        "Case Notifications",
        ["task_id", "notification_date", "location_id", "risk_indicator"]
    )

    validate_dataframe(
        prepared_data["complaints"],
        "Citizen Complaints",
        ["complaint_id", "received_date", "location_id", "urgency"]
    )

    validate_dataframe(
        prepared_data["inspections"],
        "Inspection History",
        ["inspection_id", "task_id", "phi_id", "duration_min"]
    )

    print("\n" + "=" * 70)
    print("Preprocessing completed successfully.")
    print("Source SQLite database was not modified.")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description="Preprocess Component 3 PHI planning data."
    )

    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DATABASE_PATH,
        help="Path to the SQLite database."
    )

    args = parser.parse_args()

    database_path = args.db.resolve()

    if not database_path.exists():
        raise FileNotFoundError(
            f"Database not found: {database_path}"
        )

    prepared_data = preprocess_database(database_path)

    print_preprocessing_summary(
        prepared_data,
        database_path
    )


if __name__ == "__main__":
    main()