import numpy as np
import pandas as pd

# 1. Define the Wards and Spatial Adjacency Matrix (Graph Topology)
wards = ["Malabe", "Battaramulla", "Koswatta", "Kaduwela_Town", "Athurugiriya"]
num_wards = len(wards)
num_weeks = 156  # 3 years of weekly data

# 1 = Wards share a border, 0 = No border
adj_matrix = np.array(
    [
        [1, 1, 1, 0, 1],  # Malabe
        [1, 1, 1, 0, 0],  # Battaramulla
        [1, 1, 1, 1, 0],  # Koswatta
        [0, 0, 1, 1, 1],  # Kaduwela_Town
        [1, 0, 0, 1, 1],  # Athurugiriya
    ]
)
pd.DataFrame(adj_matrix, index=wards, columns=wards).to_csv("adjacency_matrix.csv")

# 2. Generate Spatio-Temporal Data
data = []
np.random.seed(42)

for ward_idx, ward in enumerate(wards):
    # Simulate seasonal rainfall (Monsoon peaks around weeks 20 and 45)
    time = np.arange(num_weeks)
    rainfall = (
        50
        + 100 * np.sin(2 * np.pi * time / 52)
        + 80 * np.sin(2 * np.pi * time / 26)
        + np.random.normal(0, 20, num_weeks)
    )
    rainfall = np.clip(rainfall, 0, None)  # No negative rain

    # Simulate ambient temperature
    temp = 28 + 2 * np.sin(2 * np.pi * time / 52) + np.random.normal(0, 1, num_weeks)

    # Simulate mosquito density (Lags rainfall by 1-2 weeks)
    mosquito_density = np.roll(rainfall, 1) * 0.5 + np.random.normal(10, 5, num_weeks)
    mosquito_density = np.clip(mosquito_density, 0, None)

    # Add interventions (Random fogging 3 times a year per ward)
    fogging = np.random.choice([0, 1], size=num_weeks, p=[0.94, 0.06])

    # Calculate Dengue Cases (Lags mosquitoes by 2-3 weeks)
    dengue_cases = np.roll(mosquito_density, 2) * 0.3 + np.random.normal(
        5, 2, num_weeks
    )

    # Apply Intervention Impact (If fogging happened last week, cases & mosquitoes drop)
    for w in range(1, num_weeks):
        if fogging[w - 1] == 1:
            mosquito_density[w] *= 0.2
            dengue_cases[w] *= 0.4
            if w + 1 < num_weeks:
                dengue_cases[w + 1] *= 0.5

    dengue_cases = np.clip(np.round(dengue_cases), 0, None)

    for w in range(num_weeks):
        data.append(
            [
                w,
                ward_idx,
                ward,
                rainfall[w],
                temp[w],
                mosquito_density[w],
                fogging[w],
                dengue_cases[w],
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

# 3. Apply Spatial Spillover (Neighbors affect each other)
for w in range(1, num_weeks):
    for ward_idx in range(num_wards):
        # Find neighbors
        neighbors = np.where(adj_matrix[ward_idx] == 1)[0]
        # Sum cases of neighbors from the PREVIOUS week
        neighbor_cases_last_week = df[
            (df["Week"] == w - 1) & (df["Ward_ID"].isin(neighbors))
        ]["Dengue_Cases"].sum()
        # Add 10% of neighbor cases to this week's cases (Spillover effect)
        current_idx = df[(df["Week"] == w) & (df["Ward_ID"] == ward_idx)].index[0]
        df.at[current_idx, "Dengue_Cases"] += np.round(neighbor_cases_last_week * 0.1)

df.to_csv("spatio_temporal_data.csv", index=False)
print("Synthetic Datasets Generated Successfully!")
