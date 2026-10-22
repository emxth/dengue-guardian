import axios from 'axios';

// NOTE FOR EXPO GO:
// - Express Backend port is 5000 (centralized routing for MongoDB + ML Engine)
// - If using an Android Emulator, use 'http://10.0.2.2:5000/api'
// - If testing on a physical phone using Expo Go via Wi-Fi, change this to your PC's local network IPv4 address (e.g., 'http://192.168.1.10:5000/api')
const API_BASE_URL = 'http://172.20.10.4:5000/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
});

export const preventionApi = {
    // Fetch real AI strategies from the Express backend (proxied to ML engine)
    getRecommendations: async (context) => {
        try {
            const response = await apiClient.post('/recommendations', context);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching AI strategy:', error);
            throw error;
        }
    },

    // Push the field officer's data back to MongoDB and Continual Learning
    recordIntervention: async (recordData) => {
        try {
            const response = await apiClient.post('/interventions', recordData);
            return response.data;
        } catch (error) {
            console.error('Error recording intervention:', error);
            throw error;
        }
    },

    // Retrieve historical field interventions from MongoDB
    getInterventions: async (zoneId) => {
        try {
            const url = zoneId ? `/interventions?zoneId=${zoneId}` : '/interventions';
            const response = await apiClient.get(url);
            return response.data;
        } catch (error) {
            console.error('Error fetching interventions:', error);
            throw error;
        }
    },

    // Trigger continual learning model retraining with merged field outcomes
    triggerRetrain: async () => {
        try {
            const response = await apiClient.post('/retrain');
            return response.data;
        } catch (error) {
            console.error('Error triggering model retrain:', error);
            throw error;
        }
    },

    // Submit Day-7 follow-up outcome data for server-side calculations & MongoDB persistence
    submitFollowUp: async (interventionId, followUpData) => {
        try {
            const idParam = interventionId || 'latest';
            const response = await apiClient.post(`/interventions/${idParam}/follow-up`, followUpData);
            return response.data;
        } catch (error) {
            console.error('Error submitting intervention follow-up:', error);
            throw error;
        }
    }
};