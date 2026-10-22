import os
import sys

import numpy as np
import pandas as pd
import torch

# 1. Path Setup & Imports
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.append(os.path.join(BASE_DIR, "src"))  # Allow importing from src/engine
DATA_DIR = os.path.join(BASE_DIR, "data")

from engine.stgnn_model import AdaptiveSTGNN

# 2. Load Data and Edge Index
data_df = pd.read_csv(os.path.join(DATA_DIR, "spatio_temporal_data.csv"))
adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)

source_nodes, target_nodes = [], []
for i in range(len(adj_df.values)):
    for j in range(len(adj_df.values)):
        if adj_df.values[i][j] == 1 and i != j:
            source_nodes.append(i)
            target_nodes.append(j)
edge_index = torch.tensor([source_nodes, target_nodes], dtype=torch.long)

# 3. Load the Base Model
model = AdaptiveSTGNN(num_node_features=4, hidden_size=64)
model_path = os.path.join(BASE_DIR, "saved_models", "stgnn_base.pt")
model.load_state_dict(torch.load(model_path, weights_only=True))
model.eval()

# 4. Extract a Target Window (e.g., Weeks 100 to 107)
SEQ_LEN = 8
target_week = 100
num_wards = data_df["Ward_ID"].nunique()

features = np.zeros((SEQ_LEN, num_wards, 4))
for i, w in enumerate(range(target_week, target_week + SEQ_LEN)):
    week_data = data_df[data_df["Week"] == w].sort_values("Ward_ID")
    features[i] = week_data[
        ["Rainfall", "Temp", "Mosquito_Density", "Fogging_Executed"]
    ].values

X_baseline = torch.tensor(features, dtype=torch.float32)

# 5. Run Baseline Prediction (No Intervention)
with torch.no_grad():
    # Predicting for Malabe (Ward 0) at the 2-Week Horizon (Index 1)
    base_pred = model(X_baseline, edge_index)[0, 1].item()

# 6. Counterfactual Logic (The Digital Twin Intervention)
# We simulate a scenario where the PHI team conducts aggressive fogging and
# clears breeding sites during the final 2 weeks of the input window.
X_simulated = X_baseline.clone()

# Feature indices: 0=Rain, 1=Temp, 2=Mosquito_Density, 3=Fogging_Executed
for w in range(SEQ_LEN - 2, SEQ_LEN):  # Last two weeks of the window
    # Set Fogging to YES (1.0)
    X_simulated[w, 0, 3] = 1.0
    # Force Mosquito Density down by 60% due to the intervention
    X_simulated[w, 0, 2] = X_simulated[w, 0, 2] * 0.4

# 7. Run Simulated Prediction
with torch.no_grad():
    sim_pred = model(X_simulated, edge_index)[0, 1].item()

# 8. Output Dashboard Metrics
cases_averted = base_pred - sim_pred
reduction_pct = (cases_averted / base_pred) * 100 if base_pred > 0 else 0

print("\n" + "=" * 55)
print("DIGITAL TWIN: COUNTERFACTUAL INTERVENTION ENGINE")
print("=" * 55)
print("Target Area      : Malabe (Ward 0)")
print("Forecast Horizon : 14-Day (2-Week Ahead)")
print("Intervention     : Aggressive Fogging & 60% Source Reduction")
print("-" * 55)
print(f"Baseline Forecast (No Action) : {base_pred:.1f} projected cases")
print(f"Simulated Forecast (Actioned) : {sim_pred:.1f} projected cases")
print("-" * 55)
print(f"Projected Cases Averted   : {cases_averted:.1f}")
print(f"Epidemic Curve Reduction  : {reduction_pct:.1f}%")
print("=" * 55)
print("[API READY] Simulation payload ready to export to Component 4.")
