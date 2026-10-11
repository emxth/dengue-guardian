// Recommendation Controller

// Recommendation Controller (Calls Python FastAPI Microservice)
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// @desc    Get AI-driven recommendation based on current context
// @route   POST /api/recommendations
exports.getRecommendation = async (req, res) => {
    try {
        let context = req.body;

        // Fallback to mock context if empty payload received (useful for early testing)
        if (!context || Object.keys(context).length === 0) {
            const mockPath = path.join(__dirname, '../mock_inputs/mock_context.json');
            const rawMock = fs.readFileSync(mockPath, 'utf8');
            const parsed = JSON.parse(rawMock);

            context = {
                temperature: parsed.environmental_context.avg_temp_c,
                rainfall: parsed.environmental_context.rainfall_7d_mm,
                mosquito_density: parsed.entomological_context.breteau_index * 1.5,
                breeding_sites_count: Math.round(parsed.entomological_context.house_index),
                wind_speed: parsed.environmental_context.wind_speed_kmh
            };
        }

        // Call the Python FastAPI ML microservice
        const response = await axios.post(`${ML_SERVICE_URL}/recommend`, {
            temperature: Number(context.temperature),
            rainfall: Number(context.rainfall),
            mosquito_density: Number(context.mosquito_density),
            breeding_sites_count: Number(context.breeding_sites_count),
            wind_speed: Number(context.wind_speed || 10.0)
        });

        res.status(200).json({
            success: true,
            data: response.data.data
        });
    } catch (error) {
        console.error('Error contacting ML microservice:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.detail || error.message
        });
    }
};