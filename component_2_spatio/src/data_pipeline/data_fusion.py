import os

import pandas as pd

# Path Setup
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


def fuse_datasets():
    print("--- Multi-Source Data Fusion ---")

    # 1. Load Clinical Case Data (from the Component 3 Database)
    excel_path = os.path.join(
        BASE_DIR, "data", "kaduwela_c3_6_month_synthetic_data.xlsx"
    )

    try:
        cases_df = pd.read_excel(excel_path, sheet_name="Case_Notifications")
    except FileNotFoundError:
        print(
            f"[ERROR] Could not find {excel_path}. Please place the file in the data/ folder."
        )
        return

    # Standardize Component 3 PHI Ranges to match the STGNN Ward graph
    ward_mapping = {
        "Malabe Range": "Malabe",
        "Battaramulla Range": "Battaramulla",
        "Kaduwela Town Range": "Kaduwela_Town",
        "Athurugiriya Range": "Athurugiriya",
        "Nawagamuwa / Ranala Range": "Koswatta",  # Mapped to our existing spatial graph
    }
    cases_df["Ward_Name"] = cases_df["phi_range"].map(ward_mapping)

    # Convert dates and aggregate daily individual cases into weekly totals per ward
    cases_df["notification_date"] = pd.to_datetime(cases_df["notification_date"])
    weekly_cases = (
        cases_df.groupby("Ward_Name")
        .resample("W-MON", on="notification_date")
        .size()
        .reset_index(name="Cases")
    )
    weekly_cases = weekly_cases.rename(columns={"notification_date": "Date"})

    # 2. Load the Climate Data (generated from Open-Meteo in Step 1)
    climate_path = os.path.join(BASE_DIR, "data", "live_climate_tensor.csv")
    try:
        climate_df = pd.read_csv(climate_path)
    except FileNotFoundError:
        print(f"[ERROR] Could not find {climate_path}. Run climate_connector.py first.")
        return

    climate_df["Date"] = pd.to_datetime(climate_df["Date"])

    # 3. Fuse the Datasets (Left join ensures we keep the continuous climate timeline)
    fused_df = pd.merge(climate_df, weekly_cases, on=["Date", "Ward_Name"], how="left")

    # Fill missing weeks with 0 cases (no notifications means 0 cases)
    fused_df["Cases"] = fused_df["Cases"].fillna(0)

    # Sort chronologically per ward for STGNN sequence modeling
    fused_df = fused_df.sort_values(by=["Ward_Name", "Date"]).reset_index(drop=True)

    # 4. Save Final Tensor
    save_path = os.path.join(BASE_DIR, "data", "fused_stgnn_tensor.csv")
    fused_df.to_csv(save_path, index=False)

    print("[SUCCESS] Merged Climate & Case Data successfully.")
    print(f"[INFO] Final Tensor Shape: {fused_df.shape}")
    print("\nPreview of Fused Spatio-Temporal Data:")
    print(fused_df.head(10))


if __name__ == "__main__":
    fuse_datasets()
