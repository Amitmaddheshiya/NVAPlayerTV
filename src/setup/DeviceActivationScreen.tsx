import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Dimensions, Pressable } from "react-native";
import { NativeModules } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ACTIVATED_KEY = "@device_activated";

const { width, height } = Dimensions.get("window");
const isSmallScreen = Math.min(width, height) < 720;

export default function DeviceActivationScreen({ onBack }: { onBack: () => void }) {
  const [deviceId, setDeviceId] = useState<string>("Loading...");
  const [backFocused, setBackFocused] = useState(false);

  useEffect(() => {
    const loadDeviceId = () => {
      try {
        const id = (NativeModules as any)?.DeviceIdModule?.getDeviceId?.();
        if (id) {
          setDeviceId(id);
        }
      } catch (error) {
        console.error("Failed to get device ID:", error);
        setDeviceId("Unknown");
      }
    };
    loadDeviceId();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔒</Text>
        </View>
        <Text style={styles.title}>Device Activation Required</Text>
        <Text style={styles.message}>
          This device needs to be activated to use Cloud Mode. Please contact support with your Device ID.
        </Text>

        <View style={styles.deviceIdBox}>
          <Text style={styles.deviceIdLabel}>Device ID</Text>
          <Text style={styles.deviceIdValue}>{deviceId}</Text>
        </View>

        <View style={styles.contactBox}>
          <Text style={styles.contactTitle}>Contact Support</Text>
          <Text style={styles.contactItem}>
            <Text style={styles.contactLabel}>Phone:</Text> +91 92278 96944
          </Text>
          <Text style={styles.contactItem}>
            <Text style={styles.contactLabel}>Email:</Text> nextviewsignage@mail.com
          </Text>
        </View>

        <Text style={styles.note}>
          Note: Once activated, this screen will not appear again.
        </Text>
        <Pressable
          onPress={onBack}
          onFocus={() => setBackFocused(true)}
          onBlur={() => setBackFocused(false)}
          style={[styles.backButton, backFocused ? styles.backButtonFocused : null]}
          focusable
          hasTVPreferredFocus
        >
          <Text style={styles.backButtonText}>Back to Mode Selection</Text>
        </Pressable>
      </View>
    </View>
  );
}

export async function isDeviceActivated(): Promise<boolean> {
  try {
    const activated = await AsyncStorage.getItem(DEVICE_ACTIVATED_KEY);
    return activated === "true";
  } catch {
    return false;
  }
}

export async function setDeviceActivated(activated: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_ACTIVATED_KEY, activated ? "true" : "false");
  } catch (error) {
    console.error("Failed to set device activation status:", error);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b111a",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: isSmallScreen ? 500 : 600,
    backgroundColor: "#14202d",
    borderRadius: isSmallScreen ? 16 : 20,
    padding: isSmallScreen ? 24 : 32,
    borderWidth: 1,
    borderColor: "rgba(120, 190, 231, 0.25)",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 20,
  },
  icon: {
    fontSize: isSmallScreen ? 48 : 64,
  },
  title: {
    color: "#ffffff",
    fontSize: isSmallScreen ? 22 : 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    color: "rgba(225, 239, 250, 0.85)",
    fontSize: isSmallScreen ? 14 : 16,
    textAlign: "center",
    lineHeight: isSmallScreen ? 20 : 24,
    marginBottom: 24,
  },
  deviceIdBox: {
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: isSmallScreen ? 10 : 12,
    padding: isSmallScreen ? 16 : 20,
    marginBottom: 24,
    alignItems: "center",
  },
  deviceIdLabel: {
    color: "#73c6ff",
    fontSize: isSmallScreen ? 12 : 14,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  deviceIdValue: {
    color: "#ffffff",
    fontSize: isSmallScreen ? 18 : 22,
    fontWeight: "bold",
    fontFamily: "monospace",
  },
  contactBox: {
    width: "100%",
    backgroundColor: "rgba(115, 198, 255, 0.1)",
    borderRadius: isSmallScreen ? 10 : 12,
    padding: isSmallScreen ? 16 : 20,
    marginBottom: 20,
  },
  contactTitle: {
    color: "#73c6ff",
    fontSize: isSmallScreen ? 14 : 16,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  contactItem: {
    color: "rgba(225, 239, 250, 0.9)",
    fontSize: isSmallScreen ? 13 : 15,
    marginBottom: 8,
    textAlign: "center",
  },
  contactLabel: {
    fontWeight: "bold",
    color: "#ffffff",
  },
  note: {
    color: "rgba(225, 239, 250, 0.6)",
    fontSize: isSmallScreen ? 11 : 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  backButton: {
    marginTop: 20,
    minWidth: 230,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(129, 207, 255, 0.55)",
    backgroundColor: "#1d8fff",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  backButtonFocused: {
    backgroundColor: "#43a6ff",
    borderColor: "#d3f5ff",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
