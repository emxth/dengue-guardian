// Intervention Controller

const InterventionRecord = require('../models/InterventionRecord');

// @desc    Save a new intervention record
// @route   POST /api/interventions
exports.recordIntervention = async (req, res) => {
    try {
        const newRecord = await InterventionRecord.create(req.body);
        res.status(201).json({ success: true, data: newRecord });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all interventions (optionally filter by zone)
// @route   GET /api/interventions
exports.getInterventions = async (req, res) => {
    try {
        const query = req.query.zoneId ? { zoneId: req.query.zoneId } : {};
        const records = await InterventionRecord.find(query).sort({ dateApplied: -1 });
        res.status(200).json({ success: true, count: records.length, data: records });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
