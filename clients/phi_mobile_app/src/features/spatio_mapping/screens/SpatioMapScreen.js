import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";

export default function SpatioMapScreen() {
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [activeZone, setActiveZone] = useState("Malabe North");

  const zones = [
    {
      id: "malabe",
      name: "Malabe North",
      status: "Hotspot Cluster",
      risk: "high",
      cases: 16,
      breteauIndex: 42.5,
      houseIndex: "18.2%",
      lastSurvey: "Yesterday",
    },
    {
      id: "kaduwela_town",
      name: "Kaduwela Town Center",
      status: "Moderate Warning",
      risk: "med",
      cases: 6,
      breteauIndex: 26.0,
      houseIndex: "11.4%",
      lastSurvey: "3 days ago",
    },
    {
      id: "thalangama",
      name: "Thalangama Wetland Border",
      status: "Cleared Safe Zone",
      risk: "safe",
      cases: 1,
      breteauIndex: 6.2,
      houseIndex: "2.1%",
      lastSurvey: "Today",
    },
  ];

  const filteredZones = zones.filter((z) => {
    if (selectedFilter === "all") return true;
    if (selectedFilter === "high") return z.risk === "high";
    if (selectedFilter === "med") return z.risk === "med";
    if (selectedFilter === "safe") return z.risk === "safe";
    return true;
  });

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Administrative Area Bar */}
      <View className="flex-row items-center justify-between bg-surface border border-slate-200 rounded-xl px-4 py-3 mb-4 shadow-sm">
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-mintSurface items-center justify-center mr-2">
            <Ionicons name="location" size={18} color={DengueGuardianColors.primary} />
          </View>
          <View>
            <Text className="text-xs font-bold text-darkBase">
              Kaduwela MOH Administrative Area
            </Text>
            <Text className="text-[11px] text-textMuted">
              Colombo District • Surveillance Division 04
            </Text>
          </View>
        </View>
        <View className="bg-primary/10 px-2 py-1 rounded">
          <Text className="text-[10px] font-bold text-primary">GIS LIVE</Text>
        </View>
      </View>

      {/* Filter Tabs / Pills */}
      <View className="flex-row mb-4">
        {[
          { id: "all", label: "All Zones" },
          { id: "high", label: "Hotspots", badge: DengueGuardianColors.riskHigh },
          { id: "med", label: "Moderate", badge: DengueGuardianColors.riskMedium },
          { id: "safe", label: "Safe", badge: DengueGuardianColors.riskCleared },
        ].map((tab) => {
          const isSelected = selectedFilter === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setSelectedFilter(tab.id)}
              className={`mr-2 px-3 py-1.5 rounded-full flex-row items-center border ${
                isSelected
                  ? "bg-primary border-primary"
                  : "bg-surface border-slate-200"
              }`}
            >
              {tab.badge && (
                <View
                  className="w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: tab.badge }}
                />
              )}
              <Text
                className={`text-xs font-semibold ${
                  isSelected ? "text-surface" : "text-textMuted"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Simulated GIS Map Canvas */}
      <View className="bg-surface border border-slate-200 rounded-xl overflow-hidden mb-4 shadow-sm">
        <View className="bg-slate-100 px-4 py-2 flex-row items-center justify-between border-b border-slate-200">
          <Text className="text-xs font-bold text-darkBase">
            Spatio-Temporal Vector Density Heatmap
          </Text>
          <Text className="text-[10px] text-textMuted">Layer: Larval & Case Kernel</Text>
        </View>

        {/* Visual Map Canvas Grid */}
        <View className="h-56 bg-slate-900 relative justify-center items-center">
          {/* Subtle map grid lines */}
          <View className="absolute inset-0 opacity-15">
            <View className="h-1/3 border-b border-white" />
            <View className="h-1/3 border-b border-white" />
          </View>

          {/* Interactive GIS Pins */}
          {/* Malabe Hotspot */}
          <TouchableOpacity
            onPress={() => setActiveZone("Malabe North")}
            style={{
              position: "absolute",
              top: 36,
              left: 50,
              alignItems: "center",
            }}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-lg"
              style={{ backgroundColor: DengueGuardianColors.riskHigh }}
            >
              <Ionicons name="alert" size={18} color="#FFFFFF" />
            </View>
            <View className="bg-darkBase/90 px-2 py-0.5 rounded mt-1">
              <Text className="text-[10px] text-white font-bold">Malabe (BI: 42.5)</Text>
            </View>
          </TouchableOpacity>

          {/* Kaduwela Town Moderate */}
          <TouchableOpacity
            onPress={() => setActiveZone("Kaduwela Town Center")}
            style={{
              position: "absolute",
              top: 70,
              right: 60,
              alignItems: "center",
            }}
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center border-2 border-white shadow-lg"
              style={{ backgroundColor: DengueGuardianColors.riskMedium }}
            >
              <Ionicons name="warning" size={16} color="#FFFFFF" />
            </View>
            <View className="bg-darkBase/90 px-2 py-0.5 rounded mt-1">
              <Text className="text-[10px] text-white font-bold">Kaduwela Town</Text>
            </View>
          </TouchableOpacity>

          {/* Thalangama Safe */}
          <TouchableOpacity
            onPress={() => setActiveZone("Thalangama Wetland Border")}
            style={{
              position: "absolute",
              bottom: 24,
              left: 120,
              alignItems: "center",
            }}
          >
            <View
              className="w-8 h-8 rounded-full items-center justify-center border-2 border-white shadow-lg"
              style={{ backgroundColor: DengueGuardianColors.riskCleared }}
            >
              <Ionicons name="shield-checkmark" size={14} color="#FFFFFF" />
            </View>
            <View className="bg-darkBase/90 px-2 py-0.5 rounded mt-1">
              <Text className="text-[10px] text-white font-bold">Thalangama (Safe)</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Map Legend */}
        <View className="bg-slate-50 px-4 py-2.5 flex-row items-center justify-around border-t border-slate-200">
          <View className="flex-row items-center">
            <View className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: DengueGuardianColors.riskHigh }} />
            <Text className="text-[11px] text-textMuted">High (&gt;40 BI)</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: DengueGuardianColors.riskMedium }} />
            <Text className="text-[11px] text-textMuted">Moderate (20-40 BI)</Text>
          </View>
          <View className="flex-row items-center">
            <View className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: DengueGuardianColors.riskCleared }} />
            <Text className="text-[11px] text-textMuted">Low / Safe (&lt;20 BI)</Text>
          </View>
        </View>
      </View>

      {/* Highlighted AI Spatial Forecast Card */}
      <View className="bg-mintSurface border-l-4 border-primary p-4 rounded-xl mb-4 shadow-sm">
        <View className="flex-row items-center mb-1.5">
          <View className="w-7 h-7 rounded-full bg-accent/40 items-center justify-center mr-2">
            <Ionicons name="trending-up" size={16} color={DengueGuardianColors.primary} />
          </View>
          <Text className="text-sm font-bold text-darkBase">
            Component 2: 14-Day Outbreak Projection
          </Text>
        </View>
        <Text className="text-xs text-textMuted leading-relaxed">
          Spatial lag models predict a 68% rise in vector pupal positivity around <Text className="font-bold text-darkBase">Malabe North</Text> due to recent accumulated rainfall. Immediate focal containment recommended.
        </Text>
      </View>

      {/* Surveyed Zones List */}
      <Text className="text-sm font-bold text-darkBase mb-3">
        Zonal Surveillance Breakdown
      </Text>

      {filteredZones.map((zone) => (
        <View
          key={zone.id}
          className={`bg-surface border rounded-xl p-4 mb-3 shadow-sm ${
            activeZone === zone.name ? "border-secondary" : "border-slate-200"
          }`}
        >
          <View className="flex-row items-center justify-between mb-2">
            <View>
              <Text className="text-sm font-bold text-darkBase">{zone.name}</Text>
              <Text className="text-[11px] text-textMuted">Last Survey: {zone.lastSurvey}</Text>
            </View>
            <View
              className="px-2.5 py-1 rounded-full"
              style={{
                backgroundColor:
                  zone.risk === "high"
                    ? "rgba(225, 29, 72, 0.12)"
                    : zone.risk === "med"
                    ? "rgba(245, 158, 11, 0.12)"
                    : "rgba(16, 185, 129, 0.12)",
              }}
            >
              <Text
                className="text-xs font-bold"
                style={{
                  color:
                    zone.risk === "high"
                      ? DengueGuardianColors.riskHigh
                      : zone.risk === "med"
                      ? DengueGuardianColors.riskMedium
                      : DengueGuardianColors.riskCleared,
                }}
              >
                {zone.status}
              </Text>
            </View>
          </View>

          {/* Indices Row */}
          <View className="flex-row justify-between bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-1">
            <View className="items-center flex-1">
              <Text className="text-[10px] text-textMuted">Breteau Index</Text>
              <Text className="text-xs font-bold text-darkBase mt-0.5">{zone.breteauIndex}</Text>
            </View>
            <View className="items-center flex-1 border-x border-slate-200">
              <Text className="text-[10px] text-textMuted">House Index</Text>
              <Text className="text-xs font-bold text-darkBase mt-0.5">{zone.houseIndex}</Text>
            </View>
            <View className="items-center flex-1">
              <Text className="text-[10px] text-textMuted">14d Cases</Text>
              <Text className="text-xs font-bold text-darkBase mt-0.5">{zone.cases}</Text>
            </View>
          </View>
        </View>
      ))}

      {/* Action Buttons */}
      <TouchableOpacity className="bg-primary py-3.5 rounded-xl items-center mb-3 shadow-sm active:bg-secondary flex-row justify-center">
        <Ionicons name="document-text-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text className="text-surface font-bold text-base">
          Export GIS Spatial Vector Report
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}