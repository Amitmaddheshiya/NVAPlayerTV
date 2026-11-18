import React from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Video, { BufferingStrategyType } from "react-native-video";
import { WebView } from "react-native-webview";
import SlideRenderer from "./SlideRenderer";
import Ticker from "./Ticker";
import ClockWidget from "./ClockWidget";
import WeatherWidget from "./WeatherWidget";
import EmergencyAlertWidget from "./EmergencyAlertWidget";

const GRID_GAP = 0;

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
  return (
    <View style={{ flex: 1, backgroundColor: "#000000", overflow: "hidden" }}>
      <View style={{
        width: frameWidth,
        height: frameHeight,
        position: "absolute",
        top: (height - frameHeight) / 2,
        left: (width - frameWidth) / 2,
        transform: [{ rotate: `${rotation}deg` }],
        backgroundColor: backgroundColor || "#000000",
      }}>
        {children}
      </View>
    </View>
  );
}

function parseRatio(value: any, count: number): number[] {
  const parts = String(value || "")
    .split(":")
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (parts.length !== count) return count === 3 ? [1, 1, 1] : [1, 1];
  return parts;
}

export default function CloudPlayerScreen({
  config,
  mediaVersion,
  sectionMediaVersion,
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
  // Show loading state if config is null
  if (!config) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000", justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "#ffffff", fontSize: 18 }}>Loading cloud configuration...</Text>
      </View>
    );
  }

  // Cloud mode - no embedded CMS, only cloud config
  const scheduleOn = !(config?.__scheduleRuntime?.enabled && !config?.__scheduleRuntime?.active);
  const getSectionKey = (sectionIndex: number) => {
    const timeline = sectionPlaybackTimeline?.[sectionIndex + 1] || null;
    const cycle = String(timeline?.cycleId || timeline?.syncAt || "none");
    const sectionVersion = Number(sectionMediaVersion?.[sectionIndex + 1] || 0);
    // Keep a section mounted during ordinary config/media refreshes. Its existing
    // content remains visible while SlideRenderer loads the new playlist.
    return `section-${sectionIndex}-${config?.layout || "fullscreen"}-${config?.grid2Layout || ""}-${config?.grid3Layout || ""}-${Number(contentResetVersion || 0)}-${sectionVersion}-${cycle}`;
  };
  const grid3Layout = config?.grid3Layout || "stack-v";
  const grid2Layout = config?.grid2Layout || "horizontal";
  const gridRatio = config?.gridRatio || "1:1:1";
  const ticker = config?.ticker?.text ? <Ticker ticker={config.ticker} /> : null;
  
  const renderGrid3 = () => {
    if (grid3Layout === "stack-h") {
      const [a, b, c] = parseRatio(gridRatio, 3);
      return (
        <View style={{ flex: 1, flexDirection: "row", gap: GRID_GAP }}>
          <View style={{ flex: a, marginRight: GRID_GAP / 2 }}>
            <SlideRenderer
              key={getSectionKey(0)}
              sectionIndex={0}
              config={config}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[1] || null}
              processingMessage={uploadProcessingBySection?.[1] || ""}
              processingCount={uploadCountsBySection?.[1] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
          </View>
          <View style={{ flex: b, marginHorizontal: GRID_GAP / 2 }}>
            <SlideRenderer
              key={getSectionKey(1)}
              sectionIndex={1}
              config={config}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[2] || null}
              processingMessage={uploadProcessingBySection?.[2] || ""}
              processingCount={uploadCountsBySection?.[2] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
          </View>
          <View style={{ flex: c, marginLeft: GRID_GAP / 2 }}>
            <SlideRenderer
              key={getSectionKey(2)}
              sectionIndex={2}
              config={config}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[3] || null}
              processingMessage={uploadProcessingBySection?.[3] || ""}
              processingCount={uploadCountsBySection?.[3] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
          </View>
        </View>
      );
    }

    if (grid3Layout === "top-two-bottom-one") {
      const [top, bottom] = parseRatio(gridRatio, 2);
      return (
        <View style={{ flex: 1, gap: GRID_GAP }}>
          <View style={{ flex: top, flexDirection: "row", gap: GRID_GAP }}>
            <View style={{ flex: 1, marginRight: GRID_GAP / 2 }}>
              <SlideRenderer
                key={getSectionKey(0)}
              sectionIndex={0}
              config={config}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[1] || null}
              processingMessage={uploadProcessingBySection?.[1] || ""}
              processingCount={uploadCountsBySection?.[1] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
            </View>
            <View style={{ flex: 1, marginLeft: GRID_GAP / 2 }}>
              <SlideRenderer
                key={getSectionKey(1)}
              sectionIndex={1}
              config={config}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[2] || null}
              processingMessage={uploadProcessingBySection?.[2] || ""}
              processingCount={uploadCountsBySection?.[2] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
            </View>
          </View>
          <View style={{ flex: bottom }}>
            <SlideRenderer
              key={getSectionKey(2)}
              sectionIndex={2}
              config={config}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[3] || null}
              processingMessage={uploadProcessingBySection?.[3] || ""}
              processingCount={uploadCountsBySection?.[3] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
          </View>
        </View>
      );
    }

    if (grid3Layout === "top-one-bottom-two") {
      const [top, bottom] = parseRatio(gridRatio, 2);
      return (
        <View style={{ flex: 1, gap: GRID_GAP }}>
          <View style={{ flex: top }}>
            <SlideRenderer
              key={getSectionKey(0)}
              sectionIndex={0}
              config={config}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[1] || null}
              processingMessage={uploadProcessingBySection?.[1] || ""}
              processingCount={uploadCountsBySection?.[1] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
          </View>
          <View style={{ flex: bottom, flexDirection: "row", gap: GRID_GAP }}>
            <View style={{ flex: 1, marginRight: GRID_GAP / 2 }}>
              <SlideRenderer
                key={getSectionKey(1)}
                sectionIndex={1}
                config={config}
                mediaVersion={mediaVersion}
                playlistSyncAt={playlistSyncAt}
                contentResetVersion={contentResetVersion}
                sectionTimeline={sectionPlaybackTimeline?.[2] || null}
                processingMessage={uploadProcessingBySection?.[2] || ""}
                processingCount={uploadCountsBySection?.[2] || null}
                onPlaybackChange={onPlaybackChange}
                onPlaybackError={onPlaybackError}
                cloudMode={true}
              />
            </View>
            <View style={{ flex: 1, marginLeft: GRID_GAP / 2 }}>
              <SlideRenderer
                key={getSectionKey(2)}
                sectionIndex={2}
                config={config}
                mediaVersion={mediaVersion}
                playlistSyncAt={playlistSyncAt}
                contentResetVersion={contentResetVersion}
                sectionTimeline={sectionPlaybackTimeline?.[3] || null}
                processingMessage={uploadProcessingBySection?.[3] || ""}
              processingCount={uploadCountsBySection?.[3] || null}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
            </View>
          </View>
        </View>
      );
    }

    const [a, b, c] = parseRatio(gridRatio, 3);
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: a, marginBottom: GRID_GAP / 2 }}>
          <SlideRenderer
            key={getSectionKey(0)}
            sectionIndex={0}
            config={config}
            mediaVersion={mediaVersion}
            playlistSyncAt={playlistSyncAt}
            contentResetVersion={contentResetVersion}
            sectionTimeline={sectionPlaybackTimeline?.[1] || null}
            processingMessage={uploadProcessingBySection?.[1] || ""}
            processingCount={uploadCountsBySection?.[1] || null}
            onPlaybackChange={onPlaybackChange}
            onPlaybackError={onPlaybackError}
            cloudMode={true}
          />
        </View>
        <View style={{ flex: b, marginVertical: GRID_GAP / 2 }}>
          <SlideRenderer
            key={getSectionKey(1)}
            sectionIndex={1}
            config={config}
            mediaVersion={mediaVersion}
            playlistSyncAt={playlistSyncAt}
            contentResetVersion={contentResetVersion}
            sectionTimeline={sectionPlaybackTimeline?.[2] || null}
            processingMessage={uploadProcessingBySection?.[2] || ""}
            processingCount={uploadCountsBySection?.[2] || null}
            onPlaybackChange={onPlaybackChange}
            onPlaybackError={onPlaybackError}
            cloudMode={true}
          />
        </View>
        <View style={{ flex: c, marginTop: GRID_GAP / 2 }}>
          <SlideRenderer
            key={getSectionKey(2)}
            sectionIndex={2}
            config={config}
            mediaVersion={mediaVersion}
            playlistSyncAt={playlistSyncAt}
            contentResetVersion={contentResetVersion}
            sectionTimeline={sectionPlaybackTimeline?.[3] || null}
            processingMessage={uploadProcessingBySection?.[3] || ""}
            processingCount={uploadCountsBySection?.[3] || null}
            onPlaybackChange={onPlaybackChange}
            onPlaybackError={onPlaybackError}
            cloudMode={true}
          />
        </View>
      </View>
    );
  };

  const renderGrid2 = () => {
    const [left, right] = parseRatio(gridRatio, 2);
    const isHorizontal = grid2Layout === "horizontal";

    if (!isHorizontal) {
      return (
        <View style={{ flex: 1, flexDirection: "column", gap: GRID_GAP }}>
          <View style={{ flex: left, marginBottom: GRID_GAP / 2 }}>
            <SlideRenderer
              key={getSectionKey(0)}
              config={config}
              sectionIndex={0}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[1] || null}
              processingMessage={uploadProcessingBySection?.[1] || ""}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
          </View>
          <View style={{ flex: right, marginTop: GRID_GAP / 2 }}>
            <SlideRenderer
              key={getSectionKey(1)}
              config={config}
              sectionIndex={1}
              mediaVersion={mediaVersion}
              playlistSyncAt={playlistSyncAt}
              contentResetVersion={contentResetVersion}
              sectionTimeline={sectionPlaybackTimeline?.[2] || null}
              processingMessage={uploadProcessingBySection?.[2] || ""}
              onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
            />
          </View>
        </View>
      );
    }

    return (
      <View style={{ flex: 1, flexDirection: "row", gap: GRID_GAP }}>
        <View style={{ flex: left, marginRight: GRID_GAP / 2 }}>
          <SlideRenderer
            key={getSectionKey(0)}
            config={config}
            sectionIndex={0}
            mediaVersion={mediaVersion}
            playlistSyncAt={playlistSyncAt}
            contentResetVersion={contentResetVersion}
            sectionTimeline={sectionPlaybackTimeline?.[1] || null}
            processingMessage={uploadProcessingBySection?.[1] || ""}
            onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
          />
        </View>
        <View style={{ flex: right, marginLeft: GRID_GAP / 2 }}>
          <SlideRenderer
            key={getSectionKey(1)}
            config={config}
            sectionIndex={1}
            mediaVersion={mediaVersion}
            playlistSyncAt={playlistSyncAt}
            contentResetVersion={contentResetVersion}
            sectionTimeline={sectionPlaybackTimeline?.[2] || null}
            processingMessage={uploadProcessingBySection?.[2] || ""}
            onPlaybackChange={onPlaybackChange}
              onPlaybackError={onPlaybackError}
              cloudMode={true}
          />
        </View>
      </View>
    );
  };

  if (!scheduleOn) {
    const fallbackMode = config?.schedule?.fallbackMode || "black";
    const fallbackBgColor = config?.schedule?.fallbackBgColor || "#000000";
    const fallbackMediaUrl = config?.schedule?.fallbackImageUrl || "";
    
    if (fallbackMode === "media" && fallbackMediaUrl) {
      return (
        <CloudRotationFrame config={config} backgroundColor={fallbackBgColor}>
          <Video
            source={{ uri: fallbackMediaUrl }}
            style={{ flex: 1 }}
            resizeMode="cover"
            repeat
          />
        </CloudRotationFrame>
      );
    }
    
    return (
      <CloudRotationFrame config={config} backgroundColor={fallbackBgColor} />
    );
  }

  const clockConfig = config?.clock || { enabled: false };
  const weatherConfig = config?.weather || { enabled: false };
  const layout = config?.layout || "fullscreen";

  return (
    <CloudRotationFrame config={config} backgroundColor={config?.bgColor}>
      {ticker && config.ticker?.position === "top" ? ticker : null}
      <View style={{ flex: 1 }}>
        {layout === "fullscreen" && (
          <SlideRenderer
            key={getSectionKey(0)}
            config={config}
            sectionIndex={0}
            mediaVersion={mediaVersion}
            playlistSyncAt={playlistSyncAt}
            contentResetVersion={contentResetVersion}
            sectionTimeline={sectionPlaybackTimeline?.[1] || null}
            processingMessage={uploadProcessingBySection?.[1] || ""}
            processingCount={uploadCountsBySection?.[1] || null}
            onPlaybackChange={onPlaybackChange}
            onPlaybackError={onPlaybackError}
            cloudMode={true}
          />
        )}
        {layout === "split" && renderGrid2()}
        {layout === "grid" && renderGrid3()}
      </View>
      {ticker && config.ticker?.position !== "top" ? ticker : null}

      {/* Widgets */}
      {clockConfig.enabled && <ClockWidget config={clockConfig} />}
      {weatherConfig.enabled && <WeatherWidget config={weatherConfig} />}
      <EmergencyAlertWidget
        alert={{
          active: emergencyAlert?.active || false,
          type: emergencyAlert?.type || "info",
          title: emergencyAlert?.title || "",
          message: emergencyAlert?.message || "",
          sound: emergencyAlert?.sound || false,
        }}
        onClear={onClearEmergencyAlert || (() => {})}
      />
    </CloudRotationFrame>
  );
}
