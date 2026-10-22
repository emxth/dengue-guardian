// Analytics Controller – Server-side MongoDB Aggregations
// Computes high-performance aggregations for prevention intelligence dashboards

const InterventionRecord = require('../models/InterventionRecord');

/**
 * @desc    Get aggregated effectiveness metrics & strategy breakdowns
 * @route   GET /api/analytics/effectiveness
 */
exports.getEffectivenessSummary = async (req, res) => {
    try {
        // 1. Overall stats
        const overallAgg = await InterventionRecord.aggregate([
            {
                $facet: {
                    totalStats: [
                        {
                            $group: {
                                _id: null,
                                totalInterventions: { $sum: 1 },
                                avgInitialScore: { $avg: '$effectivenessScore' },
                            }
                        }
                    ],
                    followUpStats: [
                        {
                            $match: {
                                'followUp.fociDropPercentage': { $exists: true, $ne: null }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalFollowUps: { $sum: 1 },
                                avgFociDrop: { $avg: '$followUp.fociDropPercentage' },
                                avgFollowUpScore: { $avg: '$followUp.score' }
                            }
                        }
                    ],
                    strategyBreakdown: [
                        {
                            $group: {
                                _id: '$tier1MacroStrategy',
                                count: { $sum: 1 },
                                avgScore: { $avg: '$effectivenessScore' },
                                avgDrop: { $avg: '$followUp.fociDropPercentage' }
                            }
                        },
                        { $sort: { count: -1 } }
                    ],
                    ratingBreakdown: [
                        {
                            $match: {
                                'followUp.outcomeRating': { $exists: true, $ne: null }
                            }
                        },
                        {
                            $group: {
                                _id: '$followUp.outcomeRating',
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { count: -1 } }
                    ]
                }
            }
        ]);

        const result = overallAgg[0] || {};
        const totalInfo = result.totalStats?.[0] || { totalInterventions: 0, avgInitialScore: 0 };
        const followUpInfo = result.followUpStats?.[0] || { totalFollowUps: 0, avgFociDrop: 0, avgFollowUpScore: 0 };

        return res.status(200).json({
            success: true,
            data: {
                totalInterventions: totalInfo.totalInterventions,
                totalFollowUps: followUpInfo.totalFollowUps,
                avgInitialScore: Math.round((totalInfo.avgInitialScore || 0) * 10) / 10,
                avgFociDropPercentage: Math.round((followUpInfo.avgFociDrop || 0) * 10) / 10,
                avgFollowUpScore: Math.round((followUpInfo.avgFollowUpScore || 0) * 10) / 10,
                strategyBreakdown: (result.strategyBreakdown || []).map(s => ({
                    strategy: s._id,
                    count: s.count,
                    avgScore: Math.round((s.avgScore || 0) * 10) / 10,
                    avgDrop: s.avgDrop != null ? Math.round(s.avgDrop * 10) / 10 : null
                })),
                ratingBreakdown: result.ratingBreakdown || []
            }
        });
    } catch (error) {
        console.error('[AnalyticsController] getEffectivenessSummary error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc    Get aggregated intervention metrics grouped by geographical zone
 * @route   GET /api/analytics/zone-trends
 */
exports.getZoneTrends = async (req, res) => {
    try {
        const zoneAgg = await InterventionRecord.aggregate([
            {
                $group: {
                    _id: '$zoneId',
                    totalInterventions: { $sum: 1 },
                    completedFollowUps: {
                        $sum: {
                            $cond: [
                                { $ifNull: ['$followUp.fociDropPercentage', false] },
                                1,
                                0
                            ]
                        }
                    },
                    avgScore: { $avg: '$effectivenessScore' },
                    avgDropPct: { $avg: '$followUp.fociDropPercentage' },
                    activePhis: { $addToSet: '$phiId' },
                    latestInterventionDate: { $max: '$dateApplied' }
                }
            },
            {
                $project: {
                    _id: 0,
                    zoneId: '$_id',
                    totalInterventions: 1,
                    completedFollowUps: 1,
                    avgScore: { $round: [{ $ifNull: ['$avgScore', 0] }, 1] },
                    avgDropPct: {
                        $cond: [
                            { $gt: ['$completedFollowUps', 0] },
                            { $round: [{ $ifNull: ['$avgDropPct', 0] }, 1] },
                            null
                        ]
                    },
                    activePhis: 1,
                    latestInterventionDate: 1
                }
            },
            { $sort: { totalInterventions: -1 } }
        ]);

        return res.status(200).json({
            success: true,
            count: zoneAgg.length,
            data: zoneAgg
        });
    } catch (error) {
        console.error('[AnalyticsController] getZoneTrends error:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
};
