import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { DengueGuardianColors } from "../../../shared/theme/colors";

const { width } = Dimensions.get("window");
const LAUNCH_DURATION_MS = 5000; // 5-second duration

export default function LaunchScreen({ onComplete }) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Store onComplete in a ref so parent re-renders don't reset the 10s timer
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    fadeAnim.setValue(0);
    progressAnim.setValue(0);

    // 1. Smooth fade in (500ms)
    const fadeTiming = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    });

    // 2. Steady 10-second straight-line loading progress
    const progressTiming = Animated.timing(progressAnim, {
      toValue: 1,
      duration: LAUNCH_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    fadeTiming.start();
    progressTiming.start();

    // 3. Strict 10-second timer before navigating
    const timer = setTimeout(() => {
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    }, LAUNCH_DURATION_MS);

    return () => {
      clearTimeout(timer);
      fadeTiming.stop();
      progressTiming.stop();
    };
  }, [fadeAnim, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Transparent Shield Logo */}
        <View style={styles.logoWrapper}>
          <Image
            source={require("../../../../assets/shield_transparent.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Brand App Name */}
        <View style={styles.titleRow}>
          <Text style={styles.titleDengue}>DENGUE</Text>
          <Text style={styles.titleHyphen}>-</Text>
          <Text style={styles.titleGuardian}>GUARDIAN</Text>
        </View>

        {/* Loading Spinner & Straight Line Progress (10 Seconds) */}
        <View style={styles.loadingSection}>
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: progressWidth },
              ]}
            />
          </View>

          <View style={styles.spinnerWrapper}>
            <ActivityIndicator
              size="small"
              color={DengueGuardianColors.accent}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A1122", // Clean dark theme matching the logo
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  logoWrapper: {
    width: Math.min(width * 0.55, 200),
    height: Math.min(width * 0.55, 200),
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  titleDengue: {
    color: DengueGuardianColors.accent, // #A1E3F9 Telemetry Sky
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  titleHyphen: {
    color: "#64748B",
    fontSize: 22,
    fontWeight: "900",
    marginHorizontal: 3,
  },
  titleGuardian: {
    color: DengueGuardianColors.surface, // #FFFFFF
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  loadingSection: {
    alignItems: "center",
    justifyContent: "center",
    width: Math.min(width * 0.65, 230),
  },
  progressBarTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "#1E293B",
    borderRadius: 9999,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: DengueGuardianColors.accent, // #A1E3F9
    borderRadius: 9999,
  },
  spinnerWrapper: {
    marginTop: 18,
  },
});