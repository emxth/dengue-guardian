import React from "react";
import PreventionNavigator from "../navigation/PreventionNavigator";

/**
 * PreventionScreen serves as the entry-point component for the Prevention feature tab,
 * wrapping the full 5-screen navigation flow:
 * 1. RecommendationsScreen
 * 2. RationaleScreen
 * 3. RecordInterventionScreen
 * 4. InterventionOutcomeScreen
 * 5. AdaptiveLearningScreen
 */
export default function PreventionScreen() {
  return <PreventionNavigator />;
}