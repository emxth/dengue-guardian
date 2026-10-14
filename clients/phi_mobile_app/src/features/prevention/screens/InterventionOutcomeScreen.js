import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { preventionApi } from "../../../shared/api/preventionApi";
import HeaderBar from "../components/HeaderBar";

export default function InterventionOutcomeScreen({ navigation, route }) {
  const {
    protocol = "Source Reduction",
    actionTaken = "Conducted breeding site clearance at designated premises.",
    breteauIndex = 5.0,
    initialFoci = 28,
    finalFoci = 12,
    initialBreteau = 45.0,
    savedRecord,
    aiData,
  } = route.params || {};

  const [recentInterventions, setRecentInterventions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [outcomeData, setOutcomeData] = useState(null);
  const [submittingOutcome, setSubmittingOutcome] = useState(true);

  useEffect(() => {
    fetchHistory();
    syncFollowUpToBackend();
  }, []);

  const syncFollowUpToBackend = async () => {
    setSubmittingOutcome(true);
    try {
      const interventionId = savedRecord?._id || "latest";
      const payload = {
        postBreedingFoci: finalFoci,
        postBreteauIndex: breteauIndex,
      };
      const response = await preventionApi.submitFollowUp(interventionId, payload);
      if (response?.data) {
        setOutcomeData(response.data);
      }
    } catch (err) {
      console.warn("Could not submit follow-up to backend:", err.message);
    } finally {
      setSubmittingOutcome(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await preventionApi.getInterventions();
      if (response?.data) {
        setRecentInterventions(response.data.slice(0, 3));
      }
    } catch (err) {
      console.warn("Could not load past interventions history:", err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Values received directly from the Node.js Express backend calculation
  const fociDropPct = outcomeData?.fociDropPercentage ?? 0;
  const outcomeRating = outcomeData?.outcomeRating ?? "Evaluating...";
  const dynamicScore = outcomeData?.score ?? 0;
  const isExcellent = outcomeData ? outcomeData.isExcellent : false;
  const isSafe = outcomeData ? outcomeData.isSafe : parseFloat(breteauIndex) <= 10;
  const displayPostBreteau = outcomeData?.postBreteauIndex ?? parseFloat(breteauIndex) ?? 5.0;
  const displayInitialBreteau = outcomeData?.initialBreteau ?? parseFloat(initialBreteau) ?? 45.0;
  const displayInitialFoci = outcomeData?.initialFoci ?? initialFoci ?? 28;
  const displayPostFoci = outcomeData?.postBreedingFoci ?? finalFoci ?? 12;

  const handleSubmitToAdaptiveLearning = () => {
    navigation.navigate("AdaptiveLearning", {
      protocol,
      breteauIndex: displayPostBreteau,
      fociDropPct,
      dynamicScore,
      aiData,
    });
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="DENGUE-GUARDIAN"
        subtitle="Intervention Outcome"
        onBack={() => navigation.goBack()}
        onProfilePress={() =>
          Alert.alert("Officer Profile", "PHI Bandara • MOH Kaduwela Area A")
        }
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Sub-header area */}
        <Text style={styles.subHeaderText}>
          Intervention Synced • Operational Verification
        </Text>

        {/* Top Info Banner */}
        <View style={styles.topInfoBanner}>
          <Ionicons
            name="cloud-done-outline"
            size={18}
            color="#1E40AF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.topInfoText}>
            Logged to MongoDB: {protocol} by PHI Bandara
          </Text>
        </View>

        {submittingOutcome ? (
          <View style={[styles.card, { paddingVertical: 20, alignItems: "center" }]}>
            <ActivityIndicator size="small" color="#0D9488" style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 13, color: "#64748B", fontWeight: "600" }}>
              Computing Day-7 Follow-up Metrics on Backend...
            </Text>
          </View>
        ) : (
          <>
            {/* Two Metric Cards Side-by-Side */}
            <View style={styles.metricRow}>
              {/* Card 1: Breeding Foci Drop (calculated by Express backend) */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardHeader}>
                  <Text style={styles.metricTitle}>BREEDING FOCI</Text>
                  <Ionicons name="arrow-down-outline" size={16} color="#0D9488" />
                </View>
                <Text style={styles.bigStatGreen}>{fociDropPct}% Drop</Text>
                <Text style={styles.metricSubtext}>
                  {displayInitialFoci} down to {displayPostFoci} sites
                </Text>
                <View style={[styles.outcomeBadge, !isExcellent && { backgroundColor: "#FEF3C7" }]}>
                  <View style={[styles.outcomeDot, !isExcellent && { backgroundColor: "#D97706" }]} />
                  <Text style={[styles.outcomeBadgeText, !isExcellent && { color: "#B45309" }]}>
                    Outcome: {outcomeRating}
                  </Text>
                </View>
              </View>

              {/* Card 2: Breteau Index */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardHeader}>
                  <Text style={styles.metricTitle}>BRETEAU INDEX</Text>
                  <Ionicons name="trending-down-outline" size={16} color="#0F172A" />
                </View>
                <Text style={styles.bigStatDark}>{displayPostBreteau.toFixed(1)}</Text>
                <Text style={styles.metricSubtext}>Down from {displayInitialBreteau.toFixed(1)}</Text>
                <View style={[styles.safeBadge, !isSafe && { backgroundColor: "#FEE2E2" }]}>
                  <Ionicons
                    name={isSafe ? "checkmark" : "alert-circle-outline"}
                    size={12}
                    color={isSafe ? "#0284C7" : "#DC2626"}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.safeBadgeText, !isSafe && { color: "#B91C1C" }]}>
                    {isSafe ? "Safe Level" : "Elevated Risk"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Field Observation Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Ionicons
                  name="checkbox-outline"
                  size={16}
                  color="#0F172A"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.sectionHeader}>FIELD OBSERVATION</Text>
              </View>
              <Text style={styles.observationQuote}>
                “{actionTaken || "Perimeter tyres removed; remaining water drained."}”
              </Text>
            </View>

            {/* Outcome Rating Card (directly from backend evaluation) */}
            <View style={styles.ratingCard}>
              <View style={styles.ratingLeft}>
                <View style={styles.sparkleBox}>
                  <Ionicons name="sparkles" size={18} color="#0284C7" />
                </View>
                <View>
                  <Text style={styles.ratingSmallLabel}>BACKEND OUTCOME RATING</Text>
                  <Text style={styles.ratingLargeText}>Rating: {outcomeRating}</Text>
                </View>
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreBadgeText}>Score {dynamicScore}/100</Text>
              </View>
            </View>
          </>
        )}

        {/* Real MongoDB Interventions History */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="file-tray-full-outline" size={16} color="#0F172A" style={{ marginRight: 6 }} />
            <Text style={styles.sectionHeader}>ZONE INTERVENTION LOGS (MONGODB)</Text>
          </View>
          {loadingHistory ? (
            <ActivityIndicator size="small" color="#0D9488" style={{ marginVertical: 8 }} />
          ) : recentInterventions.length > 0 ? (
            recentInterventions.map((item, idx) => (
              <View key={item._id || idx} style={styles.historyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>
                    {item.tier1MacroStrategy} {item.tier2MicroStrategy && item.tier2MicroStrategy !== "None" ? `(${item.tier2MicroStrategy})` : ""}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(item.dateApplied).toLocaleDateString()} • {item.phiId || "PHI-OFFICER"}
                  </Text>
                </View>
                <View style={styles.historyBadge}>
                  <Text style={styles.historyBadgeText}>Score {item.effectivenessScore || 80}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.historySub}>Record successfully persisted in operational database.</Text>
          )}
        </View>

        {/* Submit to Adaptive Learning Primary Button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSubmitToAdaptiveLearning}
          activeOpacity={0.85}
        >
          <Ionicons
            name="sync-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryButtonText}>
            Proceed to Model Diagnostics
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  subHeaderText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 12,
  },
  topInfoBanner: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  topInfoText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
    fontFamily: "monospace",
    flex: 1,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  metricCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricTitle: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.6,
  },
  bigStatGreen: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F766E",
    marginTop: 8,
    marginBottom: 2,
  },
  bigStatDark: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 8,
    marginBottom: 2,
  },
  metricSubtext: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 10,
  },
  outcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#CCFBF1",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  outcomeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0D9488",
    marginRight: 5,
  },
  outcomeBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#0F766E",
  },
  safeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  safeBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#0284C7",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionHeader: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.8,
  },
  observationQuote: {
    fontSize: 13,
    color: "#1E293B",
    fontStyle: "italic",
    lineHeight: 20,
  },
  ratingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  ratingLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  sparkleBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  ratingSmallLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.6,
  },
  ratingLargeText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 1,
  },
  scoreBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
    fontFamily: "monospace",
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
  },
  historyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  historyDate: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  historyBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
  },
  historySub: {
    fontSize: 12,
    color: "#64748B",
    fontStyle: "italic",
    marginTop: 4,
  },
});
