import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";
import { fetchLatestRiskAssessment } from "../../../shared/api/edgeApiClient";

export default function PHIDashboardScreen({ navigation }) {
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Polls the edge node API for the latest decision fusion JSON
  const loadData = async () => {
    const data = await fetchLatestRiskAssessment();
    if (data) {
      setTelemetry(data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
    // Refresh telemetry every 5 seconds for the live physical deployment demo
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Loading State while making the initial network request to the Pi
  if (loading) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color={DengueGuardianColors.primary} />
        <Text className="text-sm font-medium text-textMuted mt-3">
          Connecting to Edge Sensor Node...
        </Text>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // DATA MAPPING
  // Directly mapped to the flat TelemetryRecord schema from schemas.py
  // Fallbacks are included to prevent app crashes if fields are temporarily null
  // ---------------------------------------------------------------------------
  const temperature = telemetry?.temperature ?? 0.0;
  const humidity = telemetry?.humidity ?? 0.0;
  const rainfall = telemetry?.rainfall_mm ?? 0.0;
  
  // Convert risk level to uppercase (e.g., "High" -> "HIGH")
  const riskTier = (telemetry?.risk_level ?? "Pending").toUpperCase();
  
  // Final combined risk score (0.0 to 1.0)
  const riskScore = telemetry?.environmental_breeding_risk ?? 0.0;
  
  // Weather suitability score (0.0 to 1.0)
  const weatherSuitability = telemetry?.weather_risk_score ?? 0.0;

  // Calculate object count from the 'objects' Pydantic model returned by YOLO
  const objectsDict = telemetry?.objects || {};
  const totalObjects = Object.values(objectsDict).reduce(
    (sum, count) => sum + (Number(count) || 0), 0
  );

  // Helper boolean to trigger red/alert UI themes
  const isHighRisk = riskTier === "HIGH";

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header Profile Section */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-black text-darkBase tracking-tight">
            Good Morning, PHI
          </Text>
          <Text className="text-xs text-textMuted mt-0.5">
            Environmental Surveillance Overview
          </Text>
        </View>
        <View className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 items-center justify-center overflow-hidden">
          <Ionicons name="person" size={20} color={DengueGuardianColors.textMuted} />
        </View>
      </View>

      {/* Edge Node Online Status Pill */}
      <View className="flex-row items-center justify-between bg-surface border border-slate-200 rounded-xl px-4 py-2.5 mb-4 shadow-sm">
        <View className="flex-row items-center">
          <View className="w-2.5 h-2.5 rounded-full bg-riskCleared mr-2" />
          <Text className="text-xs font-semibold text-darkBase">
            System Status: Active (RPi-4)
          </Text>
        </View>
        <Text className="text-[11px] font-mono text-textMuted">
          {telemetry?.latitude ? `${Number(telemetry.latitude).toFixed(4)}° N, ${Number(telemetry.longitude).toFixed(4)}° E` : "Awaiting GPS..."}
        </Text>
      </View>

      {/* Main Breeding Risk Banner Card */}
      <View className="bg-surface border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm relative overflow-hidden">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-[11px] font-black tracking-wider text-textMuted">
            CURRENT BREEDING RISK
          </Text>
          {isHighRisk && (
            <View className="flex-row items-center bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              <Ionicons name="warning-outline" size={12} color={DengueGuardianColors.riskHigh} />
              <Text className="text-[10px] font-bold text-riskHigh ml-1">Alert</Text>
            </View>
          )}
        </View>

        <Text
          className="text-4xl font-black tracking-tight my-1"
          style={{
            color: isHighRisk ? DengueGuardianColors.riskHigh : DengueGuardianColors.riskCleared,
          }}
        >
          {riskTier}
        </Text>

        {/* Horizontal Risk Bar Indicator relative to riskScore 0.0 - 1.0 */}
        <View className="w-full bg-slate-100 h-2.5 rounded-full mt-3 overflow-hidden">
          <View
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(5, riskScore * 100))}%`,
              backgroundColor: isHighRisk ? DengueGuardianColors.riskHigh : DengueGuardianColors.riskCleared,
            }}
          />
        </View>
      </View>

      {/* Environmental Metrics Grid (Temp, Hum, Rain) */}
      <View className="flex-row justify-between mb-4">
        <View className="flex-1 bg-surface border border-slate-200 rounded-xl p-3 mr-2 items-center shadow-sm">
          <View className="w-7 h-7 rounded-full bg-mintSurface items-center justify-center mb-1">
            <Ionicons name="thermometer-outline" size={15} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-base font-bold text-darkBase">
            {Number(temperature).toFixed(1)}°C
          </Text>
          <Text className="text-[11px] text-textMuted mt-1">Temp</Text>
        </View>

        <View className="flex-1 bg-surface border border-slate-200 rounded-xl p-3 mr-2 items-center shadow-sm">
          <View className="w-7 h-7 rounded-full bg-mintSurface items-center justify-center mb-1">
            <Ionicons name="water-outline" size={15} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-base font-bold text-darkBase">
            {Number(humidity).toFixed(0)}%
          </Text>
          <Text className="text-[11px] text-textMuted mt-1">Humidity</Text>
        </View>

        <View className="flex-1 bg-surface border border-slate-200 rounded-xl p-3 items-center shadow-sm">
          <View className="w-7 h-7 rounded-full bg-mintSurface items-center justify-center mb-1">
            <Ionicons name="rainy-outline" size={15} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-base font-bold text-darkBase">
            {Number(rainfall).toFixed(2)}mm
          </Text>
          <Text className="text-[11px] text-textMuted mt-1">Rainfall</Text>
        </View>
      </View>

      {/* AI Assessment Summary Card */}
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
        <View className="flex-row items-center mb-3">
          <View className="w-7 h-7 rounded-full bg-mintSurface items-center justify-center mr-2">
            <Ionicons name="hardware-chip-outline" size={15} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-sm font-bold text-darkBase">
            AI Assessment
          </Text>
        </View>

        <View className="flex-row items-center justify-between py-2 border-b border-slate-100">
          <View className="flex-row items-center">
            <Ionicons name="cloudy-outline" size={14} color="#64748B" />
            <Text className="text-xs text-textMuted ml-2">Weather Risk</Text>
          </View>
          <Text className="text-xs font-bold text-darkBase">
            {(weatherSuitability * 100).toFixed(1)}% ({weatherSuitability > 0.6 ? "High" : "Moderate"})
          </Text>
        </View>

        <View className="flex-row items-center justify-between py-2 border-b border-slate-100">
          <View className="flex-row items-center">
            <Ionicons name="eye-outline" size={14} color="#64748B" />
            <Text className="text-xs text-textMuted ml-2">Detected Objects</Text>
          </View>
          <Text className="text-xs font-bold text-darkBase">
            {totalObjects}
          </Text>
        </View>

        <View className="flex-row items-center justify-between pt-2">
          <View className="flex-row items-center">
            <Ionicons name="shield-checkmark-outline" size={14} color="#64748B" />
            <Text className="text-xs text-textMuted ml-2">Overall Risk</Text>
          </View>
          <Text
            className="text-xs font-black"
            style={{
              color: isHighRisk ? DengueGuardianColors.riskHigh : DengueGuardianColors.riskCleared,
            }}
          >
            {riskTier}
          </Text>
        </View>
      </View>

      {/* Transition Button for passing 'telemetry' object down to the detail screen */}
      <TouchableOpacity
        onPress={() => navigation?.navigate("RiskDetailScreen", { telemetry })}
        className="bg-primary py-3.5 rounded-xl items-center shadow-sm active:bg-secondary flex-row justify-center"
      >
        <Ionicons name="analytics-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text className="text-white font-bold text-sm">
          Inspect Detection Evidence
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}