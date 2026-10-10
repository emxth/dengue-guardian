// FollowUpOutcome Mongoose Model

const mongoose = require('mongoose');

const outcomeSchema = new mongoose.Schema({
    interventionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InterventionRecord',
        required: true
    },
    entomologicalDrop: { type: Number, required: true }, // % drop in mosquitoes
    effectivenessScore: { type: Number, required: true }, // Calculated score (0-100)
    followUpDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FollowUpOutcome', outcomeSchema);
