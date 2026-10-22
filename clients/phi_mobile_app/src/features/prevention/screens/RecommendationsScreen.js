import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { preventionApi } from "../../../shared/api/preventionApi";
import { DengueGuardianColors } from "../../../shared/theme/colors";
import HeaderBar from "../components/HeaderBar";

// Express Backend API Base URL for MongoDB & ML service communication
const API_BASE_URL = "http://localhost:5000/api";

const DEFAULT_ZONE_CONTEXT = {
  temperature: 29.5,
  rainfall: 85.0,
  cumulative_rainfall_14_days: 120.0,
  mosquito_density: 45.0,
  breeding_sites_count: 28,
  wind_speed: 10.0,
};

export default function RecommendationsScreen({ navigation }) {
  const [aiData, setAiData] = useState(null);
  const [latestRecord, setLatestRecord] = useState(null);
  const [zoneContext, setZoneContext] = useState(DEFAULT_ZONE_CONTEXT);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState("");

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch real field records from Backend (MongoDB) using API base URL
      let currentContext = { ...DEFAULT_ZONE_CONTEXT };

      try {
        const historyRes = await axios.get(`${API_BASE_URL}/interventions`, { timeout: 8000 });
        const records = historyRes.data?.data || [];
        if (records.length > 0) {
          const latest = records[0];
          setLatestRecord(latest);

          if (latest.environmentalContext) {
            currentContext = {
              temperature: Number(latest.environmentalContext.temperature ?? DEFAULT_ZONE_CONTEXT.temperature),
              rainfall: Number(latest.environmentalContext.rainfall ?? DEFAULT_ZONE_CONTEXT.rainfall),
              cumulative_rainfall_14_days: Number(
                latest.environmentalContext.cumulativeRainfall14Days ?? DEFAULT_ZONE_CONTEXT.cumulative_rainfall_14_days
              ),
              mosquito_density: Number(
                latest.environmentalContext.mosquitoDensity ?? DEFAULT_ZONE_CONTEXT.mosquito_density
              ),
              breeding_sites_count: Number(
                latest.environmentalContext.breedingSites ?? DEFAULT_ZONE_CONTEXT.breeding_sites_count
              ),
              wind_speed: Number(latest.environmentalContext.windSpeed ?? DEFAULT_ZONE_CONTEXT.wind_speed),
            };
          }
        }
      } catch (historyErr) {
        console.warn("Could not load MongoDB history, falling back to default context:", historyErr.message);
      }

      setZoneContext(currentContext);

      // 2. Fetch AI Recommendations from ML Engine via Express backend using API base URL
      const recRes = await axios.post(`${API_BASE_URL}/recommendations`, currentContext, { timeout: 10000 });
      const data = recRes.data?.data;
      setAiData(data);
      if (data?.top_recommendation?.tier_1_macro) {
        setSelectedStrategyId(data.top_recommendation.tier_1_macro);
      }
    } catch (error) {
      console.error("Error fetching live AI strategy:", error.message);
      setErrorMsg(
        `Could not connect to Express backend (${API_BASE_URL}). Check Wi-Fi connection.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptAndImplement = (strategyItem) => {
    const stratName = strategyItem?.macro_strategy || aiData?.top_recommendation?.tier_1_macro || "Source Reduction";
    navigation.navigate("RecordIntervention", {
      aiData,
      selectedStrategy: stratName,
      strategyDetails: strategyItem,
      zoneContext,
      latestRecord,
    });
  };

  const handleExplainAI = () => {
    navigation.navigate("Rationale", { aiData, zoneContext });
  };

  // Derive risk badge from live entomological mosquito density
  const isHighRisk = zoneContext.mosquito_density >= 30;

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Prevention Recommendations"
        onProfilePress={() =>
          Alert.alert("Officer Profile", "PHI01 • Malabe Range (MOH Kaduwela)")
        }
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
          <Text style={styles.loadingText}>Connecting to XGBoost ML Engine...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={42} color="#DC2626" />
          <Text style={styles.errorTitle}>Connection Failed</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchRecommendations}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.retryButtonText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Administrative Area & Active Alert Card */}
          <View style={styles.areaCard}>
            <View style={styles.areaLeft}>
              <View style={styles.locationIconBox}>
                <Ionicons name="location" size={18} color={DengueGuardianColors.primary} />
              </View>
              <View style={styles.areaTextContainer}>
                <Text style={styles.areaMainText}>
                  {latestRecord?.zoneId
                    ? `Zone: ${latestRecord.zoneId}`
                    : "Thalangama North A (LOC004)"}
                </Text>
                <Text style={styles.areaSubText}>
                  {latestRecord?.phiId
                    ? `Officer: ${latestRecord.phiId} • MOH Kaduwela`
                    : "Malabe Range • MOH Kaduwela"}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.alertBadge,
                !isHighRisk && { backgroundColor: "#FEF3C7" },
              ]}
            >
              <View
                style={[
                  styles.alertDot,
                  !isHighRisk && { backgroundColor: "#D97706" },
                ]}
              />
              <Text
                style={[
                  styles.alertText,
                  !isHighRisk && { color: "#B45309" },
                ]}
              >
                {isHighRisk ? "Active Alert" : "Advisory"}
              </Text>
            </View>
          </View>

          {/* Environmental Telemetry Stats Strip */}
          <View style={styles.statsStrip}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Risk: </Text>
              <Text
                style={[
                  styles.statValue,
                  { color: isHighRisk ? "#DC2626" : "#D97706" },
                ]}
              >
                {isHighRisk ? "High" : "Moderate"}
              </Text>
            </View>
            <Text style={styles.statDivider}>•</Text>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Rainfall: </Text>
              <Text style={[styles.statValue, { color: "#0284C7" }]}>
                {zoneContext.rainfall}mm
              </Text>
            </View>
            <Text style={styles.statDivider}>•</Text>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Larval Sites: </Text>
              <Text style={[styles.statValue, { color: "#DC2626" }]}>
                {zoneContext.breeding_sites_count}
              </Text>
            </View>
          </View>

          {/* Dynamic Strategy Cards mapped directly from ML Engine */}
          {aiData?.ranked_alternatives?.map((strat, index) => {
            const isTopRank = index === 0;
            const rankNum = index + 1;
            const stratTitle = `${rankNum}. ${strat.macro_strategy}`;
            const microDetail =
              strat.micro_strategy && strat.micro_strategy !== "None"
                ? `Action: ${strat.micro_strategy}`
                : isTopRank && aiData.top_recommendation?.application_method
                  ? aiData.top_recommendation.application_method
                  : "Manual Physical Action";

            return (
              <View
                key={`${strat.macro_strategy}-${index}`}
                style={[
                  styles.strategyCard,
                  isTopRank && styles.strategyCardActive,
                ]}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.strategyTitle}>{stratTitle}</Text>
                  <View
                    style={isTopRank ? styles.highBadge : styles.moderateBadge}
                  >
                    <View
                      style={isTopRank ? styles.greenDot : styles.grayDot}
                    />
                    <Text
                      style={
                        isTopRank
                          ? styles.highBadgeText
                          : styles.moderateBadgeText
                      }
                    >
                      {isTopRank ? "Rank #1 Choice" : `Rank #${rankNum}`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.strategySubtitle}>{microDetail}</Text>

                <View style={styles.effectivenessBox}>
                  <Text style={styles.effLabel}>Predicted Effectiveness</Text>
                  <Text
                    style={[
                      styles.effValue,
                      !isTopRank && { color: "#0284C7" },
                    ]}
                  >
                    {strat.predicted_effectiveness}%
                  </Text>
                </View>

                {isTopRank && aiData.top_recommendation?.rationale ? (
                  <View style={styles.bulletRow}>
                    <Ionicons
                      name="shield-checkmark"
                      size={18}
                      color="#0D9488"
                    />
                    <Text style={styles.bulletText}>
                      {aiData.top_recommendation.rationale}
                    </Text>
                  </View>
                ) : null}

                {isTopRank ? (
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => handleAcceptAndImplement(strat)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="shield-checkmark"
                      size={18}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.primaryButtonText}>
                      Accept
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.secondaryOptionButton}
                    onPress={() => {
                      setSelectedStrategyId(strat.macro_strategy);
                      handleAcceptAndImplement(strat);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={16}
                      color={DengueGuardianColors.primary}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.secondaryOptionButtonText}>
                      Select Option
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Bottom Secondary Actions */}
          <View style={styles.bottomActionsRow}>
            <TouchableOpacity
              style={styles.actionChipButton}
              onPress={handleExplainAI}
              activeOpacity={0.8}
            >
              <Ionicons
                name="analytics-outline"
                size={18}
                color={DengueGuardianColors.primary}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.actionChipText}>Explain AI</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionChipButton}
              onPress={fetchRecommendations}
              activeOpacity={0.8}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color={DengueGuardianColors.primary}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.actionChipText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#DC2626",
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  areaCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: DengueGuardianColors.surface,
    borderWidth: 1,
    borderColor: DengueGuardianColors.borderLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    shadowColor: DengueGuardianColors.darkBase,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  areaLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  locationIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: DengueGuardianColors.mintSurface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  areaTextContainer: {
    flex: 1,
  },
  areaMainText: {
    fontSize: 13,
    fontWeight: "700",
    color: DengueGuardianColors.darkBase,
  },
  areaSubText: {
    fontSize: 11,
    color: DengueGuardianColors.textMuted,
    marginTop: 2,
  },
  alertBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  alertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#DC2626",
    marginRight: 6,
  },
  alertText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B91C1C",
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  statValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  statDivider: {
    color: "#94A3B8",
    fontSize: 12,
  },
  strategyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  strategyCardActive: {
    borderColor: DengueGuardianColors.primary,
    borderWidth: 2,
  },
  strategyCardSecondary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  strategyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  highBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DengueGuardianColors.mintSurface,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: DengueGuardianColors.primary,
    marginRight: 5,
  },
  highBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
  },
  moderateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  grayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#64748B",
    marginRight: 5,
  },
  moderateBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  strategySubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 12,
  },
  effectivenessBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  effLabel: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  effValue: {
    fontSize: 14,
    fontWeight: "800",
    color: DengueGuardianColors.primary,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  bulletText: {
    fontSize: 12,
    color: "#334155",
    marginLeft: 8,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: DengueGuardianColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: DengueGuardianColors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  secondaryOptionButton: {
    backgroundColor: DengueGuardianColors.mintSurface,
    borderWidth: 1,
    borderColor: DengueGuardianColors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryOptionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
  },
  bottomActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 12,
  },
  actionChipButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DengueGuardianColors.mintSurface,
    borderWidth: 1,
    borderColor: DengueGuardianColors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  actionChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
  },
  syncedRecordCard: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  syncedRecordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  syncedHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  syncedRecordTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F766E",
    letterSpacing: 0.5,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#CCFBF1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0D9488",
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F766E",
  },
  syncedRecordBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  syncedStrategyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  syncedMetaText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  syncedScoreBadge: {
    backgroundColor: "#0D9488",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  syncedScoreText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
