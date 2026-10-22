import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";

export default function InspectionScreen() {
  const [premiseType, setPremiseType] = useState("Residential");
  const [hasGutters, setHasGutters] = useState(false);
  const [hasContainers, setHasContainers] = useState(true);
  const [hasLarvae, setHasLarvae] = useState(true);
  const [noticeIssued, setNoticeIssued] = useState(false);
  const [sampleId, setSampleId] = useState("LAR-2026-KD-084");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const premiseTypes = [
    { id: "Residential", label: "Residential" },
    { id: "Commercial", label: "Commercial" },
    { id: "Construction", label: "Construction" },
    { id: "School", label: "School/Public" },
  ];

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      Alert.alert(
        "Inspection Logged",
        "Record successfully saved to local SQLite database with GPS tag. Queued for MOH central sync."
      );
    }, 500);
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Inspector Identification Bar */}
      <View className="flex-row items-center justify-between bg-surface border border-slate-200 rounded-xl px-4 py-3 mb-4 shadow-sm">
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-mintSurface items-center justify-center mr-2">
            <Ionicons name="person" size={18} color={DengueGuardianColors.primary} />
          </View>
          <View>
            <Text className="text-xs font-bold text-darkBase">
              Officer Bandara (PHI #418)
            </Text>
            <Text className="text-[11px] text-textMuted">
              MOH Kaduwela • Offline Mode Ready
            </Text>
          </View>
        </View>
        <View className="flex-row items-center bg-riskCleared/15 px-2 py-1 rounded">
          <Ionicons name="checkmark-circle" size={12} color={DengueGuardianColors.riskCleared} style={{ marginRight: 4 }} />
          <Text className="text-[10px] font-bold text-riskCleared">Synced</Text>
        </View>
      </View>

      {/* Highlighted Premise Protocol Card (Eco-Mint Surface) */}
      <View className="bg-mintSurface border-l-4 border-primary p-4 rounded-xl mb-4 shadow-sm">
        <View className="flex-row items-center mb-1">
          <View className="w-7 h-7 rounded-full bg-accent/40 items-center justify-center mr-2">
            <Ionicons name="clipboard" size={16} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-sm font-bold text-darkBase">
            Component 3: Field Inspection Form
          </Text>
        </View>
        <Text className="text-xs text-textMuted leading-relaxed">
          Statutory inspection under the Prevention of Mosquito Breeding Act No. 11 of 2007. Records persist offline in local SQLite when cellular coverage drops.
        </Text>
      </View>

      {/* Premise Category Selector */}
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
        <Text className="text-xs font-bold text-darkBase mb-2.5">
          Premise Category
        </Text>
        <View className="flex-row flex-wrap justify-between">
          {premiseTypes.map((type) => {
            const isSelected = premiseType === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                onPress={() => setPremiseType(type.id)}
                className={`w-[48%] py-2.5 px-3 rounded-lg mb-2 border flex-row items-center justify-between ${
                  isSelected
                    ? "bg-primary border-primary"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isSelected ? "text-surface" : "text-darkBase"
                  }`}
                >
                  {type.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Vector Risk Checklist */}
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
        <Text className="text-xs font-bold text-darkBase mb-3">
          On-Site Risk Verification Checklist
        </Text>

        {/* Item 1 */}
        <View className="flex-row items-center justify-between py-2.5 border-b border-slate-100">
          <View className="flex-1 mr-2">
            <Text className="text-xs font-semibold text-darkBase">
              Blocked Roof Gutters / Drains
            </Text>
            <Text className="text-[11px] text-textMuted">
              Water pooling detected on eaves or surface culverts
            </Text>
          </View>
          <Switch
            value={hasGutters}
            onValueChange={setHasGutters}
            trackColor={{ false: "#CBD5E1", true: DengueGuardianColors.secondary }}
            thumbColor={hasGutters ? DengueGuardianColors.primary : "#F8FAFC"}
          />
        </View>

        {/* Item 2 */}
        <View className="flex-row items-center justify-between py-2.5 border-b border-slate-100">
          <View className="flex-1 mr-2">
            <Text className="text-xs font-semibold text-darkBase">
              Discarded Water Vessels in Yard
            </Text>
            <Text className="text-[11px] text-textMuted">
              Uncovered tires, coconut shells, plastic containers
            </Text>
          </View>
          <Switch
            value={hasContainers}
            onValueChange={setHasContainers}
            trackColor={{ false: "#CBD5E1", true: DengueGuardianColors.secondary }}
            thumbColor={hasContainers ? DengueGuardianColors.primary : "#F8FAFC"}
          />
        </View>

        {/* Item 3 */}
        <View className="flex-row items-center justify-between py-2.5 border-b border-slate-100">
          <View className="flex-1 mr-2">
            <Text className="text-xs font-semibold text-riskHigh">
              Active Aedes Larvae Found
            </Text>
            <Text className="text-[11px] text-textMuted">
              Live larvae or pupae collected in water sample
            </Text>
          </View>
          <Switch
            value={hasLarvae}
            onValueChange={setHasLarvae}
            trackColor={{ false: "#CBD5E1", true: DengueGuardianColors.riskHigh }}
            thumbColor={hasLarvae ? DengueGuardianColors.riskHigh : "#F8FAFC"}
          />
        </View>

        {/* Item 4 */}
        <View className="flex-row items-center justify-between pt-2.5">
          <View className="flex-1 mr-2">
            <Text className="text-xs font-semibold text-darkBase">
              Issue Legal Notice (Section 2)
            </Text>
            <Text className="text-[11px] text-textMuted">
              7-day formal remediation notice to property occupant
            </Text>
          </View>
          <Switch
            value={noticeIssued}
            onValueChange={setNoticeIssued}
            trackColor={{ false: "#CBD5E1", true: DengueGuardianColors.secondary }}
            thumbColor={noticeIssued ? DengueGuardianColors.primary : "#F8FAFC"}
          />
        </View>
      </View>

      {/* Entomological Sample Logging */}
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-5 shadow-sm">
        <Text className="text-xs font-bold text-darkBase mb-2">
          Entomological Sample ID
        </Text>
        <TextInput
          value={sampleId}
          onChangeText={setSampleId}
          placeholder="e.g. LAR-2026-KD-084"
          placeholderTextColor="#94A3B8"
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-darkBase mb-3"
        />

        <Text className="text-xs font-bold text-darkBase mb-2">
          PHI Field Observations & Notes
        </Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Note container locations, occupant contact details, or requested fogging..."
          placeholderTextColor="#94A3B8"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-darkBase h-20"
        />
      </View>

      {/* Action Buttons */}
      <TouchableOpacity
        onPress={handleSubmit}
        className="bg-primary py-3.5 rounded-xl items-center mb-3 shadow-sm active:bg-secondary flex-row justify-center"
      >
        <Ionicons name="save-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text className="text-surface font-bold text-base">
          {submitted ? "Saving Record..." : "Save & Validate Inspection"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-mintSurface border border-primary py-3 rounded-xl items-center flex-row justify-center"
      >
        <Ionicons name="document-text" size={18} color={DengueGuardianColors.primary} style={{ marginRight: 6 }} />
        <Text className="text-primary font-bold text-sm">
          Generate Remediation Notice PDF
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}