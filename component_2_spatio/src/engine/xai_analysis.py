import os

import numpy as np
import pandas as pd
import torch
from stgnn_model import AdaptiveSTGNN

# 1. Setup Paths and Load Data
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

data_df = pd.read_csv(os.path.join(DATA_DIR, "spatio_temporal_data.csv"))
adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)

# 2. Rebuild the Edge Index
source_nodes, target_nodes = [], []
for i in range(len(adj_df.values)):
    for j in range(len(adj_df.values)):
        if adj_df.values[i][j] == 1 and i != j:
            source_nodes.append(i)
            target_nodes.append(j)
edge_index = torch.tensor([source_nodes, target_nodes], dtype=torch.long)

# 3. Load the Trained Model
model = AdaptiveSTGNN(num_node_features=4, hidden_size=64)
model_path = os.path.join(BASE_DIR, "saved_models", "stgnn_base.pt")
model.load_state_dict(torch.load(model_path, weights_only=True))
model.eval()

# 4. Prepare a sample 8-week temporal window (e.g., Weeks 100 to 107)
SEQ_LEN = 8
target_week = 100
num_wards = data_df["Ward_ID"].nunique()

features = np.zeros((SEQ_LEN, num_wards, 4))
for i, w in enumerate(range(target_week, target_week + SEQ_LEN)):
    week_data = data_df[data_df["Week"] == w].sort_values("Ward_ID")
    features[i] = week_data[
        ["Rainfall", "Temp", "Mosquito_Density", "Fogging_Executed"]
    ].values

X_sample = torch.tensor(features, dtype=torch.float32)

# 5. Baseline Prediction (No features masked)
with torch.no_grad():
    base_pred = model(X_sample, edge_index)[0, 0].item()  # Ward 0, Horizon 1

# 6. Feature Attribution via Perturbation (Masking each feature to zero)
feature_names = ["Rainfall", "Temp", "Mosquito_Density", "Fogging_Executed"]
importance_scores = {}

with torch.no_grad():
    for idx, feature_name in enumerate(feature_names):
        # Create a copy of the input tensor
        X_perturbed = X_sample.clone()
        # Zero out this specific feature across all weeks and wards (simulate absence/neutral state)
        X_perturbed[:, :, idx] = 0.0

        # Get new prediction with feature removed
        pert_pred = model(X_perturbed, edge_index)[0, 0].item()

        # The importance is the magnitude of change in the prediction
        drop_in_prediction = abs(base_pred - pert_pred)
        importance_scores[feature_name] = drop_in_prediction

# 7. Convert to Percentages for Dashboard Display
total_drop = sum(importance_scores.values())
if total_drop == 0:
    total_drop = 1e-5  # Prevent division by zero

percentages = {k: (v / total_drop) * 100 for k, v in importance_scores.items()}

print("\n--- XAI Feature Importance Analysis for Malabe (Ward 0) ---")
print(f"Base Predicted Risk Score: {base_pred:.2f} cases")
print("-" * 60)
for name, pct in sorted(percentages.items(), key=lambda item: item[1], reverse=True):
    print(f"{name.ljust(20)}: {pct:5.1f}% Contribution to Outbreak Risk")

print("-" * 60)
print(
    "[DASHBOARD READY] Attribution successfully calculated and formatted for Screen 2."
)
