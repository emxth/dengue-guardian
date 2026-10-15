import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { DengueGuardianColors } from "../../../shared/theme/colors";

export default function FactorProgressBar({ label, valueText, percentage, barColor }) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const activeColor = barColor || DengueGuardianColors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.valueText, { color: activeColor }]}>
          {valueText || `${clamped}%`}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${clamped}%`,
              backgroundColor: activeColor,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  valueText: {
    fontSize: 13,
    fontWeight: "700",
  },
  track: {
    height: 7,
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
});
