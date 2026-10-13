import axios from 'axios';

// Use 10.0.2.2 for Android Emulators to connect to localhost:5000
const API_BASE_URL = 'http://10.0.2.2:5000/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

export const preventionApi = {
    // Fetch real AI strategies from the backend
    getRecommendations: async (context) => {
        try {
            const response = await apiClient.post('/recommendations', context);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching AI strategy:', error);
            throw error;
        }
    },

    // Push the field officer's data back to the database
    recordIntervention: async (recordData) => {
        try {
            const response = await apiClient.post('/interventions', recordData);
            return response.data;
        } catch (error) {
            console.error('Error recording intervention:', error);
            throw error;
        }
    }
};