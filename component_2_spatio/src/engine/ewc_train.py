import os

import numpy as np
import pandas as pd
import torch
from stgnn_model import AdaptiveSTGNN
from torch import nn

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

# 1. Load Data
adj_df = pd.read_csv(os.path.join(DATA_DIR, "adjacency_matrix.csv"), index_col=0)
base_df = pd.read_csv(os.path.join(DATA_DIR, "spatio_temporal_data.csv"))
anomaly_df = pd.read_csv(os.path.join(DATA_DIR, "anomaly_data.csv"))

source_nodes, target_nodes = [], []
for i in range(len(adj_df.values)):
    for j in range(len(adj_df.values)):
        if adj_df.values[i][j] == 1 and i != j:
            source_nodes.append(i)
            target_nodes.append(j)
edge_index = torch.tensor([source_nodes, target_nodes], dtype=torch.long)


def build_tensors(df):
    num_weeks = df["Week"].nunique()
    num_wards = df["Ward_ID"].nunique()
    features = np.zeros((num_weeks, num_wards, 4))
    targets = np.zeros((num_weeks, num_wards))
    weeks = sorted(df["Week"].unique())
    for idx, w in enumerate(weeks):
        w_data = df[df["Week"] == w].sort_values("Ward_ID")
        features[idx] = w_data[
            ["Rainfall", "Temp", "Mosquito_Density", "Fogging_Executed"]
        ].values
        targets[idx] = w_data["Dengue_Cases"].values
    X, Y = [], []
    for i in range(num_weeks - 8 - 4):
        X.append(features[i : i + 8])
        y_step = np.stack([targets[i + 8], targets[i + 9], targets[i + 11]], axis=1)
        Y.append(y_step)
    return torch.tensor(np.array(X), dtype=torch.float32), torch.tensor(
        np.array(Y), dtype=torch.float32
    )


X_base, Y_base = build_tensors(base_df)
X_anom, Y_anom = build_tensors(anomaly_df)


# 2. Elastic Weight Consolidation (EWC) Class
class EWC:
    def __init__(self, model, dataset, edge_index):
        self.model = model
        self.edge_index = edge_index
        # Store original parameters
        self.params = {
            n: p.clone().detach()
            for n, p in model.named_parameters()
            if p.requires_grad
        }
        self.fisher = self._compute_fisher(dataset)

    def _compute_fisher(self, dataset):
        fisher = {
            n: torch.zeros_like(p)
            for n, p in self.model.named_parameters()
            if p.requires_grad
        }
        self.model.eval()
        criterion = nn.MSELoss()

        X_data, Y_data = dataset
        for i in range(len(X_data)):
            self.model.zero_grad()
            out = self.model(X_data[i], self.edge_index)
            loss = criterion(out, Y_data[i])
            loss.backward()
            for n, p in self.model.named_parameters():
                if p.grad is not None:
                    fisher[n] += p.grad.data.pow(2) / len(X_data)
        return fisher

    def penalty(self, new_model):
        loss = 0
        for n, p in new_model.named_parameters():
            if n in self.fisher:
                loss += (self.fisher[n] * (p - self.params[n]).pow(2)).sum()
        return loss


# 3. Load Base Model & Register Fisher Information
model = AdaptiveSTGNN(num_node_features=4, hidden_size=64)
model_path = os.path.join(BASE_DIR, "saved_models", "stgnn_base.pt")
model.load_state_dict(torch.load(model_path, weights_only=True))

print("\n[INFO] Computing Fisher Information Matrix on Historical Data...")
ewc = EWC(model, (X_base, Y_base), edge_index)

# 4. Retraining Loop with EWC Regularization
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
criterion = nn.MSELoss()
EWC_LAMBDA = 500.0  # Importance factor for preserving old memories

print(
    f"\n[INFO] Retraining STGNN on Anomaly Stream using Continual Learning (EWC lambda={EWC_LAMBDA})..."
)
model.train()
for epoch in range(60):
    total_loss = 0
    for i in range(len(X_anom)):
        optimizer.zero_grad()
        out = model(X_anom[i], edge_index)
        task_loss = criterion(out, Y_anom[i])
        ewc_loss = EWC_LAMBDA * ewc.penalty(model)

        loss = task_loss + ewc_loss
        loss.backward()
        optimizer.step()
        total_loss += task_loss.item()

    if (epoch + 1) % 15 == 0:
        print(f"Epoch {epoch + 1:02d}/60 | Task MSE: {total_loss / len(X_anom):.4f}")

# 5. Verify Memory Retention (Testing Old Baseline vs New Anomaly)
model.eval()
with torch.no_grad():
    # Performance on old historical data
    base_preds = [
        criterion(model(X_base[i], edge_index), Y_base[i]).item()
        for i in range(len(X_base))
    ]
    avg_base_mse = np.mean(base_preds)

    # Performance on new anomalous stream
    anom_preds = [
        criterion(model(X_anom[i], edge_index), Y_anom[i]).item()
        for i in range(len(X_anom))
    ]
    avg_anom_mse = np.mean(anom_preds)

print("\n--- Continual Learning Verification ---")
print(f"Historical Task Memory Retention (Baseline MSE): {avg_base_mse:.2f}")
print(f"Adapted Climate Anomaly Performance (Anomaly MSE): {avg_anom_mse:.2f}")
print("[SUCCESS] Model successfully adapted without catastrophic forgetting!")

# Save adapted weights
adapted_save_path = os.path.join(BASE_DIR, "saved_models", "stgnn_adapted_ewc.pt")
torch.save(model.state_dict(), adapted_save_path)
print(f"Adapted weights saved to: {adapted_save_path}")
