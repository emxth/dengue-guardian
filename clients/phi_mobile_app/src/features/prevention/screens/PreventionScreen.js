import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";
import { preventionApi } from "../../../shared/api/preventionApi";

export default function PreventionScreen() {
  const [aiData, setAiData] = useState(null);
  const [isLoadingFetch, setIsLoadingFetch] = useState(true);

  const [breteauIndex, setBreteauIndex] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Fetch real AI data when the screen opens
  useEffect(() => {
    const fetchRealStrategy = async () => {
      try {
        // Simulating the telemetry context for the PHI's current GPS zone
        const zoneContext = {
          temperature: 29.5,
          rainfall: 85.0,
          cumulative_rainfall_14_days: 120.0,
          mosquito_density: 45.0,
          breeding_sites_count: 28,
          wind_speed: 10.0
        };
        const data = await preventionApi.getRecommendations(zoneContext);
        setAiData(data);
      } catch (error) {
        Alert.alert("Connection Error", "Failed to fetch live AI strategy from the backend.");
      } finally {
        setIsLoadingFetch(false);
      }
    };

    fetchRealStrategy();
  }, []);

  // 2. Submit the field officer's intervention log
  const handleDeployPlan = async () => {
    if (!breteauIndex) {
      Alert.alert("Missing Data", "Please enter the Post-Action Breteau Index to update the ML engine.");
      return;
    }

    setIsSubmitting(true);
    try {
      // UPDATED PAYLOAD: This exactly matches your FastAPI 'InterventionRecord' format
      await preventionApi.recordIntervention({
        temperature: 29.5,
        rainfall: 85.0,
        cumulative_rainfall_14_days: 120.0,
        mosquito_density: parseFloat(breteauIndex), // User input from the text box
        breeding_sites_count: 3,
        wind_speed: 10.0,
        intervention_taken: aiData?.top_recommendation?.tier_1_macro || "Source Reduction",
        effectiveness_score: parseFloat(breteauIndex) < 5 ? 90.0 : 45.0,
      });

      Alert.alert(
        "Intervention Logged",
        "Data synced to Dengue Guardian backend. ML engine retraining metrics updated."
      );
      setBreteauIndex("");
    } catch (error) {
      console.error("Sync error:", error);
      Alert.alert("Sync Failed", "Could not connect to the Dengue Guardian backend.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingFetch) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color={DengueGuardianColors.primary} />
        <Text className="mt-4 text-textMuted font-medium">Connecting to AI Engine...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Dynamic AI Strategy Header */}
      <View className="bg-mintSurface border-l-4 border-primary p-4 rounded-xl mb-4 shadow-sm">
        <View className="flex-row items-center mb-1">
          <View className="w-8 h-8 rounded-full bg-accent/40 items-center justify-center mr-2">
            <Ionicons name="shield-checkmark" size={18} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-base font-bold text-darkBase">
            AI Assigned Task
          </Text>
        </View>
        <Text className="mt-1 text-xs text-textMuted leading-relaxed">
          Based on live telemetry, the XGBoost engine requires immediate action in your assigned zone.
        </Text>
      </View>

      {/* Real AI Data Rendered Here */}
      {aiData && (
        <View className="bg-surface border border-secondary rounded-xl p-4 mb-6 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center flex-1 mr-2">
              <Ionicons name="analytics-outline" size={20} color={DengueGuardianColors.primary} />
              <Text className="text-sm font-bold text-darkBase ml-2 flex-1">
                {aiData.top_recommendation.tier_1_macro}
              </Text>
            </View>
            <View className="px-2 py-1 rounded-full bg-mintSurface">
              <Text className="text-[10px] font-bold text-riskCleared">
                {aiData.top_recommendation.predicted_effectiveness}% Match
              </Text>
            </View>
          </View>

          <View className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-textMuted">Micro Strategy:</Text>
              <Text className="text-xs font-semibold text-darkBase">
                {aiData.top_recommendation.tier_2_micro}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-xs text-textMuted">Method:</Text>
              <Text className="text-xs font-semibold text-darkBase">
                {aiData.top_recommendation.application_method}
              </Text>
            </View>
            <View className="mt-2 pt-2 border-t border-slate-200">
              <Text className="text-[11px] text-textMuted italic">
                {aiData.top_recommendation.rationale}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Action Logging Form */}
      <Text className="text-xs font-bold text-darkBase mb-2">
        Continuous Learning Data Sync
      </Text>
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
        <Text className="text-xs text-textMuted mb-2">
          Enter the Post-Intervention Breteau Index (Larval count) to close the data loop.
        </Text>
        <TextInput
          className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-darkBase text-sm"
          placeholder="e.g., 5"
          placeholderTextColor={DengueGuardianColors.textMuted}
          keyboardType="numeric"
          value={breteauIndex}
          onChangeText={setBreteauIndex}
        />
      </View>

      {/* Sync Button */}
      <TouchableOpacity
        onPress={handleDeployPlan}
        disabled={isSubmitting || !aiData}
        className="bg-primary py-3.5 rounded-xl items-center mb-3 shadow-sm active:bg-secondary flex-row justify-center"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
        ) : (
          <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        )}
        <Text className="text-surface font-bold text-base">
          {isSubmitting ? "Syncing..." : "Complete Task & Sync Data"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}