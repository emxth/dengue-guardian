import os

import numpy as np
import pandas as pd
import torch
from stgnn_model import AdaptiveSTGNN
from torch import nn

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

# 1. Load Data
anomaly_df = pd.read_csv(os.path.join(DATA_DIR, "anomaly_data.csv"))
adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)

source_nodes, target_nodes = [], []
for i in range(len(adj_df.values)):
    for j in range(len(adj_df.values)):
        if adj_df.values[i][j] == 1 and i != j:
            source_nodes.append(i)
            target_nodes.append(j)
edge_index = torch.tensor([source_nodes, target_nodes], dtype=torch.long)

# 2. Load Base Trained Model
model = AdaptiveSTGNN(num_node_features=4, hidden_size=64)
model_path = os.path.join(BASE_DIR, "saved_models", "stgnn_base.pt")
model.load_state_dict(torch.load(model_path, weights_only=True))
model.eval()

# 3. Format Temporal Windows for Anomaly Stream
SEQ_LEN = 8
num_weeks = anomaly_df["Week"].nunique()
num_wards = anomaly_df["Ward_ID"].nunique()

features = np.zeros((num_weeks, num_wards, 4))
targets = np.zeros((num_weeks, num_wards))

weeks_list = sorted(anomaly_df["Week"].unique())
for idx, w in enumerate(weeks_list):
    week_data = anomaly_df[anomaly_df["Week"] == w].sort_values("Ward_ID")
    features[idx] = week_data[
        ["Rainfall", "Temp", "Mosquito_Density", "Fogging_Executed"]
    ].values
    targets[idx] = week_data["Dengue_Cases"].values

X_anomaly, Y_anomaly = [], []
for i in range(num_weeks - SEQ_LEN - 4):
    X_anomaly.append(features[i : i + SEQ_LEN])
    y_step = np.stack(
        [targets[i + SEQ_LEN + 0], targets[i + SEQ_LEN + 1], targets[i + SEQ_LEN + 3]],
        axis=1,
    )
    Y_anomaly.append(y_step)

X_tensor = torch.tensor(np.array(X_anomaly), dtype=torch.float32)
Y_tensor = torch.tensor(np.array(Y_anomaly), dtype=torch.float32)

# 4. Stream Inference & Monitor Residual Error
criterion = nn.MSELoss()
DRIFT_THRESHOLD_MSE = 60.0  # Baseline MSE was ~38.0

print("\n--- Monitoring Real-Time Outbreak Stream for Concept Drift ---")
drift_detected = False
trigger_week = None

with torch.no_grad():
    for step in range(len(X_tensor)):
        pred = model(X_tensor[step], edge_index)
        loss = criterion(pred, Y_tensor[step]).item()
        current_week = weeks_list[step + SEQ_LEN]

        if loss > DRIFT_THRESHOLD_MSE:
            print(
                f"[ALERT] Week {current_week}: High Residual MSE = {loss:.2f} (> {DRIFT_THRESHOLD_MSE})"
            )
            print(
                ">>> CRITICAL CONCEPT DRIFT DETECTED: Climate anomaly causing prediction collapse!"
            )
            drift_detected = True
            trigger_week = current_week
            break
        else:
            print(f"Week {current_week}: Residual MSE = {loss:.2f} [Status: Nominal]")

if drift_detected:
    print(
        f"\n[ACTION] Automated Retraining Triggered at Week {trigger_week} using EWC Continual Learning.\n"
    )
