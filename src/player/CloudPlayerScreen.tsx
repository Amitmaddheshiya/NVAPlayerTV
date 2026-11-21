import React from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Video from "react-native-video";
import SlideRenderer from "./SlideRenderer";
import Ticker from "./Ticker";
import ClockWidget from "./ClockWidget";
import WeatherWidget from "./WeatherWidget";
import EmergencyAlertWidget from "./EmergencyAlertWidget";

const styles = StyleSheet.create({
  rotationRoot: { flex: 1, backgroundColor: "#000000", overflow: "hidden" },
  rotatedFrame: { position: "absolute" },
  loadingRoot: { flex: 1, backgroundColor: "#000000", justifyContent: "center", alignItems: "center" },
  loadingText: { color: "#ffffff", fontSize: 18 },
  fill: { flex: 1 },
  sectionArea: { flex: 1, position: "relative", overflow: "hidden" },
});

const baseSectionFrame: any = { position: "absolute", overflow: "hidden" };
const hiddenSectionFrame: any = { ...baseSectionFrame, display: "none" };

function getRotationDegrees(value: any) {
  const legacy: Record<string, number> = { horizontal: 0, vertical: 90, "reverse-horizontal": 180, "reverse-vertical": 270 };
  const parsed = typeof value === "number" ? value : Number(value);
  const degrees = Number.isFinite(parsed) ? parsed : legacy[String(value)] ?? 0;
  return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
}

function CloudRotationFrame({ config, backgroundColor, children }: any) {
  const { width, height } = useWindowDimensions();
  const rotation = getRotationDegrees(config?.orientation);
  const quarterTurn = rotation === 90 || rotation === 270;
  const frameWidth = quarterTurn ? height : width;
  const frameHeight = quarterTurn ? width : height;
  const rotatedFrameStyle = {
    width: frameWidth,
    height: frameHeight,
    top: (height - frameHeight) / 2,
    left: (width - frameWidth) / 2,
    transform: [{ rotate: `${rotation}deg` }],
    backgroundColor: backgroundColor || "#000000",
  };
  return (
    <View style={styles.rotationRoot}>
      <View style={[styles.rotatedFrame, rotatedFrameStyle]}>
        {children}
      </View>
    </View>
  );
}

function parseRatio(value: any, count: number): number[] {
  const parts = String(value || "")
    .split(":")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length !== count) return count === 3 ? [1, 1, 1] : [1, 1];
  return parts;
}

function share(values: number[], index: number) {
  const total = values.reduce((sum, value) => sum + value, 0) || values.length || 1;
  return values[index] / total * 100;
}

function offset(values: number[], index: number) {
  return values.slice(0, index).reduce((sum, value) => sum + value, 0) /
    (values.reduce((sum, value) => sum + value, 0) || values.length || 1) * 100;
}

function getFullScreenSectionFrame(sectionIndex: number) {
  if (sectionIndex !== 0) return hiddenSectionFrame;
  return { ...baseSectionFrame, top: "0%", left: "0%", width: "100%", height: "100%" };
}

function getSplitSectionFrame(config: any, sectionIndex: number) {
  if (sectionIndex > 1) return hiddenSectionFrame;
  const ratios = parseRatio(config?.gridRatio, 2);
  const firstShare = share(ratios, 0);
  const horizontal = (config?.grid2Layout || "horizontal") === "horizontal";
  if (horizontal) {
    return {
      ...baseSectionFrame,
      top: "0%",
      left: `${sectionIndex ? firstShare : 0}%`,
      width: `${share(ratios, sectionIndex)}%`,
      height: "100%",
    };
  }
  return {
    ...baseSectionFrame,
    top: `${sectionIndex ? firstShare : 0}%`,
    left: "0%",
    width: "100%",
    height: `${share(ratios, sectionIndex)}%`,
  };
}

function getHorizontalGridFrame(ratios: number[], sectionIndex: number) {
  return {
    ...baseSectionFrame,
    top: "0%",
    left: `${offset(ratios, sectionIndex)}%`,
    width: `${share(ratios, sectionIndex)}%`,
    height: "100%",
  };
}

function getStackedGridFrame(ratios: number[], sectionIndex: number) {
  return {
    ...baseSectionFrame,
    top: `${offset(ratios, sectionIndex)}%`,
    left: "0%",
    width: "100%",
    height: `${share(ratios, sectionIndex)}%`,
  };
}

function getTopTwoGridFrame(ratios: number[], sectionIndex: number) {
  const topHeight = share(ratios, 0);
  if (sectionIndex === 2) {
    return { ...baseSectionFrame, top: `${topHeight}%`, left: "0%", width: "100%", height: `${share(ratios, 1)}%` };
  }
  return { ...baseSectionFrame, top: "0%", left: sectionIndex === 0 ? "0%" : "50%", width: "50%", height: `${topHeight}%` };
}

