// API Routes

const express = require('express');
const router = express.Router();
const { recordIntervention, getInterventions } = require('../controllers/interventionController');

// Import controllers
const { getRecommendation } = require('../controllers/recommendationController');

// Intervention routes
router.route('/interventions')
    .post(recordIntervention)
    .get(getInterventions);

// Recommendation route
router.route('/recommendations')
    .post(getRecommendation);

module.exports = router;
