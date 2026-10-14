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
import { preventionApi } from "../../../shared/api/preventionApi";
import HeaderBar from "../components/HeaderBar";

export default function RecordInterventionScreen({ navigation, route }) {
  const { aiData, selectedStrategy = "Source Reduction", zoneContext = {} } = route.params || {};

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
  const [breteauIndex, setBreteauIndex] = useState("5.0");
  const [clearedSites, setClearedSites] = useState(
    String(zoneContext?.breeding_sites_count || 16)
  );
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
      const parsedBreteau = parseFloat(breteauIndex) || 5.0;
      const parsedCleared = parseInt(clearedSites, 10) || 16;
      const initialSites = zoneContext?.breeding_sites_count || 28;
      const remainingSites = Math.max(initialSites - parsedCleared, 0);

      // Efficacy score: lower post-intervention Breteau index -> higher efficacy score
      const calculatedScore = parsedBreteau <= 5 ? 92.0 : parsedBreteau <= 15 ? 78.5 : 52.0;

      const recordPayload = {
        zoneId: "ZONE-KADUWELA-A",
        phiId: "PHI-OFFICER-418",
        temperature: zoneContext?.temperature || 29.5,
        rainfall: zoneContext?.rainfall || 85.0,
        cumulative_rainfall_14_days: zoneContext?.cumulative_rainfall_14_days || 120.0,
        mosquito_density: parsedBreteau,
        breeding_sites_count: remainingSites,
        wind_speed: zoneContext?.wind_speed || 10.0,
        intervention_taken: selectedProtocol,
        effectiveness_score: calculatedScore,
        notes: actionTaken,
      };

      const result = await preventionApi.recordIntervention(recordPayload);

      // Successfully synced to backend MongoDB & FastAPI continual learning
      navigation.navigate("InterventionOutcome", {
        protocol: selectedProtocol,
        actionTaken,
        breteauIndex: parsedBreteau,
        initialFoci: initialSites,
        finalFoci: remainingSites,
        initialBreteau: zoneContext?.mosquito_density || 45.0,
        savedRecord: result?.data,
        aiData,
      });
    } catch (error) {
      console.error("Backend sync error:", error.message);
      Alert.alert(
        "Sync Notice",
        "Could not communicate with backend at 172.20.10.4:5000. Please check connection."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="DENGUE-GUARDIAN"
        subtitle="Record Intervention"
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
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.mainTitle}>Record Field Intervention</Text>
          <View style={styles.areaBadge}>
            <Text style={styles.areaBadgeText}>Zone Kaduwela-A</Text>
          </View>
        </View>
        <Text style={styles.subtitleText}>
          Sentinel Sector • Vector Control Protocol
        </Text>

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
              <Text style={styles.columnValue}>PHI Bandara (#418)</Text>
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
          <View style={styles.neutralizedRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#0D9488" />
            <Text style={styles.neutralizedText}>
              {clearedSites} Breeding Nodes Neutralized
            </Text>
          </View>

          {/* Post-Action Breteau Count Input */}
          <View style={styles.breteauSubInput}>
            <Text style={styles.breteauInputLabel}>
              Post-Intervention Breteau Index:
            </Text>
            <TextInput
              style={styles.breteauField}
              value={breteauIndex}
              onChangeText={setBreteauIndex}
              keyboardType="numeric"
              placeholder="e.g. 5.0"
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
              <View style={styles.syncedBadge}>
                <Text style={styles.syncedText}>Synced</Text>
              </View>
            </View>

            {/* Retake Button */}
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={() => {
                setPhotoCount((prev) => prev + 1);
                Alert.alert("Camera Module", "Additional verification photo captured and geotagged.");
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="camera-outline"
                size={18}
                color="#1E3A8A"
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
              <Text style={styles.followUpSubtext}>7 Days (Automated re-audit)</Text>
            </View>
            <View style={styles.dateBadge}>
              <Ionicons
                name="calendar"
                size={12}
                color="#1E40AF"
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
            {isSubmitting ? "Syncing..." : "Save & Register Intervention"}
          </Text>
        </TouchableOpacity>

        {/* Secondary Draft Link */}
        <TouchableOpacity
          style={styles.draftLink}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.draftLinkText}>Save Draft & Exit</Text>
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  areaBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  areaBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
  },
  subtitleText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 16,
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
    backgroundColor: "#0F172A",
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
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
    backgroundColor: "#EFF6FF",
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
    color: "#1E3A8A",
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
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
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
