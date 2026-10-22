import os
import time

import pandas as pd
import requests

# Standardized GPS Coordinates for the Kaduwela MOH region wards
WARD_COORDINATES = {
    "Malabe": {"lat": 6.9044, "lon": 79.9562},
    "Battaramulla": {"lat": 6.8986, "lon": 79.9167},
    "Koswatta": {"lat": 6.9056, "lon": 79.9234},
    "Kaduwela_Town": {"lat": 6.9333, "lon": 79.9833},
    "Athurugiriya": {"lat": 6.8742, "lon": 79.9897},
}


def fetch_historical_climate():
    """
    Pulls 8 months of real historical climate data using Open-Meteo's Archive API
    (which bypasses the 90-day limit). Years are then shifted to 2026 to
    seamlessly fuse with the synthetic Component 3 clinical dataset.
    """
    print("--- Fetching Climate Data from Open-Meteo Archive API ---")

    all_ward_data = []

    for ward, coords in WARD_COORDINATES.items():
        print(
            f"Pulling historical data for {ward} (Lat: {coords['lat']}, Lon: {coords['lon']})..."
        )

        # Use the dedicated Archive API instead of the standard Forecast API
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": coords["lat"],
            "longitude": coords["lon"],
            "start_date": "2023-03-01",  # Real historical baseline
            "end_date": "2023-10-31",  # 8 full months of data
            "daily": ["temperature_2m_mean", "precipitation_sum"],
            "timezone": "Asia/Colombo",
        }

        response = requests.get(url, params=params)

        if response.status_code == 200:
            data = response.json()
            daily_data = data.get("daily", {})

            df = pd.DataFrame(
                {
                    "Date": pd.to_datetime(daily_data.get("time")),
                    "Temp": daily_data.get("temperature_2m_mean"),
                    "Rainfall": daily_data.get("precipitation_sum"),
                }
            )

            # Shift the dates to 2026 to merge perfectly with Component 3 case data
            df["Date"] = df["Date"].apply(lambda x: x.replace(year=x.year + 3))

            df["Ward_Name"] = ward
            all_ward_data.append(df)
        else:
            print(f"[ERROR] Failed to fetch data for {ward}: {response.text}")

        # Respect the free tier API rate limits
        time.sleep(0.5)

    # The pd.concat error occurred previously because this list was empty
    final_df = pd.concat(all_ward_data, ignore_index=True)
    return final_df


def aggregate_to_weekly(daily_df):
    """
    Converts daily API data into the weekly format required by the STGNN model.
    """
    daily_df = daily_df.sort_values(by="Date")

    weekly_list = []
    for ward, group in daily_df.groupby("Ward_Name"):
        weekly_data = (
            group.set_index("Date")
            .resample("W-MON")
            .agg({"Temp": "mean", "Rainfall": "sum"})
            .reset_index()
        )

        weekly_data["Ward_Name"] = ward
        weekly_list.append(weekly_data)

    weekly_df = pd.concat(weekly_list, ignore_index=True)
    return weekly_df.dropna()


if __name__ == "__main__":
    # 1. Pull historical data
    raw_climate_df = fetch_historical_climate()

    # 2. Convert to Model Tensor Format
    weekly_tensor_data = aggregate_to_weekly(raw_climate_df)

    print("\n--- Processed Weekly Tensor Data (Preview) ---")
    print(weekly_tensor_data.head())

    # 3. Save to data directory
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    save_path = os.path.join(BASE_DIR, "data", "live_climate_tensor.csv")
    os.makedirs(os.path.dirname(save_path), exist_ok=True)

    weekly_tensor_data.to_csv(save_path, index=False)
    print(f"\n[SUCCESS] Live climate data saved to {save_path}")
