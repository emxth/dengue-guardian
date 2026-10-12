import axios from 'axios';

// Ensure you have VITE_API_BASE_URL=http://localhost:5000 in your web_dashboard/.env file
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
     * @param {Object} context { temperature, rainfall, mosquito_density, breeding_sites_count, wind_speed }
     */
    getRecommendations: async (context) => {
        try {
            const response = await apiClient.post('/recommendations', context);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching recommendations:', error);
            throw error;
        }
    },

    /**
     * Fetch historical intervention records
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
     * Log a new intervention action (simulating the PHI Mobile App action from the web for testing)
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
    }
};