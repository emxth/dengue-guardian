// Recommendation Controller – routes /api/recommendations → Python FastAPI ML service

const axios = require('axios');
const path = require('path');
const fs = require('fs');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ─── Helper: sanitise a single numeric field ───────────────────────────────────
const toNum = (val, fallback) => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
};

// ─── Helper: build the validated ML payload ────────────────────────────────────
// FastAPI Pydantic model now has defaults for cumulative_rainfall_14_days (100)
// and wind_speed (10), but we always send all fields for full transparency.
const buildMLPayload = (ctx) => ({
    temperature: toNum(ctx.temperature, 29.0),
    rainfall: toNum(ctx.rainfall, 80.0),
    cumulative_rainfall_14_days: toNum(ctx.cumulative_rainfall_14_days, 100.0),
    wind_speed: toNum(ctx.wind_speed, 10.0),
    mosquito_density: toNum(ctx.mosquito_density, 40.0),
    breeding_sites_count: Math.round(toNum(ctx.breeding_sites_count, 15)),
});

// ─── Controller ────────────────────────────────────────────────────────────────

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

            // Map mock JSON structure → ML engine field names (all 6 fields)
            context = {
                temperature: parsed.environmental_context.avg_temp_c,
                rainfall: parsed.environmental_context.rainfall_7d_mm,
                // cumulative is approx. 2× the 7-day reading when not provided
                cumulative_rainfall_14_days: parsed.environmental_context.cumulative_rainfall_14_days
                    || parsed.environmental_context.rainfall_7d_mm * 2,
                wind_speed: parsed.environmental_context.wind_speed_kmh,
                mosquito_density: parsed.entomological_context.breteau_index * 1.5,
                breeding_sites_count: Math.round(parsed.entomological_context.house_index),
            };
        }

        // Forward all 6 fields to the Python FastAPI ML microservice
        const mlPayload = buildMLPayload(context);
        const response = await axios.post(`${ML_SERVICE_URL}/recommend`, mlPayload, {
            timeout: 10000,  // 10 s timeout – prevent hanging if ML service is down
        });

        return res.status(200).json({
            success: true,
            data: response.data.data,
        });

    } catch (error) {
        console.error('[RecommendationController] Error contacting ML microservice:', error.message);
        return res.status(500).json({
            success: false,
            error: error.response?.data?.detail || error.message,
        });
    }
};