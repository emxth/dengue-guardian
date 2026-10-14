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
import { preventionApi } from "../../../shared/api/preventionApi";
import HeaderBar from "../components/HeaderBar";

export default function RecommendationsScreen({ navigation }) {
  const [aiData, setAiData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState("");

  // Live telemetry context for PHI's current GPS zone
  const zoneContext = {
    temperature: 29.5,
    rainfall: 85.0,
    cumulative_rainfall_14_days: 120.0,
    mosquito_density: 45.0,
    breeding_sites_count: 28,
    wind_speed: 10.0,
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await preventionApi.getRecommendations(zoneContext);
      setAiData(data);
      if (data?.top_recommendation?.tier_1_macro) {
        setSelectedStrategyId(data.top_recommendation.tier_1_macro);
      }
    } catch (error) {
      console.error("Error fetching live AI strategy:", error.message);
      setErrorMsg(
        "Could not connect to Express backend (http://172.20.10.4:5000/api). Check Wi-Fi connection."
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
        title="Dengue-Guardian"
        showBack={navigation.canGoBack()}
        onBack={() => navigation.goBack()}
        onProfilePress={() =>
          Alert.alert("Officer Profile", "PHI K. Perera • MOH Kaduwela Area A")
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
          {/* Title & Active Alert Badge */}
          <View style={styles.titleRow}>
            <View style={styles.titleTextContainer}>
              <Text style={styles.pageTitle}>Prevention Recommendations</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={14} color="#64748B" />
                <Text style={styles.locationText}>Kaduwela – Area A</Text>
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
                ? `Protocol: ${strat.micro_strategy}`
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
                      Accept & Implement
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
                      color="#1E3A8A"
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
                color="#1E3A8A"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.actionChipText}>Explain AI (XAI)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionChipButton}
              onPress={fetchRecommendations}
              activeOpacity={0.8}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color="#1E3A8A"
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  titleTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  locationText: {
    fontSize: 13,
    color: "#475569",
    marginLeft: 4,
    fontWeight: "500",
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
    borderColor: "#0F172A",
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
    backgroundColor: "#CCFBF1",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0D9488",
    marginRight: 5,
  },
  highBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F766E",
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
    color: "#0D9488",
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
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
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
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryOptionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E3A8A",
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
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  actionChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E3A8A",
  },
});
