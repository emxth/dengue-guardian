import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";

export default function EdgeCaptureScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState("Just now");
  const [scanCounts, setScanCounts] = useState({
    tire: 2,
    coconut_exocarp: 4,
    drain_inlet: 1,
    vase: 3,
    bottle: 5,
  });

  const handleTriggerScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setLastScanTime("Just now");
      // Add slight dynamic variation to demonstrate edge responsiveness
      setScanCounts((prev) => ({
        ...prev,
        tire: Math.max(1, (prev.tire + 1) % 4),
        coconut_exocarp: 4,
      }));
    }, 900);
  };

  const containerList = [
    { key: "tire", name: "Tires", count: scanCounts.tire, weight: "1.00", icon: "disc-outline", risk: "high" },
    { key: "coconut_exocarp", name: "Coconut Shells", count: scanCounts.coconut_exocarp, weight: "0.75", icon: "nutrition-outline", risk: "high" },
    { key: "drain_inlet", name: "Drain Inlets", count: scanCounts.drain_inlet, weight: "0.70", icon: "water-outline", risk: "med" },
    { key: "vase", name: "Vases / Pots", count: scanCounts.vase, weight: "0.45", icon: "flask-outline", risk: "med" },
    { key: "bottle", name: "Bottles", count: scanCounts.bottle, weight: "0.35", icon: "wine-outline", risk: "low" },
  ];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Node Status Bar */}
      <View className="flex-row items-center justify-between bg-surface border border-slate-200 rounded-xl px-4 py-3 mb-4 shadow-sm">
        <View className="flex-row items-center">
          <View className="w-2.5 h-2.5 rounded-full bg-riskCleared mr-2" />
          <Text className="text-xs font-semibold text-darkBase">
            Edge Node: RPi-4 (Online)
          </Text>
        </View>
        <Text className="text-xs text-textMuted">
          6.9271° N, 79.9612° E
        </Text>
      </View>

      {/* Highlighted AI Decision Fusion Card (Eco-Mint Surface with Guardian Cobalt Accent) */}
      <View className="bg-mintSurface border-l-4 border-primary p-4 rounded-xl mb-4 shadow-sm">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-accent/40 items-center justify-center mr-2">
              <Ionicons name="analytics" size={18} color={DengueGuardianColors.primary} />
            </View>
            <Text className="text-base font-bold text-darkBase">
              Multi-Modal Decision Fusion
            </Text>
          </View>
          <View className="bg-riskHigh/15 px-2.5 py-1 rounded-full border border-riskHigh/30">
            <Text className="text-xs font-bold text-riskHigh">HIGH RISK</Text>
          </View>
        </View>

        <Text className="text-2xl font-black text-darkBase tracking-tight">
          0.7420 <Text className="text-sm font-normal text-textMuted">/ 1.0000</Text>
        </Text>
        <Text className="mt-1 text-xs text-textMuted leading-relaxed">
          High microclimatic suitability co-occurs with active breeding containers. Prioritized for immediate PHI field larviciding.
        </Text>

        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-300/60">
          <Text className="text-xs text-textMuted">Inference Latency: 82.4 ms</Text>
          <Text className="text-xs font-medium text-primary">Last update: {lastScanTime}</Text>
        </View>
      </View>

      {/* Simulated Camera Viewfinder & YOLO Detection Frame */}
      <View className="bg-darkBase rounded-xl overflow-hidden mb-4 border border-slate-700 shadow-md">
        <View className="bg-slate-800 px-4 py-2.5 flex-row items-center justify-between border-b border-slate-700">
          <View className="flex-row items-center">
            <Ionicons name="videocam" size={16} color={DengueGuardianColors.accent} />
            <Text className="text-xs font-semibold text-slate-200 ml-2">
              Optical Sensor Feed (YOLOv8s ONNX)
            </Text>
          </View>
          <View className="bg-slate-700 px-2 py-0.5 rounded">
            <Text className="text-[10px] font-mono text-accent">640×640 px</Text>
          </View>
        </View>

        {/* Viewfinder Graphics */}
        <View className="h-44 bg-slate-900 justify-center items-center relative p-3">
          {/* Simulated bounding boxes in Telemetry Sky (#A1E3F9) */}
          <View
            style={{
              position: "absolute",
              top: 24,
              left: 28,
              borderWidth: 1.5,
              borderColor: DengueGuardianColors.accent,
              backgroundColor: "rgba(161, 227, 249, 0.12)",
              padding: 4,
              borderRadius: 6,
            }}
          >
            <Text className="text-[10px] font-bold text-accent">
              Tire [0.94]
            </Text>
          </View>

          <View
            style={{
              position: "absolute",
              bottom: 28,
              right: 32,
              borderWidth: 1.5,
              borderColor: DengueGuardianColors.accent,
              backgroundColor: "rgba(161, 227, 249, 0.12)",
              padding: 4,
              borderRadius: 6,
            }}
          >
            <Text className="text-[10px] font-bold text-accent">
              Coconut-Shell [0.89]
            </Text>
          </View>

          <View
            style={{
              position: "absolute",
              bottom: 24,
              left: 90,
              borderWidth: 1.5,
              borderColor: DengueGuardianColors.secondary,
              backgroundColor: "rgba(87, 143, 202, 0.12)",
              padding: 4,
              borderRadius: 6,
            }}
          >
            <Text className="text-[10px] font-bold text-white">
              Bottle [0.91]
            </Text>
          </View>

          {isScanning ? (
            <View className="items-center">
              <ActivityIndicator size="large" color={DengueGuardianColors.accent} />
              <Text className="text-xs font-medium text-accent mt-2">
                Running ONNX CPU Session...
              </Text>
            </View>
          ) : (
            <View className="items-center opacity-70">
              <Ionicons name="scan-outline" size={38} color={DengueGuardianColors.accent} />
              <Text className="text-xs text-slate-300 mt-1 font-medium">
                Live Edge Frame Active
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Detected Breeding Containers Breakdown */}
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-mintSurface items-center justify-center mr-2">
              <Ionicons name="cube-outline" size={18} color={DengueGuardianColors.primary} />
            </View>
            <Text className="text-sm font-bold text-darkBase">
              Detected Breeding Containers
            </Text>
          </View>
          <Text className="text-xs text-textMuted">
            Total: {Object.values(scanCounts).reduce((a, b) => a + b, 0)} items
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-between">
          {containerList.map((item) => (
            <View
              key={item.key}
              className="w-[48%] bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-2.5 flex-row items-center justify-between"
            >
              <View className="flex-row items-center flex-1 mr-1">
                <Ionicons
                  name={item.icon}
                  size={16}
                  color={
                    item.risk === "high"
                      ? DengueGuardianColors.riskHigh
                      : DengueGuardianColors.primary
                  }
                />
                <View className="ml-2">
                  <Text className="text-xs font-semibold text-darkBase" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text className="text-[10px] text-textMuted">
                    w={item.weight}
                  </Text>
                </View>
              </View>
              <View
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{
                  backgroundColor:
                    item.risk === "high"
                      ? "rgba(225, 29, 72, 0.12)"
                      : "rgba(54, 116, 181, 0.12)",
                }}
              >
                <Text
                  className="text-xs font-bold"
                  style={{
                    color:
                      item.risk === "high"
                        ? DengueGuardianColors.riskHigh
                        : DengueGuardianColors.primary,
                  }}
                >
                  {item.count}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Microclimatic Telemetry Card (DHT22 & OpenWeather API) */}
      <View className="bg-surface border border-slate-200 rounded-xl p-4 mb-5 shadow-sm">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View className="w-8 h-8 rounded-full bg-mintSurface items-center justify-center mr-2">
              <Ionicons name="thermometer-outline" size={18} color={DengueGuardianColors.primary} />
            </View>
            <Text className="text-sm font-bold text-darkBase">
              Microclimate & Weather AI
            </Text>
          </View>
          <View className="bg-mintSurface px-2 py-0.5 rounded">
            <Text className="text-[11px] font-semibold text-primary">Suitability: 0.852</Text>
          </View>
        </View>

        <View className="flex-row justify-between mb-3">
          <View className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 mr-2 items-center">
            <Text className="text-[11px] text-textMuted">Temperature</Text>
            <Text className="text-base font-bold text-darkBase mt-0.5">29.5°C</Text>
            <Text className="text-[10px] text-secondary">Optimal (28.5°C)</Text>
          </View>

          <View className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 mr-2 items-center">
            <Text className="text-[11px] text-textMuted">Humidity</Text>
            <Text className="text-base font-bold text-darkBase mt-0.5">84.0%</Text>
            <Text className="text-[10px] text-secondary">High (&gt;72%)</Text>
          </View>

          <View className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 items-center">
            <Text className="text-[11px] text-textMuted">Rainfall</Text>
            <Text className="text-base font-bold text-darkBase mt-0.5">16.5 mm</Text>
            <Text className="text-[10px] text-secondary">Breeding Fill</Text>
          </View>
        </View>

        {/* Suitability Meter */}
        <View className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <View
            className="h-full rounded-full"
            style={{
              width: "85.2%",
              backgroundColor: DengueGuardianColors.secondary,
            }}
          />
        </View>
      </View>

      {/* Action Buttons */}
      <TouchableOpacity
        onPress={handleTriggerScan}
        disabled={isScanning}
        className="bg-primary py-3.5 rounded-xl items-center mb-3 shadow-sm active:bg-secondary flex-row justify-center"
      >
        <Ionicons name="scan" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text className="text-surface font-bold text-base">
          {isScanning ? "Processing Edge AI..." : "Trigger Edge Vision Scan"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="bg-mintSurface border border-primary py-3 rounded-xl items-center flex-row justify-center"
      >
        <Ionicons name="cloud-upload-outline" size={18} color={DengueGuardianColors.primary} style={{ marginRight: 6 }} />
        <Text className="text-primary font-bold text-sm">
          Sync Telemetry with Central MOH
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}