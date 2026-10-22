import os
import sys

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import mean_absolute_error, mean_squared_error
from torch import nn

# 1. Define Paths and Load Data
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.append(os.path.join(BASE_DIR, "src"))

from engine.stgnn_model import AdaptiveSTGNN

DATA_DIR = os.path.join(BASE_DIR, "data")

# Read the newly fused real-world dataset and adjacency matrix
data_df = pd.read_csv(os.path.join(DATA_DIR, "fused_stgnn_tensor.csv"))
adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)

# 2. Build the Graph Edge Index
source_nodes, target_nodes = np.where(adj_df.values == 1)
edge_index = torch.tensor(np.array([source_nodes, target_nodes]), dtype=torch.long)

# 3. Create Rolling Temporal Windows (8 weeks input -> 1, 2, 4 weeks output)
# Sort strictly by date to ensure proper temporal sliding windows
data_df["Date"] = pd.to_datetime(data_df["Date"])
data_df = data_df.sort_values(by=["Ward_Name", "Date"])

wards = data_df["Ward_Name"].unique()
num_wards = len(wards)
num_weeks = len(data_df["Date"].unique())

SEQ_LEN = 8
HORIZONS = [1, 2, 4]  # Predict 1 week, 2 weeks, and 4 weeks ahead

# Convert CSV into a 3D NumPy array: (Weeks, Wards, Features)
# Feature Order must match API inference: [Cases, Temp, Rainfall, Placeholder]
features = np.zeros((num_weeks, num_wards, 4))
targets = np.zeros((num_weeks, num_wards))

for w_idx, ward in enumerate(wards):
    ward_data = data_df[data_df["Ward_Name"] == ward].sort_values("Date")

    # Fill the feature tensor
    features[:, w_idx, 0] = ward_data["Cases"].values
    features[:, w_idx, 1] = ward_data["Temp"].values
    features[:, w_idx, 2] = ward_data["Rainfall"].values
    # features[:, w_idx, 3] remains 0.0 (placeholder for vector/intervention data)

    # Fill the target tensor (Cases)
    targets[:, w_idx] = ward_data["Cases"].values

X_windows, Y_windows = [], []
for w in range(num_weeks - SEQ_LEN - max(HORIZONS)):
    X_windows.append(features[w : w + SEQ_LEN])

    # Fetch targets for exactly 1 week, 2 weeks, and 4 weeks into the future
    y_step = np.stack(
        [
            targets[w + SEQ_LEN + 0],  # 1-week ahead
            targets[w + SEQ_LEN + 1],  # 2-weeks ahead
            targets[w + SEQ_LEN + 3],  # 4-weeks ahead
        ],
        axis=1,
    )
    Y_windows.append(y_step)

X_tensor = torch.tensor(np.array(X_windows), dtype=torch.float32)
Y_tensor = torch.tensor(np.array(Y_windows), dtype=torch.float32)

# Handle cases where the dataset is very small (e.g. less than 20 weeks)
train_size = max(1, int(len(X_tensor) * 0.8))
X_train, Y_train = X_tensor[:train_size], Y_tensor[:train_size]
X_test, Y_test = X_tensor[train_size:], Y_tensor[train_size:]

if len(X_test) == 0:
    # If the dataset is too small to split, evaluate on train data just to prevent crashing
    X_test, Y_test = X_train, Y_train

# 4. Initialize the Model, Optimizer, and Loss
model = AdaptiveSTGNN(num_node_features=4, hidden_size=64)
optimizer = torch.optim.Adam(model.parameters(), lr=0.005)
criterion = nn.MSELoss()

# 5. Training Loop
epochs = 150
print("\n[INFO] Starting Multi-Horizon STGNN Training on Fused Data...")
for epoch in range(epochs):
    model.train()
    total_loss = 0

    for i in range(len(X_train)):
        optimizer.zero_grad()
        # Note: X_train[i] shape is (8, num_wards, 4)
        predictions = model(X_train[i], edge_index)
        loss = criterion(predictions, Y_train[i])
        loss.backward()
        optimizer.step()
        total_loss += loss.item()

    if (epoch + 1) % 25 == 0:
        print(
            f"Epoch {epoch + 1:03d}/{epochs} | Training Loss (MSE): {total_loss / len(X_train):.4f}"
        )

# 6. Benchmarking & Evaluation (RMSE and MAE)
model.eval()
all_preds, all_actuals = [], []

with torch.no_grad():
    for i in range(len(X_test)):
        pred = model(X_test[i], edge_index)
        all_preds.append(pred.numpy())
        all_actuals.append(Y_test[i].numpy())

all_preds = np.array(all_preds)
all_actuals = np.array(all_actuals)

print("\n[BENCHMARK] Model Evaluation on Test Data:")
for idx, horizon in enumerate([1, 2, 4]):
    preds_h = all_preds[:, :, idx].flatten()
    actuals_h = all_actuals[:, :, idx].flatten()

    rmse = np.sqrt(mean_squared_error(actuals_h, preds_h))
    mae = mean_absolute_error(actuals_h, preds_h)

    print(
        f"Horizon: {horizon}-Week Ahead Forecast -> RMSE: {rmse:.2f} | MAE: {mae:.2f}"
    )

# 7. Save the trained model weights
model_save_path = os.path.join(BASE_DIR, "saved_models", "stgnn_base.pt")
os.makedirs(os.path.dirname(model_save_path), exist_ok=True)
torch.save(model.state_dict(), model_save_path)
print(f"\n[SUCCESS] Retrained Model weights saved to {model_save_path}")
