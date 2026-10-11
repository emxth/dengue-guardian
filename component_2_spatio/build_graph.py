import pandas as pd
import torch
from torch_geometric.data import Data

# 1. Load the generated datasets
adj_df = pd.read_csv("adjacency_matrix.csv", index_col=0)
data_df = pd.read_csv("spatio_temporal_data.csv")

# 2. Extract Edge Indices (PyTorch Geometric format: [2, num_edges])
# We find all coordinates where the adjacency matrix is '1' (excluding self-loops)
source_nodes = []
target_nodes = []

adj_matrix = adj_df.values
for i in range(len(adj_matrix)):
    for j in range(len(adj_matrix)):
        if adj_matrix[i][j] == 1 and i != j:
            source_nodes.append(i)
            target_nodes.append(j)

edge_index = torch.tensor([source_nodes, target_nodes], dtype=torch.long)
print("Edge Index Shape:", edge_index.shape)


# 3. Create a Graph Data Object for a specific Time Step (e.g., Week 25)
# In an STGNN, you will loop this over all weeks to create a temporal sequence.
def create_graph_for_week(week_num):
    week_data = data_df[data_df["Week"] == week_num].sort_values("Ward_ID")

    # Node Features: [Rainfall, Temp, Mosquito_Density, Fogging_Executed]
    features = week_data[
        ["Rainfall", "Temp", "Mosquito_Density", "Fogging_Executed"]
    ].values
    x = torch.tensor(features, dtype=torch.float)

    # Target: Dengue Cases
    target = week_data["Dengue_Cases"].values
    y = torch.tensor(target, dtype=torch.float)

    # Construct the PyG Data object
    graph_data = Data(x=x, edge_index=edge_index, y=y)
    return graph_data


# Test the function
sample_graph = create_graph_for_week(25)
print("\n--- Graph Object for Week 25 ---")
print(sample_graph)
print(f"Number of Nodes (Wards): {sample_graph.num_nodes}")
print(f"Number of Features per Node: {sample_graph.num_node_features}")
print(f"Target vector (Cases in each ward): {sample_graph.y}")
