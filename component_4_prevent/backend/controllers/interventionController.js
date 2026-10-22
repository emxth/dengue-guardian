// Intervention Controller
// Saves PHI intervention records to MongoDB and syncs them to FastAPI continual learning

const axios = require('axios');
const mongoose = require('mongoose');
const InterventionRecord = require('../models/InterventionRecord');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Helper: parse number with fallback
const toNum = (val, fallback) => {
    const p = parseFloat(val);
    return isNaN(p) ? fallback : p;
};

// ─── Normalise incoming payload for MongoDB and ML Engine ────────────────────
const normalizePayload = (body) => {
    const env = body.environmentalContext || {};

    const temperature = toNum(env.temperature ?? body.temperature, 29.0);
    const rainfall = toNum(env.rainfall ?? body.rainfall, 80.0);
    const cumulativeRainfall = toNum(
        env.cumulativeRainfall14Days ?? body.cumulative_rainfall_14_days ?? body.cumulativeRainfall,
        100.0
    );
    const windSpeed = toNum(env.windSpeed ?? body.wind_speed ?? body.windSpeed, 10.0);
    const mosquitoDensity = toNum(env.mosquitoDensity ?? body.mosquito_density ?? body.mosquitoDensity, 40.0);
    const breedingSites = Math.round(
        toNum(env.breedingSites ?? body.breeding_sites_count ?? body.breedingSites, 15)
    );

    // Parse macro / micro strategies
    let macro = body.tier1MacroStrategy;
    let micro = body.tier2MicroStrategy;

    if (!macro && body.intervention_taken) {
        const parts = body.intervention_taken.split(' - ');
        macro = parts[0]?.trim() || 'Source Reduction';
        micro = parts[1]?.trim() || 'None';
    }
    macro = macro || 'Source Reduction';
    micro = micro || 'None';

    // Normalise effectiveness score to 0-100 scale
    let effScore = toNum(body.effectivenessScore ?? body.effectiveness_score, 75.0);
    if (effScore <= 1.0) {
        effScore = Math.round(effScore * 100 * 100) / 100; // e.g. 0.85 -> 85
    }

    const mongoDoc = {
        zoneId: body.zoneId || 'ZONE-COLOMBO-01',
        phiId: body.phiId || 'PHI-OFFICER-01',
        tier1MacroStrategy: macro,
        tier2MicroStrategy: micro,
        status: body.status || 'Completed',
        notes: body.notes || '',
        environmentalContext: {
            temperature,
            rainfall,
            cumulativeRainfall14Days: cumulativeRainfall,
            windSpeed,
            mosquitoDensity,
            breedingSites
        },
        effectivenessScore: effScore
    };

    const mlPayload = {
        temperature,
        rainfall,
        cumulative_rainfall_14_days: cumulativeRainfall,
        mosquito_density: mosquitoDensity,
        breeding_sites_count: breedingSites,
        wind_speed: windSpeed,
        intervention_taken: `${macro} - ${micro}`,
        effectiveness_score: effScore
    };

    return { mongoDoc, mlPayload };
};

// ─── Controller Methods ──────────────────────────────────────────────────────

// @desc    Save a new PHI intervention record to MongoDB + push to ML pipeline
// @route   POST /api/interventions
exports.recordIntervention = async (req, res) => {
    try {
        const { mongoDoc, mlPayload } = normalizePayload(req.body);

        // 1. Persist to MongoDB (primary operational database)
        const savedRecord = await InterventionRecord.create(mongoDoc);

        // 2. Forward to FastAPI continual learning (fire-and-forget, non-blocking)
        axios.post(`${ML_SERVICE_URL}/record-intervention`, mlPayload, { timeout: 8000 })
            .then(() => console.log('[InterventionController] ML continual learning sync: OK'))
            .catch((err) => console.warn(
                '[InterventionController] ML sync warning (non-fatal):',
                err.message
            ));

        return res.status(201).json({
            success: true,
            message: 'Intervention recorded and synced for continual learning',
            data: savedRecord
        });

    } catch (error) {
        console.error('[InterventionController] recordIntervention error:', error.message);
        return res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all interventions (optionally filter by zone, with dynamic limit/pagination)
// @route   GET /api/interventions
exports.getInterventions = async (req, res) => {
    try {
        const query = req.query.zoneId ? { zoneId: req.query.zoneId } : {};
        const limit = req.query.limit !== undefined ? parseInt(req.query.limit, 10) : 1000;
        const page = parseInt(req.query.page, 10) || 1;
        const skip = (page - 1) * (limit > 0 ? limit : 0);

        let mongoQuery = InterventionRecord.find(query).sort({ dateApplied: -1 });
        if (skip > 0) mongoQuery = mongoQuery.skip(skip);
        if (limit > 0) mongoQuery = mongoQuery.limit(limit);

        const records = await mongoQuery;
        const total = await InterventionRecord.countDocuments(query);

        return res.status(200).json({ 
            success: true, 
            count: records.length, 
            total,
            page,
            data: records 
        });
    } catch (error) {
        console.error('[InterventionController] getInterventions error:', error.message);
        return res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Record Day-7 follow-up outcome & compute drops/ratings server-side
// @route   POST /api/interventions/:id/follow-up
exports.recordFollowUp = async (req, res) => {
    try {
        const { id } = req.params;
        const { postBreedingFoci, postBreteauIndex } = req.body;

        let record = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            record = await InterventionRecord.findById(id);
        }
        if (!record) {
            // Fallback to the latest intervention record in MongoDB
            record = await InterventionRecord.findOne().sort({ dateApplied: -1 });
        }

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'Intervention record not found'
            });
        }

        const initialFoci = record.environmentalContext?.breedingSites || 15;
        const initialBreteau = record.environmentalContext?.mosquitoDensity || 40.0;

        const postFoci = parseFloat(postBreedingFoci ?? 0);
        const postBreteau = parseFloat(postBreteauIndex ?? 0);

        // Server-side calculation using the formula: ((initialFoci - postBreedingFoci) / initialFoci) * 100
        const fociDropPercentage = initialFoci > 0
            ? Math.round(Math.max(0, ((initialFoci - postFoci) / initialFoci) * 100) * 10) / 10
            : 0;

        // Determine outcomeRating based on drop percentage and safe Breteau level
        let outcomeRating = 'Moderate';
        if (fociDropPercentage >= 70 && postBreteau <= 15) {
            outcomeRating = 'Excellent';
        } else if (fociDropPercentage >= 50) {
            outcomeRating = 'Good';
        } else if (fociDropPercentage >= 30) {
            outcomeRating = 'Moderate';
        } else {
            outcomeRating = 'Needs Review';
        }

        const score = Math.min(
            98,
            Math.max(40, Math.round(fociDropPercentage * 0.65 + (postBreteau <= 5 ? 35 : postBreteau <= 15 ? 20 : 10)))
        );

        // Update record with follow-up metadata
        record.followUp = {
            date: new Date(),
            postBreedingFoci: postFoci,
            postBreteauIndex: postBreteau,
            fociDropPercentage,
            outcomeRating,
            score
        };
        await record.save();

        return res.status(200).json({
            success: true,
            data: {
                interventionId: record._id,
                protocol: record.tier1MacroStrategy,
                initialFoci,
                postBreedingFoci: postFoci,
                fociDropPercentage,
                initialBreteau,
                postBreteauIndex: postBreteau,
                outcomeRating,
                score,
                isExcellent: outcomeRating === 'Excellent',
                isSafe: postBreteau <= 10,
                updatedRecord: record
            }
        });
    } catch (error) {
        console.error('[InterventionController] recordFollowUp error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};
