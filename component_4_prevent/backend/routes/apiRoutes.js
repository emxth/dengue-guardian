// API Routes – all ML communication is centralised through this router.
// Clients (web dashboard, mobile app) MUST use these routes, not call FastAPI directly.

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const { recordIntervention, getInterventions, recordFollowUp } = require('../controllers/interventionController');
const { getRecommendation }                    = require('../controllers/recommendationController');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ── Intervention routes ──────────────────────────────────────────────────────
router.route('/interventions')
    .post(recordIntervention)
    .get(getInterventions);

router.post('/interventions/:id/follow-up', recordFollowUp);

// ── Recommendation route ─────────────────────────────────────────────────────
router.route('/recommendations')
    .post(getRecommendation);

// ── Continual Learning retrain trigger ───────────────────────────────────────
// @desc    Proxy POST /api/retrain → FastAPI /retrain-model
// @route   POST /api/retrain
router.post('/retrain', async (req, res) => {
    try {
        const response = await axios.post(`${ML_SERVICE_URL}/retrain-model`, {}, { timeout: 120000 });
        return res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error('[apiRoutes] /retrain error:', error.message);
        return res.status(500).json({
            success: false,
            error: error.response?.data?.detail || error.message,
        });
    }
});

module.exports = router;
