import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";

export default function PreventionScreen() {
  const [selectedPlan, setSelectedPlan] = useState("fogging");

  const interventionPlans = [
    {
      id: "fogging",
      title: "Targeted Thermal Fogging & ULV",
      badge: "Priority 1 (Urgent)",
      riskColor: DengueGuardianColors.riskHigh,
      targetZone: "Malabe North (Cluster B)",
      timeWindow: "Dawn / Dusk (05:30 - 07:00)",
      recommendedChemical: "Pesguard FG 161 (Pyrethroid)",
      status: "Scheduled Tomorrow",
      icon: "flame-outline",
    },
    {
      id: "larviciding",
      title: "Biological Larviciding (BTI)",
      badge: "Priority 2",
      riskColor: DengueGuardianColors.riskMedium,
      targetZone: "Kaduwela Canal Inlets & Blocked Culverts",
      timeWindow: "Continuous Morning Operations",
      recommendedChemical: "Bacillus thuringiensis israelensis (BTI)",
      status: "In Progress (60% applied)",
      icon: "water-outline",
    },
    {
      id: "source_reduction",
      title: "Community Shramadana Cleanup",
      badge: "Community Drive",
      riskColor: DengueGuardianColors.primary,
      targetZone: "Division 04 Grama Niladhari Areas",
      timeWindow: "Saturday 08:00 - 12:00",
      recommendedChemical: "Mechanical source destruction & tire disposal",
      status: "MOH Volunteers Notified",
      icon: "people-outline",
    },
  ];

  const handleDeployPlan = () => {
    Alert.alert(
      "Intervention Deployed",
      "Field teams and vector control units have been dispatched with GPS coordinates for focal fogging."
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Highlighted Strategy Card (Eco Mint #D1F8EF with #3674B5 Left Accent Border) */}
      <View className="bg-mintSurface border-l-4 border-primary p-4 rounded-xl mb-4 shadow-sm">
        <View className="flex-row items-center mb-1">
          <View className="w-8 h-8 rounded-full bg-accent/40 items-center justify-center mr-2">
            <Ionicons name="shield-checkmark" size={18} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-base font-bold text-darkBase">
            Component 4: Prevention Strategy
          </Text>
        </View>
        <Text className="mt-1 text-xs text-textMuted leading-relaxed">
          Automated multi-criteria decision support generating localized vector control, larviciding schedules, and chemical fogging protocols.
        </Text>
      </View>

      {/* Field Resource Allocation Card */}
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-mintSurface items-center justify-center mr-2">
              <Ionicons name="construct-outline" size={18} color={DengueGuardianColors.primary} />
            </View>
            <Text className="text-xs font-bold text-darkBase">
              MOH Vector Control Inventory
            </Text>
          </View>
          <Text className="text-[11px] text-textMuted">Kaduwela Depot</Text>
        </View>

        <View className="flex-row justify-between">
          <View className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 mr-2 items-center">
            <Text className="text-[10px] text-textMuted">Fogging Units</Text>
            <Text className="text-sm font-bold text-darkBase mt-0.5">4 Available</Text>
            <Text className="text-[10px] text-riskCleared">Ready</Text>
          </View>
          <View className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 mr-2 items-center">
            <Text className="text-[10px] text-textMuted">BTI Packets</Text>
            <Text className="text-sm font-bold text-darkBase mt-0.5">180 kg</Text>
            <Text className="text-[10px] text-primary">In Stock</Text>
          </View>
          <View className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 items-center">
            <Text className="text-[10px] text-textMuted">Field Officers</Text>
            <Text className="text-sm font-bold text-darkBase mt-0.5">12 PHIs</Text>
            <Text className="text-[10px] text-secondary">Active</Text>
          </View>
        </View>
      </View>

      {/* Actionable Strategy Recommendations */}
      <Text className="text-xs font-bold text-darkBase mb-3">
        Recommended Interventions (Algorithmic Priority)
      </Text>

      {interventionPlans.map((plan) => {
        const isSelected = selectedPlan === plan.id;
        return (
          <TouchableOpacity
            key={plan.id}
            onPress={() => setSelectedPlan(plan.id)}
            activeOpacity={0.8}
            className={`bg-surface border rounded-xl p-4 mb-3 shadow-sm ${
              isSelected ? "border-secondary" : "border-slate-200"
            }`}
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center flex-1 mr-2">
                <Ionicons name={plan.icon} size={18} color={plan.riskColor} />
                <Text className="text-xs font-bold text-darkBase ml-2 flex-1" numberOfLines={1}>
                  {plan.title}
                </Text>
              </View>
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${plan.riskColor}20` }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: plan.riskColor }}
                >
                  {plan.badge}
                </Text>
              </View>
            </View>

            <View className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-1">
              <View className="flex-row justify-between mb-1">
                <Text className="text-[11px] text-textMuted">Target Zone:</Text>
                <Text className="text-[11px] font-semibold text-darkBase">{plan.targetZone}</Text>
              </View>
              <View className="flex-row justify-between mb-1">
                <Text className="text-[11px] text-textMuted">Window:</Text>
                <Text className="text-[11px] font-semibold text-darkBase">{plan.timeWindow}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-[11px] text-textMuted">Agent:</Text>
                <Text className="text-[11px] font-medium text-secondary" numberOfLines={1}>
                  {plan.recommendedChemical}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Primary CTA Button (#3674B5) */}
      <TouchableOpacity
        onPress={handleDeployPlan}
        className="bg-primary py-3.5 rounded-xl items-center mb-3 shadow-sm active:bg-secondary flex-row justify-center"
      >
        <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text className="text-surface font-bold text-base">
          Dispatch Vector Control Team
        </Text>
      </TouchableOpacity>

      {/* Secondary Outlined Button */}
      <TouchableOpacity
        className="bg-mintSurface border border-primary py-3 rounded-xl items-center flex-row justify-center"
      >
        <Ionicons name="megaphone-outline" size={18} color={DengueGuardianColors.primary} style={{ marginRight: 6 }} />
        <Text className="text-primary font-bold text-sm">
          Broadcast Public SMS Alert to Residents
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}