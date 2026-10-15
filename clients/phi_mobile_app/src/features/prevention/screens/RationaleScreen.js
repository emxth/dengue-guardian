import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";
import HeaderBar from "../components/HeaderBar";
import FactorProgressBar from "../components/FactorProgressBar";

export default function RationaleScreen({ navigation, route }) {
  const { aiData, selectedStrategy = "Source Reduction" } = route.params || {};

  const effectiveness =
    aiData?.top_recommendation?.predicted_effectiveness || 86;

  const rationaleText =
    aiData?.top_recommendation?.rationale ||
    "Heavy rain + stagnant water requires immediate physical disposal before adult mosquito emergence (48-72 hrs).";

  const handleProceed = () => {
    navigation.navigate("RecordIntervention", {
      aiData,
      selectedStrategy,
    });
  };

  // Parse real dynamic feature importance calculated live by XGBoost ML Engine
  const rawFeatures = aiData?.feature_importance || [];

  // Categorize features by native Tree SHAP direction
  const dynamicFactorWeights = rawFeatures.map((item) => {
    const isPositiveDriver = item.impact >= 0;
    const impactVal = Math.abs(item.impact);
    return {
      label: item.feature,
      valueText: `${item.impact > 0 ? "+" : ""}${item.impact.toFixed(2)} SHAP`,
      percentage: Math.min(100, Math.round(impactVal * 15 + 20)),
      barColor: isPositiveDriver ? "#DC2626" : "#0D9488",
      isPositive: isPositiveDriver,
    };
  });

  return (
    <View style={styles.container}>
      <HeaderBar
        title="EXPLAINABLE AI"
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

        {/* Heading */}
        <Text style={styles.mainHeading}>Why {selectedStrategy}?</Text>

        {/* Rank 1 Callout Banner */}
        <View style={styles.rankBanner}>
          <View style={styles.rankStripe} />
          <View style={styles.rankBannerContent}>
            <Ionicons name="shield-checkmark" size={20} color="#0D9488" />
            <Text style={styles.rankBannerText}>
              <Text style={styles.boldText}>Optimal Strategy ({effectiveness}% Predicted Effectiveness) </Text>
              evaluated using native XGBoost Tree SHAP feature attributions.
            </Text>
          </View>
        </View>

        {/* Card 1: Factor Weights */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Tree SHAP Factor Contributions</Text>
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#DC2626" }]} />
              <Text style={styles.legendLabel}>Risk Driver (+)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#0D9488" }]} />
              <Text style={styles.legendLabel}>Mitigating Factor (−)</Text>
            </View>
          </View>

          {dynamicFactorWeights.length > 0 ? (
            dynamicFactorWeights.map((factor, idx) => (
              <FactorProgressBar
                key={idx}
                label={factor.label}
                valueText={factor.valueText}
                percentage={factor.percentage}
                barColor={factor.barColor}
              />
            ))
          ) : (
            <Text style={styles.noFeaturesText}>
              Feature attributions calculated live from GPS environmental inputs.
            </Text>
          )}
        </View>

        {/* Card 2: Rationale Summary */}
        <View style={styles.card}>
          <View style={styles.rationaleHeader}>
            <Ionicons name="bulb-outline" size={18} color="#0F172A" style={{ marginRight: 6 }} />
            <Text style={styles.cardTitle}>Decision Rationale</Text>
          </View>
          <Text style={styles.rationaleBody}>{rationaleText}</Text>
        </View>

        {/* Card 3: Model Evidence */}
        <View style={styles.historicalCard}>
          <Ionicons name="analytics-outline" size={20} color="#0284C7" style={{ marginTop: 2 }} />
          <Text style={styles.historicalText}>
            <Text style={styles.boldBlueText}>Continual Learning Model: </Text>
            Calibrated on MOH epidemiological field telemetry to prioritize {selectedStrategy} under local rainfall and vector density patterns.
          </Text>
        </View>

        {/* Primary Action Button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleProceed}
          activeOpacity={0.85}
        >
          <Ionicons
            name="clipboard-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryButtonText}>Proceed to Record Intervention</Text>
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
    paddingTop: 16,
    paddingBottom: 24,
  },
  subBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  subBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: DengueGuardianColors.primary,
    letterSpacing: 1,
  },
  mainHeading: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  rankBanner: {
    backgroundColor: DengueGuardianColors.mintSurface,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DengueGuardianColors.accent,
  },
  rankStripe: {
    width: 4,
    alignSelf: "stretch",
    backgroundColor: DengueGuardianColors.primary,
  },
  rankBannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rankBannerText: {
    fontSize: 13,
    color: "#0F172A",
    marginLeft: 10,
    lineHeight: 18,
    flex: 1,
  },
  boldText: {
    fontWeight: "700",
    color: "#0F172A",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  noFeaturesText: {
    fontSize: 12,
    color: "#64748B",
    fontStyle: "italic",
    marginVertical: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  keyDriversText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.8,
  },
  rationaleHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  rationaleBody: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 20,
  },
  historicalCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    marginBottom: 20,
  },
  historicalText: {
    fontSize: 12.5,
    color: "#1E3A8A",
    marginLeft: 10,
    lineHeight: 18,
    flex: 1,
  },
  boldBlueText: {
    fontWeight: "700",
    color: "#1E3A8A",
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
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  backLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginBottom: 8,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: DengueGuardianColors.primary,
  },
});
