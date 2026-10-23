import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DengueGuardianColors as colors } from "../../../shared/theme/colors";
import { loginPhi } from "../../../shared/api/phiScheduleApi";

export default function PhiLoginScreen({ onAuthenticated }) {
  const [phiId, setPhiId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!phiId.trim() || !password) {
      setError("Enter your PHI ID and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const session = await loginPhi(phiId, password);
      await onAuthenticated(session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 justify-center bg-background px-6"
    >
      <View className="mb-8">
        <View className="mb-5 h-12 w-12 items-center justify-center rounded-xl bg-mintSurface">
          <Ionicons name="clipboard-outline" size={25} color={colors.primary} />
        </View>
        <Text className="text-2xl font-extrabold text-darkBase">PHI Schedule</Text>
        <Text className="mt-2 text-sm leading-5 text-textMuted">
          Sign in with your assigned PHI account to view confirmed tasks for you.
        </Text>
      </View>

      <View className="rounded-xl border border-borderLight bg-surface p-5">
        <Text className="mb-2 text-xs font-bold uppercase text-textMuted">PHI ID</Text>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
          onChangeText={setPhiId}
          onSubmitEditing={submit}
          placeholder="e.g. PHI01"
          placeholderTextColor={colors.textMuted}
          returnKeyType="next"
          value={phiId}
          className="mb-4 rounded-lg border border-borderLight bg-background px-3 py-3 text-base text-darkBase"
        />
        <Text className="mb-2 text-xs font-bold uppercase text-textMuted">Password</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          returnKeyType="go"
          secureTextEntry
          value={password}
          className="mb-4 rounded-lg border border-borderLight bg-background px-3 py-3 text-base text-darkBase"
        />
        {!!error && <Text accessibilityRole="alert" className="mb-4 text-sm text-riskHigh">{error}</Text>}
        <TouchableOpacity
          accessibilityRole="button"
          disabled={loading}
          onPress={submit}
          className="min-h-12 flex-row items-center justify-center rounded-lg bg-primary px-4 py-3 disabled:opacity-60"
        >
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-surface">Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}