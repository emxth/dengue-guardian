// InterventionRecord Mongoose Model
// Centralised operational store for PHI field interventions

const mongoose = require('mongoose');

const interventionSchema = new mongoose.Schema({
    zoneId: { type: String, default: 'ZONE-COLOMBO-01' },
    phiId: { type: String, default: 'PHI-OFFICER-01' },
    tier1MacroStrategy: { type: String, required: true },
    tier2MicroStrategy: { type: String, default: 'None' },
    status: { type: String, default: 'Completed' },
    notes: { type: String, default: '' },
    environmentalContext: {
        temperature: { type: Number, default: 29.0 },
        rainfall: { type: Number, default: 80.0 },
        cumulativeRainfall14Days: { type: Number, default: 100.0 },
        windSpeed: { type: Number, default: 10.0 },
        mosquitoDensity: { type: Number, default: 40.0 },
        breedingSites: { type: Number, default: 15 }
    },
    effectivenessScore: { type: Number, default: 75.0 },
    dateApplied: { type: Date, default: Date.now },
    followUp: {
        date: { type: Date, default: Date.now },
        postBreedingFoci: { type: Number },
        postBreteauIndex: { type: Number },
        fociDropPercentage: { type: Number },
        outcomeRating: { type: String },
        score: { type: Number }
    }
});

module.exports = mongoose.model('InterventionRecord', interventionSchema);
