import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HeaderBar({
  title = "DENGUE-GUARDIAN",
  subtitle,
  onBack,
  showBack = true,
  rightAction,
  onProfilePress,
}) {
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "android" ? Math.max(insets.top, 12) : insets.top;

  return (
    <View style={[styles.headerContainer, { paddingTop: topPadding + 6 }]}>
      <View style={styles.contentRow}>
        {/* Left: Back button or placeholder */}
        <View style={styles.leftContainer}>
          {showBack && onBack ? (
            <TouchableOpacity
              onPress={onBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color="#0F172A" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 28 }} />
          )}
        </View>

        {/* Center: Branding & Subtitle */}
        <View style={styles.centerContainer}>
          <View style={styles.brandRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={13} color="#0D9488" />
            </View>
            <Text style={styles.brandTitle}>{title}</Text>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        {/* Right: Actions */}
        <View style={styles.rightContainer}>
          {rightAction}
          <TouchableOpacity
            onPress={onProfilePress}
            style={styles.profileButton}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leftContainer: {
    width: 40,
    alignItems: "flex-start",
  },
  backButton: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  brandTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 1.2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 1,
  },
  rightContainer: {
    width: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  profileButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
});
