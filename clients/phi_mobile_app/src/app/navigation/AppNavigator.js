import { View, Platform, Image } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors } from "../../shared/theme/colors";

import PhiScheduleScreen from "../../features/phi_inspection/screens/PhiScheduleScreen";

const Tab = createBottomTabNavigator();

export default function AppNavigator({ token, phi, onLogout }) {
  const insets = useSafeAreaInsets();

  // Ensures tabs never clip under Android navigation buttons (back/home/recents) or iOS home bar
  const bottomInset = Platform.OS === "android" ? Math.max(insets.bottom, 14) : Math.max(insets.bottom, 16);
  const tabHeight = 64 + bottomInset;

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: {
            backgroundColor: DengueGuardianColors.primary,
            elevation: 4,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 3,
          },
          headerTintColor: DengueGuardianColors.surface,
          headerTitleStyle: {
            fontWeight: "700",
            fontSize: 18,
            letterSpacing: 0.3,
          },
          headerRight: () => (
            <View
              style={{
                marginRight: 16,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image
                source={require("../../../assets/shield_transparent.png")}
                style={{ width: 34, height: 34 }}
                resizeMode="contain"
              />
            </View>
          ),
          tabBarStyle: {
            backgroundColor: DengueGuardianColors.surface,
            borderTopColor: DengueGuardianColors.borderLight,
            borderTopWidth: 1.5,
            height: tabHeight,
            paddingBottom: bottomInset,
            paddingTop: 8,
            elevation: 16,
            shadowColor: DengueGuardianColors.darkBase,
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
          },
          tabBarActiveTintColor: DengueGuardianColors.primary,
          tabBarInactiveTintColor: DengueGuardianColors.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            marginTop: 3,
            letterSpacing: 0.2,
          },
          tabBarItemStyle: {
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 2,
          },
          tabBarIcon: ({ focused, color, size }) => {
            return (
              <View
                style={{
                  backgroundColor: focused ? DengueGuardianColors.mintSurface : "transparent",
                  minWidth: 46,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={focused ? "calendar" : "calendar-outline"} size={20} color={color} />
              </View>
            );
          },
        })}
      >
        <Tab.Screen
          name="My Schedule"
          options={{
            headerTitle: "My Confirmed PHI Schedule",
            tabBarIcon: ({ focused, color, size }) => (
              <View style={{ alignItems: "center", justifyContent: "center" }}>
                <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} />
              </View>
            ),
          }}
        >
          {() => <PhiScheduleScreen token={token} phi={phi} onLogout={onLogout} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}
