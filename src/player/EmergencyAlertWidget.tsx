import React, { useState, useEffect } from "react";
import { Text, View, Pressable, Image, NativeModules } from "react-native";
import Video from "react-native-video";

interface EmergencyAlertData {
  active: boolean;
  kind?: "message" | "media";
  type: string;
  title: string;
  message: string;
  mediaUrl?: string;
  mediaType?: string;
  sound: boolean;
}

const VIDEO_RE = /\.(mp4|m4v|mov|mkv|webm|avi|3gp|mpg|mpeg)(\?|#|$)/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp)(\?|#|$)/i;

function isVideoAlert(alert: EmergencyAlertData): boolean {
  const mime = String(alert?.mediaType || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  if (mime.startsWith("image/")) return false;
  return VIDEO_RE.test(String(alert?.mediaUrl || ""));
}

function isImageAlert(alert: EmergencyAlertData): boolean {
  const mime = String(alert?.mediaType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("video/")) return false;
  return IMAGE_RE.test(String(alert?.mediaUrl || ""));
}

const EmergencyAlertWidget = ({ alert, onClear }: { alert: EmergencyAlertData; onClear: () => void }) => {
  const [flash, setFlash] = useState<boolean>(false);
  const [mediaFailed, setMediaFailed] = useState<boolean>(false);

  const hasMedia = alert?.kind === "media" && !!alert?.mediaUrl;
  const showVideo = hasMedia && isVideoAlert(alert) && !mediaFailed;
  const showImage = hasMedia && isImageAlert(alert) && !mediaFailed;

  useEffect(() => {
    if (!alert?.active) {
      setMediaFailed(false);
      return;
    }

    // Play siren if module exists
    if (alert.sound && (NativeModules as any)?.DeviceIdModule?.playSirenAlarm) {
      (NativeModules as any).DeviceIdModule.playSirenAlarm();
    }

    const interval = setInterval(() => setFlash((prev) => !prev), 500);
    return () => {
      clearInterval(interval);
      // Stop siren if module exists
      if ((NativeModules as any)?.DeviceIdModule?.stopSirenAlarm) {
        (NativeModules as any).DeviceIdModule.stopSirenAlarm();
      }
    };
  }, [alert?.active, alert?.sound]);

  if (!alert?.active) return null;

  const handleClear = () => {
    if ((NativeModules as any)?.DeviceIdModule?.stopSirenAlarm) {
      (NativeModules as any).DeviceIdModule.stopSirenAlarm();
    }
    onClear();
  };

  // Use type-based colors for triggered alerts
  const typeBasedBgColor = alert.type === "FIRE" ? "#ef4444" : alert.type === "EVACUATION" ? "#f97316" : alert.type === "GENERAL" ? "#0284c7" : "#ef4444";
  const baseBg = typeBasedBgColor;
  const textColor = "#ffffff";

  // Create a darker version for flash effect
  const bg = flash ? baseBg : adjustColor(baseBg, -30);

  const clearButton = (
    <Pressable
      onPress={handleClear}
      style={{
        marginTop: 24,
        backgroundColor: "#ffffff",
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: "#000000", fontSize: 16, fontWeight: "bold" }}>REJECT / CLEAR ALERT</Text>
    </Pressable>
  );

  // Media mode: fullscreen image or video with an alert bar on top.
  if (showVideo || showImage) {
    return (
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000000", zIndex: 99999 }}>
        {showVideo ? (
          <Video
            source={{ uri: String(alert.mediaUrl) }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
            repeat
            muted={!alert.sound}
            playInBackground={false}
            playWhenInactive={false}
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <Image
            source={{ uri: String(alert.mediaUrl) }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
            resizeMode="cover"
            onError={() => setMediaFailed(true)}
          />
        )}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            paddingVertical: 14,
            paddingHorizontal: 24,
            alignItems: "center",
          }}
        >
          <Text style={{ color: textColor, fontSize: 30, fontWeight: "900", textAlign: "center", textTransform: "uppercase", letterSpacing: 2 }}>
            {alert.title || "🚨 EMERGENCY ALERT"}
          </Text>
          {!!alert.message && (
            <Text style={{ color: textColor, fontSize: 20, fontWeight: "bold", textAlign: "center", marginTop: 8 }}>
              {alert.message}
            </Text>
          )}
        </View>
        <View style={{ position: "absolute", bottom: 32, left: 0, right: 0, alignItems: "center" }}>
          {clearButton}
        </View>
      </View>
    );
  }

  // Message mode (or media failed to load): classic fullscreen alert.
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: bg,
        zIndex: 99999,
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <Text
        style={{
          color: textColor,
          fontSize: 48,
          fontWeight: "900",
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {alert.title || "🚨 EMERGENCY ALERT"}
      </Text>
      <Text
        style={{
          color: textColor,
          fontSize: 26,
          fontWeight: "bold",
          textAlign: "center",
          marginTop: 24,
          lineHeight: 36,
        }}
      >
        {alert.message || "PLEASE EVACUATE IMMEDIATELY!"}
      </Text>
      {clearButton}
    </View>
  );
};

// Helper function to darken/lighten hex color
function adjustColor(color: string, amount: number): string {
  const hex = color.replace("#", "");
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

export default EmergencyAlertWidget;
