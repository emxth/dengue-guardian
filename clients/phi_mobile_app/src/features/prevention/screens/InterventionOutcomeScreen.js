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
import axios from "axios";
import { preventionApi } from "../../../shared/api/preventionApi";
import { DengueGuardianColors } from "../../../shared/theme/colors";
import HeaderBar from "../components/HeaderBar";

// Express Backend API Base URL for MongoDB communication
const API_BASE_URL = "http://172.20.10.4:5000/api";

export default function InterventionOutcomeScreen({ navigation, route }) {
  const {
    protocol,
    actionTaken,
    breteauIndex,
    initialFoci,
    finalFoci,
    initialBreteau,
    clearedSites,
    savedRecord,
    aiData,
  } = route.params || {};

  const [mongoRecord, setMongoRecord] = useState(savedRecord || null);
  const [outcomeData, setOutcomeData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecordAndOutcome();
  }, []);

  const fetchRecordAndOutcome = async () => {
    setLoading(true);
    try {
      // 1. Fetch live intervention records from MongoDB via API base URL
      let currentRecord = savedRecord || null;
      try {
        const historyRes = await axios.get(`${API_BASE_URL}/interventions`, { timeout: 8000 });
        const records = historyRes.data?.data || [];
        if (records.length > 0) {
          if (savedRecord?._id) {
            currentRecord = records.find((r) => r._id === savedRecord._id) || records[0];
          } else {
            currentRecord = records[0]; // Latest recorded intervention from MongoDB
          }
        }
      } catch (fetchErr) {
        console.warn("Could not load MongoDB record list:", fetchErr.message);
      }

      setMongoRecord(currentRecord);

      // 2. Perform Day-7 follow-up calculation against MongoDB record
      const recordId = currentRecord?._id || savedRecord?._id || "latest";

      // Baseline Initial Foci before intervention (from route params or MongoDB document)
      const recordInitialFoci = (initialFoci !== undefined && !isNaN(Number(initialFoci)) && Number(initialFoci) > 0)
        ? Number(initialFoci)
        : Number(currentRecord?.environmentalContext?.breedingSites ?? currentRecord?.breeding_sites_count ?? 0);

      // Breeding Nodes Neutralized by PHI (from route params)
      const neutralizedCount = (clearedSites !== undefined && !isNaN(Number(clearedSites)) && Number(clearedSites) >= 0)
        ? Number(clearedSites)
        : 0;

      // Post Foci remaining = Initial - Neutralized
      const safePostFoci = (finalFoci !== undefined && finalFoci !== null && !isNaN(Number(finalFoci)))
        ? Math.max(0, Number(finalFoci))
        : Math.max(0, recordInitialFoci - neutralizedCount);

      const recordInitialBreteau = (initialBreteau !== undefined && !isNaN(Number(initialBreteau)) && Number(initialBreteau) > 0)
        ? Number(initialBreteau)
        : Number(currentRecord?.environmentalContext?.mosquitoDensity ?? currentRecord?.mosquito_density ?? 0);

      const safePostBreteau = (breteauIndex !== undefined && breteauIndex !== null && !isNaN(parseFloat(breteauIndex)))
        ? parseFloat(breteauIndex)
        : (currentRecord?.followUp?.postBreteauIndex !== undefined ? Number(currentRecord.followUp.postBreteauIndex) : null);

      const payload = {
        postBreedingFoci: safePostFoci,
        postBreteauIndex: safePostBreteau,
      };

      const followUpRes = await axios.post(`${API_BASE_URL}/interventions/${recordId}/follow-up`, payload, {
        timeout: 10000,
        headers: { "Content-Type": "application/json" },
      });

      if (followUpRes.data?.data) {
        setOutcomeData(followUpRes.data.data);
      }
    } catch (err) {
      console.warn("Could not compute follow-up outcome on backend:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Values received directly from the Node.js Express backend & MongoDB
  const activeProtocol = outcomeData?.protocol || mongoRecord?.tier1MacroStrategy || protocol || "Source Reduction";
  const activeOfficer = mongoRecord?.phiId || "PHI01";
  const activeZone = mongoRecord?.zoneId || "LOC004";
  const activeNotes = mongoRecord?.notes || actionTaken || "Conducted field intervention at designated premises; cleared standing water nodes.";

  // Foci display values: Initial down to Post sites
  // 1. Initial Foci:
  const displayInitialFoci = (initialFoci !== undefined && !isNaN(Number(initialFoci)) && Number(initialFoci) > 0)
    ? Number(initialFoci)
    : (outcomeData?.initialFoci !== undefined && Number(outcomeData.initialFoci) > 0)
      ? Number(outcomeData.initialFoci)
      : Number(mongoRecord?.environmentalContext?.breedingSites ?? mongoRecord?.breeding_sites_count ?? 0);

  // 2. Post Foci:
  const displayPostFoci = (finalFoci !== undefined && finalFoci !== null && !isNaN(Number(finalFoci)))
    ? Number(finalFoci)
    : (clearedSites !== undefined && !isNaN(Number(clearedSites)))
      ? Math.max(0, displayInitialFoci - Number(clearedSites))
      : (outcomeData?.postBreedingFoci !== undefined && !isNaN(Number(outcomeData.postBreedingFoci)))
        ? Number(outcomeData.postBreedingFoci)
        : Math.max(0, displayInitialFoci);

  // Exact public health formula: fociDropPercentage = ((Initial - Post) / Initial) * 100
  const calculatedDrop = displayInitialFoci > 0
    ? Math.round(Math.max(0, ((displayInitialFoci - displayPostFoci) / displayInitialFoci) * 100) * 10) / 10
    : 0;

  // Use backend calculated percentage if available, otherwise dynamically calculated percentage
  const fociDropPct = (outcomeData?.fociDropPercentage !== undefined && outcomeData.fociDropPercentage >= 0)
    ? outcomeData.fociDropPercentage
    : calculatedDrop;

  const hasPostBreteau = (outcomeData?.postBreteauIndex !== undefined && outcomeData?.postBreteauIndex !== null) ||
    (breteauIndex !== undefined && breteauIndex !== null && !isNaN(parseFloat(breteauIndex)));

  const displayPostBreteau = outcomeData?.postBreteauIndex ?? (hasPostBreteau ? parseFloat(breteauIndex) : null);

  const displayInitialBreteau = outcomeData?.initialBreteau ??
    (initialBreteau !== undefined && !isNaN(parseFloat(initialBreteau))
      ? parseFloat(initialBreteau)
      : (mongoRecord?.environmentalContext?.mosquitoDensity ? Number(mongoRecord.environmentalContext.mosquitoDensity) : null));

  const isSafe = displayPostBreteau !== null ? displayPostBreteau <= 10 : true;

  let outcomeRating = outcomeData?.outcomeRating;
  if (!outcomeRating || outcomeRating === "Evaluating...") {
    if (fociDropPct >= 70 && (displayPostBreteau === null || displayPostBreteau <= 15)) {
      outcomeRating = "Excellent";
    } else if (fociDropPct >= 50) {
      outcomeRating = "Good";
    } else if (fociDropPct >= 30) {
      outcomeRating = "Moderate";
    } else {
      outcomeRating = "Needs Review";
    }
  }

  const isExcellent = outcomeRating === "Excellent";
  const dynamicScore = outcomeData?.score !== undefined
    ? outcomeData.score
    : Math.min(98, Math.max(40, Math.round(fociDropPct * 0.65 + (displayPostBreteau !== null ? (displayPostBreteau <= 5 ? 35 : displayPostBreteau <= 15 ? 20 : 10) : 30))));

  const handleSubmitToAdaptiveLearning = () => {
    navigation.navigate("AdaptiveLearning", {
      protocol: activeProtocol,
      breteauIndex: displayPostBreteau ?? 5.0,
      fociDropPct,
      dynamicScore,
      aiData,
    });
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Intervention Outcome"
        onBack={() => navigation.goBack()}
        onProfilePress={() =>
          Alert.alert("Officer Profile", "PHI01 • Malabe Range (MOH Kaduwela)")
        }
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {loading ? (
          <View style={[styles.card, { paddingVertical: 20, alignItems: "center" }]}>
            <ActivityIndicator size="small" color="#0D9488" style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 13, color: "#64748B", fontWeight: "600" }}>
              Computing Day-7 Follow-up Metrics on Backend (MongoDB)...
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
                <Text style={styles.bigStatDark}>
                  {displayPostBreteau !== null
                    ? (typeof displayPostBreteau === "number" ? displayPostBreteau.toFixed(1) : displayPostBreteau)
                    : "Pending"}
                </Text>
                <Text style={styles.metricSubtext}>
                  {displayPostBreteau !== null
                    ? `Down from ${displayInitialBreteau !== null ? (typeof displayInitialBreteau === "number" ? displayInitialBreteau.toFixed(1) : displayInitialBreteau) : "baseline"}`
                    : `Baseline: ${displayInitialBreteau !== null ? (typeof displayInitialBreteau === "number" ? displayInitialBreteau.toFixed(1) : displayInitialBreteau) : "N/A"}`}
                </Text>
                <View style={[styles.safeBadge, displayPostBreteau === null ? { backgroundColor: "#F1F5F9" } : (!isSafe && { backgroundColor: "#FEE2E2" })]}>
                  <Ionicons
                    name={displayPostBreteau === null ? "time-outline" : (isSafe ? "checkmark" : "alert-circle-outline")}
                    size={12}
                    color={displayPostBreteau === null ? "#475569" : (isSafe ? "#0284C7" : "#DC2626")}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.safeBadgeText, displayPostBreteau === null ? { color: "#475569" } : (!isSafe && { color: "#B91C1C" })]}>
                    {displayPostBreteau === null ? "Day 7 Re-Audit" : (isSafe ? "Safe Level" : "Elevated Risk")}
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
                “{activeNotes}”
              </Text>
            </View>

            {/* Outcome Rating Card (directly from backend evaluation) */}
            <View style={styles.ratingCard}>
              <View style={styles.ratingLeft}>
                <View>
                  <Text style={styles.ratingSmallLabel}> OUTCOME RATING</Text>
                  <Text style={styles.ratingLargeText}>Rating: {outcomeRating}</Text>
                </View>
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreBadgeText}>Score {dynamicScore}/100</Text>
              </View>
            </View>

            {/* MongoDB Record Verification Card */}
            {mongoRecord && (
              <View style={styles.verifiedCard}>
                <Ionicons name="shield-checkmark" size={15} color="#0D9488" style={{ marginRight: 6 }} />
                <Text style={styles.verifiedText}>
                  MongoDB Doc: {mongoRecord._id ? `${mongoRecord._id.slice(-8)}` : "Verified"} • Status: {mongoRecord.status || "Completed"}
                </Text>
              </View>
            )}
          </>
        )}


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
            Proceed
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
    backgroundColor: DengueGuardianColors.mintSurface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DengueGuardianColors.accent,
  },
  topInfoText: {
    fontSize: 12,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
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
    backgroundColor: DengueGuardianColors.mintSurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
    fontFamily: "monospace",
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
  verifiedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
  },
  verifiedText: {
    fontSize: 11,
    color: "#0F766E",
    fontWeight: "700",
  },
});
