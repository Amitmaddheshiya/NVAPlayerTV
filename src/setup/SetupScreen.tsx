import React, { useState, useMemo } from "react";
import { Pressable, StyleSheet, Text, View, TextInput, Alert, Dimensions } from "react-native";
import type { AppMode } from "../services/setupService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_TEST_CLOUD_API_URL } from "../services/cloudRuntimeConfig";

type Props = {
  onSelectMode: (mode: AppMode) => Promise<void> | void;
};

export default function SetupScreen({ onSelectMode }: Props) {
  const { width, height } = Dimensions.get("window");
  const isSmallScreen = Math.min(width, height) < 720;
  
  const styles = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: "#0b111a", alignItems: "center", justifyContent: "center", padding: 24 },
    card: { width: "100%", maxWidth: isSmallScreen ? 500 : 680, borderRadius: isSmallScreen ? 14 : 20, padding: isSmallScreen ? 18 : 28, backgroundColor: "#14202d", borderWidth: 1, borderColor: "rgba(120,190,231,0.25)" },
    eyebrow: { color: "#73c6ff", fontSize: isSmallScreen ? 11 : 13, fontWeight: "800", letterSpacing: 1.2 },
    title: { marginTop: 8, color: "#fff", fontSize: isSmallScreen ? 20 : 27, fontWeight: "800" },
    description: { marginTop: 12, color: "rgba(225,239,250,0.78)", fontSize: isSmallScreen ? 13 : 15, lineHeight: isSmallScreen ? 18 : 22 },
    tipsTitle: { marginTop: 16, color: "#73c6ff", fontSize: isSmallScreen ? 12 : 14, fontWeight: "bold", marginBottom: 4 },
    tipText: { color: "rgba(225,239,250,0.85)", fontSize: isSmallScreen ? 11 : 13, lineHeight: isSmallScreen ? 15 : 18 },
    tipBold: { fontWeight: "bold", color: "#fff" },
    actions: { marginTop: 24, gap: isSmallScreen ? 10 : 14 },
    button: { borderRadius: isSmallScreen ? 10 : 12, padding: isSmallScreen ? 14 : 18, backgroundColor: "#1d8fff", borderWidth: 2, borderColor: "rgba(129,207,255,0.55)" },
    cloudButton: { backgroundColor: "#10b981", borderColor: "rgba(52,211,153,0.55)" },
    buttonFocused: { backgroundColor: "#43a6ff", borderColor: "#d3f5ff", transform: [{ scale: 1.025 }] },
    buttonPressed: { opacity: 0.85 },
    buttonTitle: { color: "#fff", fontSize: isSmallScreen ? 15 : 18, fontWeight: "800" },
    buttonHint: { marginTop: 4, color: "rgba(255,255,255,0.84)", fontSize: isSmallScreen ? 11 : 13 },
    inputContainer: { marginTop: 20, marginBottom: 20 },
    label: { color: "#fff", fontSize: isSmallScreen ? 14 : 16, marginBottom: 8 },
    input: { backgroundColor: "#1a2332", color: "#fff", padding: isSmallScreen ? 12 : 16, borderRadius: 8, fontSize: isSmallScreen ? 14 : 16, borderWidth: 2, borderColor: "rgba(120,190,231,0.3)" },
    inputFocused: { borderColor: "#73c6ff" },
    secondaryButton: { marginTop: 12, borderRadius: isSmallScreen ? 10 : 12, padding: isSmallScreen ? 14 : 16, backgroundColor: "transparent", borderWidth: 2, borderColor: "rgba(255,255,255,0.2)" },
    secondaryButtonTitle: { color: "rgba(255,255,255,0.8)", fontSize: isSmallScreen ? 14 : 16, fontWeight: "600", textAlign: "center" },
  }), [isSmallScreen]);
  
  const [tvFocused, setTvFocused] = useState(false);
  const [cloudFocused, setCloudFocused] = useState(false);
  const [adminFocused, setAdminFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  const [selectingMode, setSelectingMode] = useState<AppMode | null>(null);

  const selectMode = async (mode: AppMode) => {
    if (loading) return;
    setLoading(true);
    setSelectingMode(mode);
    try {
      await onSelectMode(mode);
    } catch (error) {
      console.error(`Failed to select ${mode}:`, error);
      Alert.alert("Setup Error", "The mode could not be saved. Please try again.");
    } finally {
      setLoading(false);
      setSelectingMode(null);
    }
  };

  const handleCloudMode = async () => {
    if (loading) return;
    setLoading(true);
    setSelectingMode("cloudMode");
    try {
      // Store the endpoint, but do not require connectivity to finish setup.
      const savedUrl = await AsyncStorage.getItem('@signage_cloud_api_url');
      const apiUrl = String(savedUrl || DEFAULT_TEST_CLOUD_API_URL).trim().replace(/\/+$/, '');
      await AsyncStorage.multiSet([
        ['@signage_cloud_api_url', apiUrl],
        ['@signage_cloud_mode', 'true'],
      ]);
      await onSelectMode('cloudMode');
    } catch (error) {
      console.error('Failed to enable cloud mode:', error);
      Alert.alert('Setup Error', 'Cloud mode could not be saved. Please try again.');
    } finally {
      setLoading(false);
      setSelectingMode(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>WELCOME</Text>
        <Text style={styles.title}>Use this device for TV signage?</Text>
        <Text style={styles.description}>
          Choose LAN mode for offline playback, Cloud mode for remote management, or Admin only to manage a TV CMS.
        </Text>
        <Text style={styles.tipsTitle}>💡 Usage Tips</Text>
        <Text style={styles.tipText}>
          <Text style={styles.tipBold}>LAN Mode:</Text> Offline playback with embedded CMS. Access via TV IP address. No internet required.
        </Text>
        <Text style={styles.tipText}>
          <Text style={styles.tipBold}>Cloud Mode:</Text> Remote management via cloud backend. Requires internet. Upload content from anywhere.
        </Text>
        <Text style={styles.tipText}>
          <Text style={styles.tipBold}>Admin Only:</Text> Manage other TVs via their CMS. No local playback on this device.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => void selectMode('tvMode')}
            onFocus={() => setTvFocused(true)}
            onBlur={() => setTvFocused(false)}
            style={({ pressed }) => [styles.button, tvFocused ? styles.buttonFocused : null, pressed ? styles.buttonPressed : null]}
            focusable
            hasTVPreferredFocus
            disabled={loading}
          >
            <Text style={styles.buttonTitle}>{selectingMode === 'tvMode' ? 'Opening LAN Mode...' : 'Yes — LAN Mode'}</Text>
            <Text style={styles.buttonHint}>Offline playback with embedded CMS</Text>
          </Pressable>
          <Pressable
            onPress={handleCloudMode}
            onFocus={() => setCloudFocused(true)}
            onBlur={() => setCloudFocused(false)}
            style={({ pressed }) => [styles.button, styles.cloudButton, cloudFocused ? styles.buttonFocused : null, pressed ? styles.buttonPressed : null]}
            focusable
            disabled={loading}
          >
            <Text style={styles.buttonTitle}>{selectingMode === 'cloudMode' ? 'Opening Cloud Mode...' : 'Cloud Mode'}</Text>
            <Text style={styles.buttonHint}>Remote management via cloud</Text>
          </Pressable>
          <Pressable
            onPress={() => void selectMode("adminOnlyMode")}
            onFocus={() => setAdminFocused(true)}
            onBlur={() => setAdminFocused(false)}
            style={({ pressed }) => [styles.button, adminFocused ? styles.buttonFocused : null, pressed ? styles.buttonPressed : null]}
            focusable
            disabled={loading}
          >
            <Text style={styles.buttonTitle}>{selectingMode === 'adminOnlyMode' ? 'Opening Admin Only...' : 'No — Admin Only'}</Text>
            <Text style={styles.buttonHint}>Open and manage a TV CMS</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
