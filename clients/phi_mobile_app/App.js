import "./global.css";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import AppNavigator from "./src/app/navigation/AppNavigator";
import LaunchScreen from "./src/features/launch/screens/LaunchScreen";
import PhiLoginScreen from "./src/features/phi_inspection/screens/PhiLoginScreen";
import { DengueGuardianColors } from "./src/shared/theme/colors";

const PHI_SESSION_KEY = "dengue-guardian-phi-session";

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });
  const [isLaunching, setIsLaunching] = useState(true);
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (isLaunching || !fontsLoaded) return;
    SecureStore.getItemAsync(PHI_SESSION_KEY)
      .then((stored) => setSession(stored ? JSON.parse(stored) : null))
      .catch(() => setSession(null))
      .finally(() => setSessionReady(true));
  }, [fontsLoaded, isLaunching]);

  async function handleAuthenticated(nextSession) {
    const next = { token: nextSession.access_token, phi: nextSession.phi };
    await SecureStore.setItemAsync(PHI_SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }

  async function handleLogout() {
    await SecureStore.deleteItemAsync(PHI_SESSION_KEY);
    setSession(null);
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        style="light"
        backgroundColor={isLaunching ? "#0F172A" : "#3674B5"}
      />
      {isLaunching || !fontsLoaded ? (
        <LaunchScreen onComplete={() => setIsLaunching(false)} />
      ) : !sessionReady ? (
        <View className="flex-1 items-center justify-center bg-background">
          <ActivityIndicator color={DengueGuardianColors.primary} />
          <Text className="mt-3 text-xs text-textMuted">Restoring PHI session…</Text>
        </View>
      ) : session ? (
        <AppNavigator token={session.token} phi={session.phi} onLogout={handleLogout} />
      ) : (
        <PhiLoginScreen onAuthenticated={handleAuthenticated} />
      )}
    </SafeAreaProvider>
  );
}