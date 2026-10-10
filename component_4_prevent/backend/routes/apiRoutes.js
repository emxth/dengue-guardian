// API Routes

const express = require('express');
const router = express.Router();
const { recordIntervention, getInterventions } = require('../controllers/interventionController');

// Intervention routes
router.route('/interventions')
    .post(recordIntervention)
    .get(getInterventions);

module.exports = router;