function getTopOneGridFrame(ratios: number[], sectionIndex: number) {
  const topHeight = share(ratios, 0);
  if (sectionIndex === 0) {
    return { ...baseSectionFrame, top: "0%", left: "0%", width: "100%", height: `${topHeight}%` };
  }
  return { ...baseSectionFrame, top: `${topHeight}%`, left: sectionIndex === 1 ? "0%" : "50%", width: "50%", height: `${share(ratios, 1)}%` };
}

function getGridSectionFrame(config: any, sectionIndex: number) {
  const arrangement = config?.grid3Layout || "stack-v";
  const ratioCount = arrangement === "stack-h" || arrangement === "stack-v" ? 3 : 2;
  const ratios = parseRatio(config?.gridRatio, ratioCount);
  if (arrangement === "stack-h") return getHorizontalGridFrame(ratios, sectionIndex);
  if (arrangement === "top-two-bottom-one") return getTopTwoGridFrame(ratios, sectionIndex);
  if (arrangement === "top-one-bottom-two") return getTopOneGridFrame(ratios, sectionIndex);
  return getStackedGridFrame(ratios, sectionIndex);
}

function getSectionFrame(config: any, sectionIndex: number) {
  const layout = config?.layout || "fullscreen";
  if (layout === "split") return getSplitSectionFrame(config, sectionIndex);
  if (layout === "grid") return getGridSectionFrame(config, sectionIndex);
  return getFullScreenSectionFrame(sectionIndex);
}

export default function CloudPlayerScreen({
  config,
  mediaVersion,
  playlistSyncAt,
  contentResetVersion,
  sectionPlaybackTimeline,
  uploadProcessingBySection,
  uploadCountsBySection,
  onPlaybackChange,
  onPlaybackError,
  emergencyAlert,
  onClearEmergencyAlert,
}: any) {
  if (!config) {
    return (
      <View style={styles.loadingRoot}>
        <Text style={styles.loadingText}>Loading cloud configuration...</Text>
      </View>
    );
  }

  const scheduleOn = !(config?.__scheduleRuntime?.enabled && !config?.__scheduleRuntime?.active);
  if (!scheduleOn) {
    const fallbackMode = config?.schedule?.fallbackMode || "black";
    const fallbackBgColor = config?.schedule?.fallbackBgColor || "#000000";
    const fallbackMediaUrl = config?.schedule?.fallbackImageUrl || "";
    return (
      <CloudRotationFrame config={config} backgroundColor={fallbackBgColor}>
        {fallbackMode === "media" && fallbackMediaUrl ? (
          <Video source={{ uri: fallbackMediaUrl }} style={styles.fill} resizeMode="cover" repeat />
        ) : null}
      </CloudRotationFrame>
    );
  }

  const ticker = config?.ticker?.text ? <Ticker ticker={config.ticker} /> : null;
  const clockConfig = config?.clock || { enabled: false };
  const weatherConfig = config?.weather || { enabled: false };

  return (
    <CloudRotationFrame config={config} backgroundColor={config?.bgColor}>
      {ticker && config.ticker?.position === "top" ? ticker : null}
      <View style={styles.sectionArea}>
        {[0, 1, 2].map((sectionIndex) => {
          const sectionFrame = getSectionFrame(config, sectionIndex);
          const hidden = sectionFrame.display === "none";
          const sectionConfig = hidden ? { ...config, __playerPaused: true } : config;
          const timeline = sectionPlaybackTimeline?.[sectionIndex + 1] || null;
          // These section renderers stay mounted through schedule/layout
          // changes. Their cached playlist and current frame survive while
          // the next layout and section content are resolved.
          return (
            <View key={`cloud-section-frame-${sectionIndex}`} style={sectionFrame} collapsable={false}>
              <SlideRenderer
                key={`cloud-section-${sectionIndex}-${Number(contentResetVersion || 0)}`}
                config={sectionConfig}
                sectionIndex={sectionIndex}
                mediaVersion={mediaVersion}
                playlistSyncAt={playlistSyncAt}
                contentResetVersion={contentResetVersion}
                sectionTimeline={timeline}
                processingMessage={uploadProcessingBySection?.[sectionIndex + 1] || ""}
                processingCount={uploadCountsBySection?.[sectionIndex + 1] || null}
                onPlaybackChange={onPlaybackChange}
                onPlaybackError={onPlaybackError}
                cloudMode={true}
              />
            </View>
          );
        })}
      </View>
      {ticker && config.ticker?.position !== "top" ? ticker : null}
      {clockConfig.enabled && <ClockWidget config={clockConfig} />}
      {weatherConfig.enabled && <WeatherWidget config={weatherConfig} />}
      <EmergencyAlertWidget
        alert={{
          active: emergencyAlert?.active || false,
          kind: emergencyAlert?.kind || "message",
          type: emergencyAlert?.type || "info",
          title: emergencyAlert?.title || "",
          message: emergencyAlert?.message || "",
          mediaUrl: emergencyAlert?.mediaUrl || "",
          mediaType: emergencyAlert?.mediaType || "",
          sound: emergencyAlert?.sound || false,
        }}
        onClear={onClearEmergencyAlert || (() => {})}
      />
    </CloudRotationFrame>
  );
}
