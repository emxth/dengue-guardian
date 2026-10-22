import torch
import torch.nn.functional as F
from torch.nn import LSTM, Linear
from torch_geometric.nn import GCNConv


class AdaptiveSTGNN(torch.nn.Module):
    def __init__(self, num_node_features, hidden_size=32):
        super().__init__()
        self.hidden_size = hidden_size

        # 1. Spatial Layer: Learns the spillover between neighboring MOH wards
        self.gcn = GCNConv(num_node_features, hidden_size)

        # 2. Temporal Layer: Learns the lag (Weather -> Mosquitoes -> Dengue)
        self.lstm = LSTM(hidden_size, hidden_size, batch_first=True)

        # 3. Output Layer: Predicts 3 distinct horizons (1-week, 2-week, 4-week ahead)
        self.linear = Linear(hidden_size, 3)

    def forward(self, x_seq, edge_index):
        # x_seq shape: (Sequence_Length=8, Num_Wards=5, Num_Features=4)
        seq_len = x_seq.size(0)

        # Pass each week's data through the Graph Convolutional Network
        gcn_outputs = []
        for t in range(seq_len):
            x_t = self.gcn(x_seq[t], edge_index)
            x_t = F.relu(x_t)
            gcn_outputs.append(x_t)

        # Stack the spatial embeddings into a time sequence
        # Shape becomes: (Sequence_Length, Num_Wards, Hidden_Size)
        gcn_seq = torch.stack(gcn_outputs)

        # Reshape for the LSTM: (Num_Wards, Sequence_Length, Hidden_Size)
        lstm_in = gcn_seq.permute(1, 0, 2)

        # Pass the sequence through the LSTM
        lstm_out, _ = self.lstm(lstm_in)

        # Extract the final hidden state of the LSTM to make predictions
        last_state = lstm_out[:, -1, :]  # Shape: (Num_Wards, Hidden_Size)

        # Predict the 3 horizons for each ward
        out = self.linear(last_state)  # Shape: (Num_Wards, 3)
        return F.relu(out)  # ReLU ensures we don't predict negative dengue cases
