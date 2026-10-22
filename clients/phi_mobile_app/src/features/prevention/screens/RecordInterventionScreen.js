import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { preventionApi } from "../../../shared/api/preventionApi";
import { DengueGuardianColors } from "../../../shared/theme/colors";
import HeaderBar from "../components/HeaderBar";

// Express Backend API Base URL for MongoDB & ML service communication
const API_BASE_URL = "http://localhost:5000/api";

export default function RecordInterventionScreen({ navigation, route }) {
  const {
    aiData,
    selectedStrategy = "Source Reduction",
    zoneContext = {},
    strategyDetails = {},
    latestRecord,
  } = route.params || {};

  // Dynamically derive available protocols from ML engine ranked alternatives
  const rawProtocols = (aiData?.ranked_alternatives || []).map((alt) => ({
    id: alt.macro_strategy,
    label: alt.macro_strategy,
    micro: alt.micro_strategy,
  }));
  const seenProtocols = new Set();
  const dynamicProtocols = rawProtocols.filter((proto) => {
    if (seenProtocols.has(proto.id)) return false;
    seenProtocols.add(proto.id);
    return true;
  });
  if (dynamicProtocols.length === 0) {
    dynamicProtocols.push(
      { id: "Source Reduction", label: "Source Reduction", micro: "None" },
      { id: "Larviciding", label: "Larviciding", micro: "Temephos (Abate)" },
      { id: "Adulticiding (Fogging)", label: "Adulticiding (Fogging)", micro: "Deltamethrin" }
    );
  }

  const [selectedProtocol, setSelectedProtocol] = useState(selectedStrategy);
  const [actionTaken, setActionTaken] = useState(
    `Conducted ${selectedStrategy} at designated premises; cleared standing water nodes.`
  );
  const [breteauIndex, setBreteauIndex] = useState("");
  const [clearedSites, setClearedSites] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoCount, setPhotoCount] = useState(1);

  // Dynamic date calculations
  const today = new Date();
  const executionDateStr = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const followUpDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const followUpDateStr = followUpDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const handleSaveAndRegister = async () => {
    setIsSubmitting(true);
    try {
      // 1. Mandatory Input Validation:
      // Officer must enter the actual count of breeding nodes neutralized
      const trimmedCleared = clearedSites.trim();
      if (trimmedCleared === "" || isNaN(parseInt(trimmedCleared, 10))) {
        Alert.alert(
          "Input Required",
          "Please enter the number of Breeding Nodes Neutralized by the officer before saving."
        );
        setIsSubmitting(false);
        return;
      }

      const clearedCount = parseInt(trimmedCleared, 10);
      if (clearedCount < 0) {
        Alert.alert("Invalid Input", "Breeding nodes neutralized cannot be a negative number.");
        setIsSubmitting(false);
        return;
      }

      // 2. Baseline Ground-Truth from Zone Surveillance Inspection
      const rawInitial = zoneContext?.breeding_sites_count ?? latestRecord?.environmentalContext?.breedingSites;
      const initialSites = (rawInitial !== undefined && rawInitial !== null && !isNaN(Number(rawInitial)))
        ? Number(rawInitial)
        : null;

      if (initialSites === null || initialSites <= 0) {
        Alert.alert(
          "Surveillance Data Missing",
          "No baseline initial breeding foci recorded for this zone. Please ensure inspection data is loaded."
        );
        setIsSubmitting(false);
        return;
      }

      if (clearedCount > initialSites) {
        Alert.alert(
          "Validation Error",
          `Neutralized nodes (${clearedCount}) cannot exceed total recorded breeding foci (${initialSites}) in this zone.`
        );
        setIsSubmitting(false);
        return;
      }

      // 3. Post-Intervention Remaining Foci & Drop Percentage (Standard WHO/MOH Formula)
      const remainingSites = initialSites - clearedCount;
      const fociDropPercentage = Math.round(((initialSites - remainingSites) / initialSites) * 1000) / 10;

      // 4. Entomological Context (Breteau Index)
      const rawInitialBreteau = zoneContext?.mosquito_density ?? latestRecord?.environmentalContext?.mosquitoDensity;
      const initialBreteau = (rawInitialBreteau !== undefined && rawInitialBreteau !== null && !isNaN(Number(rawInitialBreteau)))
        ? Number(rawInitialBreteau)
        : null;

      const hasUserBreteau = breteauIndex.trim() !== "" && !isNaN(parseFloat(breteauIndex));
      const parsedPostBreteau = hasUserBreteau ? parseFloat(breteauIndex) : null;

      // 5. Dynamic Standard Outcome Rating based on verified foci reduction
      let calculatedRating = "Needs Review";
      if (fociDropPercentage >= 70 && (parsedPostBreteau === null || parsedPostBreteau <= 15)) {
        calculatedRating = "Excellent";
      } else if (fociDropPercentage >= 50) {
        calculatedRating = "Good";
      } else if (fociDropPercentage >= 30) {
        calculatedRating = "Moderate";
      }

      // Dynamic Efficacy Score
      const calculatedScore = Math.min(
        98.0,
        Math.max(
          40.0,
          Math.round(
            fociDropPercentage * 0.65 +
            (parsedPostBreteau !== null
              ? (parsedPostBreteau <= 5 ? 35 : parsedPostBreteau <= 15 ? 20 : 10)
              : 30)
          )
        )
      );

      // Determine micro-strategy from selected protocol
      const activeProto = dynamicProtocols.find((p) => p.id === selectedProtocol);
      const microStrategy = activeProto?.micro || strategyDetails?.micro_strategy || "None";

      const recordPayload = {
        zoneId: latestRecord?.zoneId || zoneContext?.zoneId || "LOC004",
        phiId: latestRecord?.phiId || "PHI01",
        tier1MacroStrategy: selectedProtocol,
        tier2MicroStrategy: microStrategy,
        intervention_taken: `${selectedProtocol} - ${microStrategy}`,
        status: "Completed",
        notes: actionTaken,
        effectiveness_score: calculatedScore,
        temperature: Number(zoneContext?.temperature ?? 29.5),
        rainfall: Number(zoneContext?.rainfall ?? 85.0),
        cumulative_rainfall_14_days: Number(zoneContext?.cumulative_rainfall_14_days ?? 120.0),
        mosquito_density: initialBreteau,
        breeding_sites_count: initialSites,
        wind_speed: Number(zoneContext?.wind_speed ?? 10.0),
        environmentalContext: {
          temperature: Number(zoneContext?.temperature ?? 29.5),
          rainfall: Number(zoneContext?.rainfall ?? 85.0),
          cumulativeRainfall14Days: Number(zoneContext?.cumulative_rainfall_14_days ?? 120.0),
          windSpeed: Number(zoneContext?.wind_speed ?? 10.0),
          mosquitoDensity: initialBreteau,
          breedingSites: initialSites,
        },
        followUp: {
          date: new Date(),
          postBreedingFoci: remainingSites,
          postBreteauIndex: parsedPostBreteau,
          fociDropPercentage: fociDropPercentage,
          outcomeRating: calculatedRating,
          score: calculatedScore,
        },
      };

      // Connect to Express backend using API base URL to save/update record in MongoDB
      const response = await axios.post(`${API_BASE_URL}/interventions`, recordPayload, {
        timeout: 10000,
        headers: { "Content-Type": "application/json" },
      });

      const savedData = response.data?.data;

      // Successfully synced to backend MongoDB & FastAPI continual learning
      navigation.navigate("InterventionOutcome", {
        protocol: selectedProtocol,
        actionTaken,
        clearedSites: clearedCount,
        initialFoci: initialSites,
        finalFoci: remainingSites,
        breteauIndex: parsedPostBreteau,
        initialBreteau: initialBreteau,
        savedRecord: savedData,
        aiData,
      });
    } catch (error) {
      console.error("Backend sync error:", error.message);
      Alert.alert(
        "Sync Notice",
        `Could not communicate with backend at ${API_BASE_URL}. Please check connection.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Record Field Intervention"
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
        {/* Administrative Area Bar */}
        <View style={styles.areaCard}>
          <View style={styles.areaLeft}>
            <View style={styles.locationIconBox}>
              <Ionicons name="location" size={18} color={DengueGuardianColors.primary} />
            </View>
            <View style={styles.areaTextContainer}>
              <Text style={styles.areaMainText}>
                {latestRecord?.zoneId ? `Thalangama North A • ${latestRecord.zoneId}` : "Thalangama North A • LOC004"}
              </Text>
              <Text style={styles.areaSubText}>
                {latestRecord?.phiId ? `Malabe Range • Officer: ${latestRecord.phiId}` : "Malabe Range"}
              </Text>
            </View>
          </View>
        </View>

        {/* Card 1: SELECT PROTOCOL */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>RECOMMENDED PROTOCOLS</Text>
          <View style={styles.protocolRow}>
            {dynamicProtocols.map((proto, index) => {
              const isSelected = selectedProtocol === proto.id;
              return (
                <TouchableOpacity
                  key={`${proto.id}-${index}`}
                  style={[
                    styles.protocolPill,
                    isSelected && styles.protocolPillActive,
                  ]}
                  onPress={() => setSelectedProtocol(proto.id)}
                  activeOpacity={0.8}
                >
                  {isSelected && <View style={styles.activeDot} />}
                  <Text
                    style={[
                      styles.protocolText,
                      isSelected && styles.protocolTextActive,
                    ]}
                  >
                    {proto.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Card 2: Date & Officer Columns */}
        <View style={styles.twoColumnRow}>
          <View style={[styles.card, styles.columnCard]}>
            <Text style={styles.sectionHeader}>EXECUTION DATE</Text>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={16} color="#0F172A" />
              <Text style={styles.columnValue}>{executionDateStr}</Text>
            </View>
          </View>

          <View style={[styles.card, styles.columnCard]}>
            <Text style={styles.sectionHeader}>RESPONSIBLE OFFICER</Text>
            <View style={styles.infoRow}>
              <Ionicons name="id-card-outline" size={16} color="#0F172A" />
              <Text style={styles.columnValue}>
                {latestRecord?.phiId ? `${latestRecord.phiId} (Malabe Range)` : "PHI01 (Malabe Range)"}
              </Text>
            </View>
          </View>
        </View>

        {/* Card 3: ACTION TAKEN */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>ACTION TAKEN</Text>
          <TextInput
            style={styles.textInputBox}
            value={actionTaken}
            onChangeText={setActionTaken}
            multiline
            numberOfLines={2}
          />
          {/* Breeding Nodes Neutralized User Input */}
          <View style={styles.breteauSubInput}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#0D9488" style={{ marginRight: 6 }} />
              <Text style={styles.breteauInputLabel}>
                Breeding Nodes Neutralized:
              </Text>
            </View>
            <TextInput
              style={styles.breteauField}
              value={clearedSites}
              onChangeText={setClearedSites}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {/* Post-Action Breteau Count Input (Optional) */}
          <View style={styles.breteauSubInput}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.breteauInputLabel}>
                Post-Intervention Breteau Index:
              </Text>
            </View>
            <TextInput
              style={styles.breteauField}
              value={breteauIndex}
              onChangeText={setBreteauIndex}
              keyboardType="numeric"
              placeholder="e.g. 5.0"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>

        {/* Card 4: VERIFICATION PHOTO */}
        <View style={styles.card}>
          <View style={styles.photoHeaderRow}>
            <Text style={styles.sectionHeader}>VERIFICATION PHOTO</Text>
            <Text style={styles.photoAttachedText}>
              {photoCount} Photo Attached
            </Text>
          </View>

          <View style={styles.photoContentRow}>
            {/* Visual Thumbnail */}
            <View style={styles.photoThumbnail}>
              <View style={styles.photoVisual}>
                <Ionicons name="water-outline" size={26} color="#38BDF8" />
                <Text style={styles.photoVisualText}>SITE PHOTO</Text>
              </View>
              {/*<View style={styles.syncedBadge}>
                <Text style={styles.syncedText}>Synced</Text>
              </View>*/}
            </View>

            {/* Retake Button */}
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => {
                setPhotoCount((prev) => prev + 1);
                Alert.alert("Photo Uploaded Successfully");
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="camera-outline"
                size={18}
                color={DengueGuardianColors.primary}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.retakeText}>Retake or Add Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 5: FOLLOW-UP SCHEDULED */}
        <View style={styles.card}>
          <View style={styles.followUpRow}>
            <View>
              <Text style={styles.sectionHeader}>FOLLOW-UP SCHEDULED</Text>
              <Text style={styles.followUpSubtext}>7 Days (Re-Audit)</Text>
            </View>
            <View style={styles.dateBadge}>
              <Ionicons
                name="calendar"
                size={12}
                color={DengueGuardianColors.primary}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.dateBadgeText}>{followUpDateStr}</Text>
            </View>
          </View>
        </View>

        {/* Primary Submit Button */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSaveAndRegister}
          disabled={isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
          ) : (
            <Ionicons
              name="checkbox-outline"
              size={18}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? "Syncing..." : "Save & Register"}
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
  statusTag: {
    backgroundColor: DengueGuardianColors.mintSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  twoColumnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  columnCard: {
    flex: 1,
    marginHorizontal: 3,
  },
  sectionHeader: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  protocolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  protocolPill: {
    backgroundColor: "#F1F5F9",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  protocolPillActive: {
    backgroundColor: DengueGuardianColors.primary,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    marginRight: 6,
  },
  protocolText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  protocolTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  columnValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginLeft: 6,
  },
  textInputBox: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "500",
  },
  neutralizedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  neutralizedText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0D9488",
    marginLeft: 6,
    letterSpacing: 0.2,
  },
  breteauSubInput: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  breteauInputLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  optionalHint: {
    fontSize: 10,
    color: "#94A3B8",
    fontStyle: "italic",
    marginTop: 1,
  },
  breteauField: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    width: 65,
    textAlign: "center",
  },
  photoHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  photoAttachedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0D9488",
  },
  photoContentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  photoThumbnail: {
    width: 76,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#0F172A",
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  photoVisual: {
    alignItems: "center",
    justifyContent: "center",
  },
  photoVisualText: {
    fontSize: 8,
    color: "#94A3B8",
    fontWeight: "700",
    marginTop: 2,
  },
  syncedBadge: {
    position: "absolute",
    top: 3,
    right: 3,
    backgroundColor: "#1E3A8A",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  syncedText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  retakeButton: {
    flex: 1,
    backgroundColor: DengueGuardianColors.mintSurface,
    borderWidth: 1,
    borderColor: DengueGuardianColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  retakeText: {
    fontSize: 13,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
  },
  followUpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  followUpSubtext: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DengueGuardianColors.mintSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: DengueGuardianColors.primary,
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
    marginTop: 8,
    marginBottom: 10,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  draftLink: {
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 6,
  },
  draftLinkText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
  },
});
