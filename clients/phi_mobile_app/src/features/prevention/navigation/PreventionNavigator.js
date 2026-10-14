import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import RecommendationsScreen from "../screens/RecommendationsScreen";
import RationaleScreen from "../screens/RationaleScreen";
import RecordInterventionScreen from "../screens/RecordInterventionScreen";
import InterventionOutcomeScreen from "../screens/InterventionOutcomeScreen";
import AdaptiveLearningScreen from "../screens/AdaptiveLearningScreen";

const Stack = createNativeStackNavigator();

export default function PreventionNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Recommendations"
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        contentStyle: { backgroundColor: "#F8FAFC" },
      }}
    >
      <Stack.Screen
        name="Recommendations"
        component={RecommendationsScreen}
        options={{ title: "Recommendations" }}
      />
      <Stack.Screen
        name="Rationale"
        component={RationaleScreen}
        options={{ title: "AI Rationale" }}
      />
      <Stack.Screen
        name="RecordIntervention"
        component={RecordInterventionScreen}
        options={{ title: "Record Intervention" }}
      />
      <Stack.Screen
        name="InterventionOutcome"
        component={InterventionOutcomeScreen}
        options={{ title: "Intervention Outcome" }}
      />
      <Stack.Screen
        name="AdaptiveLearning"
        component={AdaptiveLearningScreen}
        options={{ title: "Adaptive Learning" }}
      />
    </Stack.Navigator>
  );
}
