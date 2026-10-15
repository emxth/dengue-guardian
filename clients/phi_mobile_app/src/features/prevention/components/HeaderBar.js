import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DengueGuardianColors } from "../../../shared/theme/colors";

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
              <Ionicons name="arrow-back" size={24} color={DengueGuardianColors.surface} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 28 }} />
          )}
        </View>

        {/* Center: Branding & Subtitle */}
        <View style={styles.centerContainer}>
          <Text style={styles.brandTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>

        {/* Right: Actions */}
        <View style={styles.rightContainer}>
          {rightAction}
          <TouchableOpacity
            onPress={onProfilePress}
            style={styles.profileButton}
            activeOpacity={0.8}
          >
            <Image
              source={require("../../../../assets/shield_transparent.png")}
              style={{ width: 30, height: 30 }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: DengueGuardianColors.primary,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    paddingBottom: 12,
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
  brandTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DengueGuardianColors.surface,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: DengueGuardianColors.accent,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  rightContainer: {
    width: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  profileButton: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
});
