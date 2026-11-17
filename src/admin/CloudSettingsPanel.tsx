import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import cloudService from "../services/cloudService";
import socketService from "../services/socketService";
import { DEFAULT_TEST_CLOUD_API_URL } from "../services/cloudRuntimeConfig";

const CLOUD_MODE_KEY = "@signage_cloud_mode";
const CLOUD_API_URL_KEY = "@signage_cloud_api_url";

export default function CloudSettingsPanel({ visible, onClose }: any) {
  const [cloudModeEnabled, setCloudModeEnabled] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [closeFocused, setCloseFocused] = useState(false);
  const [toggleFocused, setToggleFocused] = useState(false);
  const [testFocused, setTestFocused] = useState(false);
  const [saveFocused, setSaveFocused] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const enabled = await AsyncStorage.getItem(CLOUD_MODE_KEY);
    const url = await AsyncStorage.getItem(CLOUD_API_URL_KEY);
    const id = await cloudService.getDeviceId();

    setCloudModeEnabled(enabled === "true");
    setApiUrl(url || DEFAULT_TEST_CLOUD_API_URL);
    setDeviceId(id);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const normalizedUrl = apiUrl.trim().replace(/\/+$/, '');
      const parsedUrl = new URL(normalizedUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Use an http or https API URL');
      await cloudService.setCloudMode(cloudModeEnabled, normalizedUrl);

      if (cloudModeEnabled) {
        socketService.connect();
      } else {
        socketService.disconnect();
      }

      // Don't auto-close - let user manually close after seeing success
      Alert.alert("Success", "Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save cloud settings:", error);
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl.trim().replace(/\/+$/, '')}/health`);
      if (response.ok) {
        Alert.alert("Success", "Connection successful!");
      } else {
        Alert.alert("Error", "Connection failed. Please check the API URL.");
      }
    } catch (error) {
      Alert.alert("Error", "Connection failed. Please check the API URL.");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Cloud Mode Settings</Text>
          <TouchableOpacity
            onPress={onClose}
            onFocus={() => setCloseFocused(true)}
            onBlur={() => setCloseFocused(false)}
            style={[styles.closeButton, closeFocused ? styles.closeButtonFocused : null]}
            focusable
            accessible
            hasTVPreferredFocus
          >
            <Text style={styles.close}>X</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.settingRow}>
            <Text style={styles.label}>Enable Cloud Mode</Text>
            <TouchableOpacity
              style={[
                styles.toggle,
                cloudModeEnabled ? styles.toggleOn : styles.toggleOff,
                toggleFocused ? styles.toggleFocused : null,
              ]}
              onPress={() => setCloudModeEnabled(!cloudModeEnabled)}
              onFocus={() => setToggleFocused(true)}
              onBlur={() => setToggleFocused(false)}
              focusable
              accessible
            >
              <View
                style={[
                  styles.toggleKnob,
                  cloudModeEnabled ? styles.toggleKnobOn : styles.toggleKnobOff,
                ]}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.label}>Device ID</Text>
            <Text style={styles.deviceId}>{deviceId}</Text>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.label}>API URL</Text>
            <TextInput
              style={styles.input}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder={DEFAULT_TEST_CLOUD_API_URL}
              autoCapitalize="none"
              focusable
              accessible
            />
          </View>

          <TouchableOpacity
            style={[styles.testButton, testFocused ? styles.buttonFocused : null]}
            onPress={handleTestConnection}
            disabled={loading}
            onFocus={() => setTestFocused(true)}
            onBlur={() => setTestFocused(false)}
            focusable
            accessible
          >
            <Text style={styles.testButtonText}>
              {loading ? "Testing..." : "Test Connection"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveButton, saveFocused ? styles.buttonFocused : null]}
            onPress={handleSave}
            disabled={loading}
            onFocus={() => setSaveFocused(true)}
            onBlur={() => setSaveFocused(false)}
            focusable
            accessible
          >
            <Text style={styles.saveButtonText}>
              {loading ? "Saving..." : "Save Settings"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.info}>
            Cloud mode allows you to manage this device remotely via the web
            CMS. When enabled, the device will connect to the cloud backend for
            config updates and media sync.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "90%",
    maxWidth: 500,
    backgroundColor: "#222",
    borderRadius: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  close: {
    color: "#fff",
    fontSize: 24,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#333",
  },
  closeButtonFocused: {
    backgroundColor: "#555",
  },
  content: {
    padding: 20,
  },
  settingRow: {
    marginBottom: 20,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 8,
  },
  deviceId: {
    color: "#aaa",
    fontSize: 14,
    fontFamily: "monospace",
  },
  input: {
    backgroundColor: "#333",
    color: "#fff",
    padding: 12,
    borderRadius: 5,
    fontSize: 14,
  },
  toggle: {
    width: 50,
    height: 26,
    borderRadius: 13,
    padding: 2,
  },
  toggleOn: {
    backgroundColor: "#4CAF50",
  },
  toggleOff: {
    backgroundColor: "#666",
  },
  toggleFocused: {
    borderWidth: 2,
    borderColor: "#fff",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  toggleKnobOn: {
    alignSelf: "flex-end",
  },
  toggleKnobOff: {
    alignSelf: "flex-start",
  },
  testButton: {
    backgroundColor: "#2196F3",
    padding: 12,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 10,
  },
  testButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  saveButton: {
    backgroundColor: "#4CAF50",
    padding: 12,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 20,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonFocused: {
    borderWidth: 2,
    borderColor: "#fff",
  },
  info: {
    color: "#888",
    fontSize: 12,
    lineHeight: 16,
  },
});
