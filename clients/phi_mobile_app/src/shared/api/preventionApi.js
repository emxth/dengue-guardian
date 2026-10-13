import axios from 'axios';

// NOTE FOR EXPO GO:
// - If using an Android Emulator, use 'http://10.0.2.2:8000'
// - If testing on a physical phone using Expo Go via Wi-Fi, change this to your PC's local network IPv4 address (e.g., 'http://192.168.x.x:8000')
const API_BASE_URL = 'http://172.20.10.4:8000';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
});

export const preventionApi = {
    // Fetch real AI strategies from the backend
    getRecommendations: async (context) => {
        try {
            const response = await apiClient.post('/recommend', context);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching AI strategy:', error);
            throw error;
        }
    },

    // Push the field officer's data back to the database for Continual Learning
    recordIntervention: async (recordData) => {
        try {
            const response = await apiClient.post('/record-intervention', recordData);
            return response.data;
        } catch (error) {
            console.error('Error recording intervention:', error);
            throw error;
        }
    }
};