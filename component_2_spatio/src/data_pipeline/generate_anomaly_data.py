import os

import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

wards = ["Malabe", "Battaramulla", "Koswatta", "Kaduwela_Town", "Athurugiriya"]
num_wards = len(wards)
num_weeks = 52  # 1 full year of anomalous data (Weeks 156-207)

adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)
adj_matrix = adj_df.values

np.random.seed(99)  # New seed for anomaly
data = []

for ward_idx, ward in enumerate(wards):
    time = np.arange(156, 156 + num_weeks)

    # CLIMATE ANOMALY: Severe, prolonged off-season rainstorm during dry weeks (Weeks 170-185)
    rainfall = (
        30 + 40 * np.sin(2 * np.pi * time / 52) + np.random.normal(0, 15, num_weeks)
    )
    rainfall[14:28] += 180.0  # Massive flash flood / off-season monsoon anomaly
    rainfall = np.clip(rainfall, 0, None)

    temp = (
        29.5 + 3.0 * np.sin(2 * np.pi * time / 52) + np.random.normal(0, 1.2, num_weeks)
    )

    # Mosquito breeding responds aggressively to warm post-flood puddles
    mosquito_density = np.roll(rainfall, 1) * 0.75 + np.random.normal(15, 6, num_weeks)
    mosquito_density = np.clip(mosquito_density, 0, None)

    # Reduced fogging efficiency during flood disaster
    fogging = np.random.choice([0, 1], size=num_weeks, p=[0.97, 0.03])

    # Dengue cases spike dramatically (Out of previous distribution)
    dengue_cases = np.roll(mosquito_density, 2) * 0.45 + np.random.normal(
        8, 3, num_weeks
    )

    for w_idx in range(1, num_weeks):
        if fogging[w_idx - 1] == 1:
            mosquito_density[w_idx] *= 0.4
            dengue_cases[w_idx] *= 0.5

    dengue_cases = np.clip(np.round(dengue_cases), 0, None)

    for local_w, actual_w in enumerate(time):
        data.append(
            [
                actual_w,
                ward_idx,
                ward,
                rainfall[local_w],
                temp[local_w],
                mosquito_density[local_w],
                fogging[local_w],
                dengue_cases[local_w],
            ]
        )

df = pd.DataFrame(
    data,
    columns=[
        "Week",
        "Ward_ID",
        "Ward_Name",
        "Rainfall",
        "Temp",
        "Mosquito_Density",
        "Fogging_Executed",
        "Dengue_Cases",
    ],
)

# Spatial Spillover
for local_w in range(1, num_weeks):
    actual_w = 156 + local_w
    for ward_idx in range(num_wards):
        neighbors = np.where(adj_matrix[ward_idx] == 1)[0]
        neighbor_cases_last = df[
            (df["Week"] == actual_w - 1) & (df["Ward_ID"].isin(neighbors))
        ]["Dengue_Cases"].sum()
        current_idx = df[(df["Week"] == actual_w) & (df["Ward_ID"] == ward_idx)].index[
            0
        ]
        df.at[current_idx, "Dengue_Cases"] += np.round(neighbor_cases_last * 0.15)

save_path = os.path.join(DATA_DIR, "anomaly_data.csv")
df.to_csv(save_path, index=False)
print(f"[SUCCESS] Climate anomaly dataset created at: {save_path}")
