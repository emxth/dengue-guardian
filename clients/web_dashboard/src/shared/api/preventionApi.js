import axios from 'axios';

// Ensure you have VITE_API_BASE_URL=http://localhost:5000/api in your web_dashboard/.env file
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const preventionApi = {
    /**
     * Fetch AI recommendations based on current environmental context
     * Routes through Node.js Express backend -> Python FastAPI ML microservice
     * @param {Object} context { temperature, rainfall, cumulative_rainfall_14_days, mosquito_density, breeding_sites_count, wind_speed }
     */
    getRecommendations: async (context) => {
        try {
            const response = await apiClient.post('/recommendations', context);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching recommendations from backend:', error);
            throw error;
        }
    },

    /**
     * Fetch historical intervention records from MongoDB
     * @param {String} zoneId (Optional) Filter by specific zone
     */
    getInterventions: async (zoneId = null) => {
        try {
            const url = zoneId ? `/interventions?zoneId=${zoneId}` : '/interventions';
            const response = await apiClient.get(url);
            return response.data;
        } catch (error) {
            console.error('Error fetching interventions:', error);
            throw error;
        }
    },

    /**
     * Log a new intervention action (synced to MongoDB and ML continual learning)
     * @param {Object} recordData 
     */
    recordIntervention: async (recordData) => {
        try {
            const response = await apiClient.post('/interventions', recordData);
            return response.data;
        } catch (error) {
            console.error('Error recording intervention:', error);
            throw error;
        }
    },

    /**
     * Trigger continual learning retraining loop via backend proxy
     */
    triggerRetraining: async () => {
        try {
            const response = await apiClient.post('/retrain', {});
            return response.data;
        } catch (error) {
            console.error('Error triggering model retraining:', error);
            throw error;
        }
    },

    /**
     * Record a Day-7 follow-up outcome for a specific intervention
     * @param {String} id MongoDB ObjectId of the intervention
     * @param {Object} followUpData { postBreedingFoci, postBreteauIndex }
     */
    recordFollowUp: async (id, followUpData) => {
        try {
            const response = await apiClient.post(`/interventions/${id}/follow-up`, followUpData);
            return response.data;
        } catch (error) {
            console.error('Error recording follow-up outcome:', error);
            throw error;
        }
    },

    /**
     * Check C4 Backend health
     */
    getBackendHealth: async () => {
        try {
            const response = await apiClient.get('/health');
            return response.data;
        } catch (error) {
            console.error('Error checking backend health:', error);
            throw error;
        }
    },

    /**
     * Check ML Engine health (proxied through backend)
     */
    getMlHealth: async () => {
        try {
            const response = await apiClient.get('/ml-health');
            return response.data;
        } catch (error) {
            console.error('Error checking ML engine health:', error);
            throw error;
        }
    }
};