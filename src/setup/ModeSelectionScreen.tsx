import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAppMode, saveAppMode, type AppMode } from "../services/setupService";
import { getCmsAccessInfo } from "../services/embeddedCmsService";
import { DEFAULT_TEST_CLOUD_API_URL } from "../services/cloudRuntimeConfig";

const { width, height } = Dimensions.get("window");
const isPortrait = height > width;

export default function ModeSelectionScreen({
  currentMode,
  showAdminMode = true,
  onSwitchMode,
  onClose,
}: {
  currentMode: AppMode;
  showAdminMode?: boolean;
  onSwitchMode: (mode: AppMode) => void;
  onClose: () => void;
}) {
  const [cmsInfo, setCmsInfo] = useState(getCmsAccessInfo());
  const [cloudApiUrl, setCloudApiUrl] = useState<string | null>(null);
  const [cloudConnectionStatus, setCloudConnectionStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [focused, setFocused] = useState<"lan" | "cloud" | "admin" | "close" | null>(null);

  useEffect(() => {
    // Load cloud API URL when component mounts
    AsyncStorage.getItem('@signage_cloud_api_url').then((url) => setCloudApiUrl(url || DEFAULT_TEST_CLOUD_API_URL));
  }, []);

  useEffect(() => {
    if (currentMode !== 'cloudMode' || !cloudApiUrl) return;
    let active = true;
    const checkConnection = async () => {
      setCloudConnectionStatus('checking');
      try {
        const response = await fetch(`${cloudApiUrl.replace(/\/$/, '')}/health`);
        if (active) setCloudConnectionStatus(response.ok ? 'connected' : 'offline');
      } catch {
        if (active) setCloudConnectionStatus('offline');
      }
    };
    void checkConnection();
    const timer = setInterval(() => void checkConnection(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [currentMode, cloudApiUrl]);

  const handleLanMode = () => {
    onSwitchMode("tvMode");
  };

  const handleCloudMode = () => {
    onSwitchMode("cloudMode");
  };

  const handleAdminMode = () => {
    onSwitchMode("adminOnlyMode");
  };

  return (
    <View style={styles.container}>
      <View style={[styles.content, isPortrait ? styles.portraitContent : styles.landscapeContent]}>
        {/* QR Code Section - Only show for LAN/Admin mode, not Cloud mode */}
        {currentMode !== "cloudMode" && (
          <View style={[styles.qrSection, isPortrait ? styles.portraitQrSection : styles.landscapeQrSection]}>
            <View style={styles.qrRow}>
              {/* Left Column - Usage Tips */}
              <View style={styles.qrLeftCol}>
                <Text style={styles.tipsTitle}>Usage Tips</Text>
                <Text style={styles.tipText}>
                  <Text style={styles.tipBold}>LAN Mode:</Text> Use for offline playback. Content is stored locally on the TV. Access via IP address shown above.
                </Text>
                <Text style={styles.tipText}>
                  <Text style={styles.tipBold}>Cloud Mode:</Text> Use for remote management. Content is managed via cloud backend. Requires internet connection.
                </Text>
                <Text style={styles.tipText}>
                  <Text style={styles.tipBold}>Admin Only:</Text> Use to manage other TVs via their CMS. No local playback.
                </Text>
              </View>
              {/* Right Column - QR Code */}
              <View style={styles.qrRightCol}>
                <Text style={styles.qrAccessTitle}>Access CMS</Text>
                {cmsInfo.qrDataUri ? (
                  <Image source={{ uri: cmsInfo.qrDataUri }} style={[styles.qrImage, isPortrait ? styles.portraitQrImage : styles.landscapeQrImage]} />
                ) : (
                  <View style={[styles.qrPlaceholder, isPortrait ? styles.portraitQrImage : styles.landscapeQrImage]}>
                    <Text style={styles.qrPlaceholderText}>QR Code</Text>
                  </View>
                )}
                <Text style={styles.ipText}>IP: {cmsInfo.ipAddress || "Loading..."}</Text>
                <Text style={styles.urlText}>URL: {cmsInfo.localUrl}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Cloud URL Section - Only show for Cloud mode */}
        {currentMode === "cloudMode" && (
          <View style={[styles.qrSection, isPortrait ? styles.portraitQrSection : styles.landscapeQrSection]}>
            <View style={styles.cloudInfoRow}>
              <View style={styles.cloudInfoCol}>
                <Text style={styles.tipsTitle}>Cloud Connection</Text>
                <Text style={styles.tipText}>
                  <Text style={styles.tipBold}>Connected to:</Text> {cloudApiUrl || "Not connected"}
                </Text>
                <Text style={styles.tipText}>
                  <Text style={styles.tipBold}>Status:</Text> {cloudConnectionStatus === 'connected' ? 'Connected' : cloudConnectionStatus === 'offline' ? 'Offline — check the TV-reachable API URL' : 'Checking connection…'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Mode Buttons */}
        <View style={[styles.modesContainer, isPortrait ? styles.portraitModes : styles.landscapeModes]}>
          <Pressable
            onPress={handleLanMode}
            onFocus={() => setFocused("lan")}
            onBlur={() => setFocused(null)}
            style={({ pressed }) => [
              styles.modeButton,
              styles.lanButton,
              focused === "lan" ? styles.buttonFocused : null,
              pressed ? styles.buttonPressed : null,
            ]}
            focusable
            hasTVPreferredFocus
          >
            <Text style={styles.modeButtonTitle}>LAN Mode</Text>
            <Text style={styles.modeButtonHint}>Offline with embedded CMS</Text>
          </Pressable>

          <Pressable
            onPress={handleCloudMode}
            onFocus={() => setFocused("cloud")}
            onBlur={() => setFocused(null)}
            style={({ pressed }) => [
              styles.modeButton,
              styles.cloudButton,
              focused === "cloud" ? styles.buttonFocused : null,
              pressed ? styles.buttonPressed : null,
            ]}
            focusable
          >
            <Text style={styles.modeButtonTitle}>Cloud Mode</Text>
            <Text style={styles.modeButtonHint}>Remote management via cloud</Text>
          </Pressable>

          {showAdminMode && <Pressable
            onPress={handleAdminMode}
            onFocus={() => setFocused("admin")}
            onBlur={() => setFocused(null)}
            style={({ pressed }) => [
              styles.modeButton,
              styles.adminButton,
              focused === "admin" ? styles.buttonFocused : null,
              pressed ? styles.buttonPressed : null,
            ]}
            focusable
          >
            <Text style={styles.modeButtonTitle}>Admin Only</Text>
            <Text style={styles.modeButtonHint}>Manage a TV CMS</Text>
          </Pressable>}
        </View>

        {/* Close Button */}
        <Pressable
          onPress={onClose}
          onFocus={() => setFocused("close")}
          onBlur={() => setFocused(null)}
          style={({ pressed }) => [
            styles.closeButton,
            focused === "close" ? styles.buttonFocused : null,
            pressed ? styles.buttonPressed : null,
          ]}
          focusable
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0f172a",
  },
  content: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderRadius: 0,
    padding: 24,
    gap: 16,
  },
  portraitContent: {
    width: "100%",
    height: "100%",
  },
  landscapeContent: {
    width: "100%",
    height: "100%",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#f8fafc",
    textAlign: "center",
    marginBottom: 8,
  },
  qrSection: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  portraitQrSection: {
    width: "100%",
  },
  landscapeQrSection: {
    width: "100%",
  },
  qrRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  qrLeftCol: {
    flex: 1,
  },
  qrRightCol: {
    alignItems: "center",
  },
  cloudInfoRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  cloudInfoCol: {
    flex: 1,
  },
  qrAccessTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#38bdf8",
    marginBottom: 4,
  },
  qrImage: {
    resizeMode: "contain",
  },
  portraitQrImage: {
    width: 90,
    height: 90,
  },
  landscapeQrImage: {
    width: 90,
    height: 90,
  },
  qrPlaceholder: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  qrPlaceholderText: {
    color: "#64748b",
    fontSize: 12,
  },
  ipText: {
    fontSize: 11,
    color: "#cbd5e1",
  },
  urlText: {
    fontSize: 10,
    color: "#64748b",
  },
  modesContainer: {
    gap: 8,
  },
  portraitModes: {
    width: "100%",
  },
  landscapeModes: {
    width: "100%",
  },
  modeButton: {
    backgroundColor: "#334155",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  buttonFocused: {
    borderColor: "#38bdf8",
    backgroundColor: "#1e293b",
    borderWidth: 3,
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  lanButton: {
    backgroundColor: "#3b82f6",
    borderColor: "rgba(59, 130, 246, 0.5)",
  },
  cloudButton: {
    backgroundColor: "#10b981",
    borderColor: "rgba(16, 185, 129, 0.5)",
  },
  adminButton: {
    backgroundColor: "#f59e0b",
    borderColor: "rgba(245, 158, 11, 0.5)",
  },
  modeButtonTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f8fafc",
  },
  modeButtonHint: {
    fontSize: 13,
    color: "#cbd5e1",
    marginTop: 4,
  },
  tipsTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#38bdf8",
    marginBottom: 4,
  },
  tipText: {
    fontSize: 10,
    color: "#cbd5e1",
    marginBottom: 4,
    lineHeight: 14,
  },
  tipBold: {
    fontWeight: "bold",
    color: "#38bdf8",
  },
  closeButton: {
    backgroundColor: "#ef4444",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(239, 68, 68, 0.5)",
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f8fafc",
  },
});
