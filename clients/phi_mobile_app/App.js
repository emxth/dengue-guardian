import "./global.css";
import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import AppNavigator from "./src/app/navigation/AppNavigator";
import LaunchScreen from "./src/features/launch/screens/LaunchScreen";

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });
  const [isLaunching, setIsLaunching] = useState(true);

  return (
    <SafeAreaProvider>
      <StatusBar
        style="light"
        backgroundColor={isLaunching ? "#0F172A" : "#3674B5"}
      />
      {isLaunching || !fontsLoaded ? (
        <LaunchScreen onComplete={() => setIsLaunching(false)} />
      ) : (
        <AppNavigator />
      )}
    </SafeAreaProvider>
  );
}