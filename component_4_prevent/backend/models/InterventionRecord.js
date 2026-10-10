// InterventionRecord Mongoose Model

const mongoose = require('mongoose');

const interventionSchema = new mongoose.Schema({
    zoneId: { type: String, required: true },
    environmentalContext: {
        temperature: { type: Number, required: true },
        rainfall: { type: Number, required: true },
        mosquitoDensity: { type: Number, required: true },
        breedingSites: { type: Number, required: true }
    },
    tier1MacroStrategy: { type: String, required: true },
    tier2MicroStrategy: { type: String, required: true },
    phiId: { type: String, required: true },
    dateApplied: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InterventionRecord', interventionSchema);
