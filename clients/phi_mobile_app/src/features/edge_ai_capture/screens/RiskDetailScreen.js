// clients/phi_mobile_app/src/features/edge_ai_capture/screens/RiskDetailScreen.js

import React, { useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../../shared/theme/colors";

export default function RiskDetailScreen({ route, navigation }) {
    const { telemetry } = route.params || {};

    // Dynamically add the back button to the existing blue Tab Header
    useEffect(() => {
        const parentNav = navigation.getParent();
        if (parentNav) {
            parentNav.setOptions({
                headerLeft: () => (
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 16 }}>
                        <Ionicons name="arrow-back" size={26} color={DengueGuardianColors.surface} />
                    </TouchableOpacity>
                ),
            });
        }

        // Cleanup: Remove the back arrow when returning to the main dashboard
        return () => {
            if (parentNav) {
                parentNav.setOptions({ headerLeft: null });
            }
        };
    }, [navigation]);

    // ---------------------------------------------------------------------------
    // DATA MAPPING
    // ---------------------------------------------------------------------------
    const temp = telemetry?.temperature ?? 0.0;
    const humidity = telemetry?.humidity ?? 0.0;
    const rain = telemetry?.rainfall_mm ?? 0.0;

    const riskTier = (telemetry?.risk_level ?? "PENDING").toUpperCase();
    const rawRiskScore = telemetry?.environmental_breeding_risk ?? 0.0;
    const riskScore100 = Math.round(rawRiskScore * 100);
    const weatherScore = telemetry?.weather_risk_score ?? 0.0;

    const objects = telemetry?.objects || {};
    const countTire = objects.tire || 0;
    const countBottle = objects.bottle || 0;
    const countDrain = objects.drain_inlet || 0;
    const countVase = objects.vase || 0;
    const countCoconut = objects.coconut_exocarp || 0;

    const totalItems = countTire + countBottle + countDrain + countVase + countCoconut;

    // 3-Tier Logic for Colors and Messages
    let themeColor = DengueGuardianColors.riskCleared; // Default Green
    let riskMessage = "Overall breeding risk is low. Ensure no new water containers are introduced to the premises.";
    let showWarningIcon = false;
    let fusionBgClass = "bg-emerald-600";

    if (riskTier === "HIGH") {
        themeColor = DengueGuardianColors.riskHigh; // Red
        showWarningIcon = true;
        fusionBgClass = "bg-red-700";

        if (rain > 0) {
            riskMessage = "Critical risk: Active rain filling breeding habitats. Immediate intervention required.";
        } else {
            riskMessage = "Critical vector breeding index detected. Immediate container removal recommended.";
        }

    } else if (riskTier === "MEDIUM") {
        themeColor = "#F59E0B"; // Amber/Orange for Medium Risk
        showWarningIcon = true;
        fusionBgClass = "bg-amber-500";

        // Dynamically adjust the message based on actual sensor readings
        if (rain > 0) {
            riskMessage = "Moderate risk: Rain detected. Monitor premises and clear forming stagnant water pools.";
        } else if (totalItems > 0) {
            riskMessage = `Moderate risk: No active rain, but ${totalItems} exposed containers detected. Remove them before they collect water.`;
        } else {
            riskMessage = "Moderate breeding conditions present due to favorable weather. Continue monitoring premises.";
        }
    }

    return (
        <View className="flex-1 bg-slate-50">
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

                {/* 1. Master Risk Score Card */}
                <View className="bg-white border border-slate-200 rounded-2xl p-6 mb-4 mt-2 items-center shadow-sm">
                    {/* Circular Score Indicator */}
                    <View
                        className="w-28 h-28 rounded-full border-4 items-center justify-center mb-4"
                        style={{ borderColor: themeColor }}
                    >
                        <Text className="text-4xl font-black text-darkBase tracking-tight" style={{ lineHeight: 42 }}>{riskScore100}</Text>
                        <Text className="text-[10px] font-bold text-textMuted tracking-widest mt-0.5">SCORE</Text>
                    </View>

                    <View className="flex-row items-center mb-2">
                        {showWarningIcon && <Ionicons name="warning" size={18} color={themeColor} style={{ marginRight: 6 }} />}
                        <Text className="text-lg font-bold" style={{ color: themeColor }}>
                            {riskTier} RISK
                        </Text>
                    </View>

                    <Text className="text-xs text-center text-textMuted px-4">
                        {riskMessage}
                    </Text>
                </View>

                {/* 2. Weather AI Summary */}
                <View className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm flex-row items-start">
                    <Ionicons name="cloud-outline" size={20} color={DengueGuardianColors.primary} style={{ marginRight: 10, marginTop: 2 }} />
                    <View className="flex-1">
                        <View className="flex-row justify-between items-center mb-2">
                            <Text className="font-bold text-darkBase">Weather AI</Text>
                            {weatherScore >= 0.6 && (
                                <View className="bg-rose-100 px-2 py-0.5 rounded">
                                    <Text className="text-[9px] font-bold text-riskHigh">HIGH RISK</Text>
                                </View>
                            )}
                        </View>
                        <Text className="text-xs text-textMuted italic border-l-2 border-slate-300 pl-2">
                            {weatherScore >= 0.6
                                ? `"Current weather conditions are perfect for mosquitoes to live and breed quickly."`
                                : `"Current weather makes it difficult for mosquitoes to survive and breed."`
                            }
                        </Text>
                    </View>
                </View>

                {/* 3. Environmental Metrics List */}
                <View className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
                    <View className="flex-row items-center mb-3">
                        <Ionicons name="leaf-outline" size={18} color="#059669" style={{ marginRight: 8 }} />
                        <Text className="font-bold text-darkBase">Environmental</Text>
                    </View>

                    <View className="flex-row justify-between items-center py-2 border-b border-slate-100">
                        <View className="flex-row items-center"><Ionicons name="thermometer-outline" size={14} color="#64748B" /><Text className="text-xs ml-2 text-textMuted">Temp</Text></View>
                        <Text className="font-bold">{temp.toFixed(1)}°C</Text>
                    </View>
                    <View className="flex-row justify-between items-center py-2 border-b border-slate-100">
                        <View className="flex-row items-center"><Ionicons name="water-outline" size={14} color="#64748B" /><Text className="text-xs ml-2 text-textMuted">Humidity</Text></View>
                        <Text className="font-bold">{humidity.toFixed(0)}%</Text>
                    </View>
                    <View className="flex-row justify-between items-center py-2">
                        <View className="flex-row items-center"><Ionicons name="rainy-outline" size={14} color="#64748B" /><Text className="text-xs ml-2 text-textMuted">Rain</Text></View>
                        <Text className="font-bold">{rain.toFixed(1)}mm</Text>
                    </View>
                </View>

                {/* 4. Vision Detection Grid */}
                <View className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
                    <View className="flex-row items-center justify-between mb-4">
                        <View className="flex-row items-center">
                            <Ionicons name="scan-outline" size={18} color="#334155" style={{ marginRight: 8 }} />
                            <Text className="font-bold text-darkBase">Vision Detection</Text>
                        </View>
                        <View className="bg-slate-600 px-2 py-1 rounded">
                            <Text className="text-[10px] text-white font-bold">Total Items: {totalItems}</Text>
                        </View>
                    </View>

                    <View className="flex-row flex-wrap justify-between">
                        <View className="w-[48%] bg-slate-50 border border-slate-200 rounded-lg p-3 items-center mb-3">
                            <Ionicons name="disc-outline" size={20} color="#64748B" />
                            <Text className="text-[10px] font-black text-textMuted mt-1 uppercase">Tyres</Text>
                            <Text className="text-lg font-black mt-1">{countTire}</Text>
                        </View>
                        <View className="w-[48%] bg-slate-50 border border-slate-200 rounded-lg p-3 items-center mb-3">
                            <Ionicons name="pint-outline" size={20} color="#64748B" />
                            <Text className="text-[10px] font-black text-textMuted mt-1 uppercase">Bottles</Text>
                            <Text className="text-lg font-black mt-1">{countBottle}</Text>
                        </View>
                        <View className="w-[48%] bg-slate-50 border border-slate-200 rounded-lg p-3 items-center mb-3">
                            <Ionicons name="grid-outline" size={20} color="#64748B" />
                            <Text className="text-[10px] font-black text-textMuted mt-1 uppercase">Drains</Text>
                            <Text className="text-lg font-black mt-1">{countDrain}</Text>
                        </View>
                        <View className="w-[48%] bg-slate-50 border border-slate-200 rounded-lg p-3 items-center mb-3">
                            <Ionicons name="cube-outline" size={20} color="#64748B" />
                            <Text className="text-[10px] font-black text-textMuted mt-1 uppercase">Containers</Text>
                            <Text className="text-lg font-black mt-1">{countVase}</Text>
                        </View>
                        <View className="w-[48%] bg-slate-50 border border-slate-200 rounded-lg p-3 items-center">
                            <Ionicons name="basketball-outline" size={20} color="#64748B" />
                            <Text className="text-[10px] font-black text-textMuted mt-1 uppercase">Coconut Shell</Text>
                            <Text className="text-lg font-black mt-1">{countCoconut}</Text>
                        </View>
                    </View>
                </View>

                {/* 5. Decision Fusion Visual Flowchart */}
                <View className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm items-center">
                    <View className="flex-row items-center w-full mb-4">
                        <Ionicons name="git-merge-outline" size={18} color="#334155" style={{ marginRight: 8 }} />
                        <Text className="font-bold text-darkBase">Decision Fusion</Text>
                    </View>

                    <View className="w-4/5 border border-slate-200 py-1.5 items-center mb-1 rounded bg-slate-50"><Text className="text-[10px] text-textMuted font-bold">Weather AI</Text></View>
                    <View className="w-4/5 border border-slate-200 py-1.5 items-center mb-1 rounded bg-slate-50"><Text className="text-[10px] text-textMuted font-bold">Objects (YOLO)</Text></View>
                    <View className="w-4/5 border border-slate-200 py-1.5 items-center rounded bg-slate-50"><Text className="text-[10px] text-textMuted font-bold">Location Data</Text></View>

                    <Ionicons name="arrow-down" size={16} color="#94A3B8" style={{ marginVertical: 6 }} />

                    <View className="w-4/5 bg-blue-700 py-2.5 items-center rounded-md mb-2 shadow-sm">
                        <Text className="text-white text-xs font-bold">Fusion Engine</Text>
                    </View>

                    <Ionicons name="arrow-down" size={16} color="#94A3B8" style={{ marginVertical: 4 }} />

                    <View className={`w-4/5 py-3 items-center rounded-md shadow-sm ${fusionBgClass}`}>
                        <View className="flex-row items-center">
                            {showWarningIcon && <Ionicons name="warning" size={14} color="#FFF" style={{ marginRight: 6 }} />}
                            <Text className="text-white text-sm font-bold">{riskTier} Risk</Text>
                        </View>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}