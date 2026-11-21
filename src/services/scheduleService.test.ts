import { getScheduleConflictPairs, resolveScheduledConfig } from "./scheduleService";

const profile = (id: string, layout: string) => ({ id, name: id, config: { layout, ticker: { text: id } } });
const at = (day: number, hour: number, minute = 0) => new Date(2026, 7, 2 + day, hour, minute);

describe("scheduleService", () => {
  const base = {
    layout: "fullscreen",
    ticker: { text: "default" },
    schedule: {
      enabled: true,
      profiles: [profile("morning", "grid2"), profile("night", "grid3")],
      entries: [
        { id: "morning", profileId: "morning", start: "09:00", end: "12:00", days: [0], priority: 1 },
        { id: "night", profileId: "night", start: "22:00", end: "02:00", days: [0], priority: 1 },
      ],
    },
  };

  it("uses the configured profile for a regular active slot", () => {
    const result = resolveScheduledConfig(base, at(0, 10));
    expect(result.activeEntry?.id).toBe("morning");
    expect(result.config.layout).toBe("grid2");
  });

  it("activates a full-day profile on every local weekday", () => {
    const config = {
      ...base,
      schedule: {
        enabled: true,
        profiles: [profile("all-day", "grid")],
        entries: [{ id: "all-day", profileId: "all-day", start: "00:00", end: "00:00", days: [0, 1, 2, 3, 4, 5, 6] }],
      },
    };
    expect(resolveScheduledConfig(config, at(0, 0)).config.layout).toBe("grid");
    expect(resolveScheduledConfig(config, at(6, 23, 59)).config.layout).toBe("grid");
  });

  it("activates a day-wise full-day profile only on selected weekdays", () => {
    const config = {
      ...base,
      schedule: {
        enabled: true,
        profiles: [profile("weekend", "grid")],
        entries: [{ id: "weekend", profileId: "weekend", start: "00:00", end: "00:00", days: [0, 6] }],
      },
    };
    expect(resolveScheduledConfig(config, at(0, 12)).config.layout).toBe("grid");
    expect(resolveScheduledConfig(config, at(1, 12)).config.layout).toBe("fullscreen");
    expect(resolveScheduledConfig(config, at(6, 12)).config.layout).toBe("grid");
  });

  it("matches date-wise rules only on their selected date", () => {
    const config = {
      ...base,
      schedule: {
        enabled: true,
        profiles: [profile("special-date", "grid")],
        entries: [{ id: "special-date", profileId: "special-date", dates: ["2026-08-02"], start: "09:00", end: "17:00" }],
      },
    };
    expect(resolveScheduledConfig(config, at(0, 12)).config.layout).toBe("grid");
    expect(resolveScheduledConfig(config, at(1, 12)).config.layout).toBe("fullscreen");
  });

  it("keeps a date-wise overnight rule active after midnight on the next date", () => {
    const config = {
      ...base,
      schedule: {
        enabled: true,
        profiles: [profile("overnight-date", "grid")],
        entries: [{ id: "overnight-date", profileId: "overnight-date", dates: ["2026-08-02"], start: "22:00", end: "02:00" }],
      },
    };
    expect(resolveScheduledConfig(config, at(0, 23)).config.layout).toBe("grid");
    expect(resolveScheduledConfig(config, at(1, 1)).config.layout).toBe("grid");
    expect(resolveScheduledConfig(config, at(1, 3)).config.layout).toBe("fullscreen");
  });

  it("keeps a midnight-crossing slot active on the following day", () => {
    const result = resolveScheduledConfig(base, at(1, 1));
    expect(result.activeEntry?.id).toBe("night");
    expect(result.config.layout).toBe("grid3");
  });

  it("uses the higher priority entry when slots overlap", () => {
    const config = { ...base, schedule: { ...base.schedule, entries: [
      { id: "low", profileId: "morning", start: "09:00", end: "13:00", days: [0], priority: 1 },
      { id: "high", profileId: "night", start: "10:00", end: "11:00", days: [0], priority: 5 },
    ] } };
    expect(resolveScheduledConfig(config, at(0, 10, 30)).activeEntry?.id).toBe("high");
  });

  it("detects a cross-midnight conflict", () => {
    const conflicts = getScheduleConflictPairs([
      { id: "late", start: "22:00", end: "02:00", days: [0] },
      { id: "early", start: "01:00", end: "03:00", days: [1] },
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it("does not schedule when Enable Schedule is off", () => {
    const config = { ...base, schedule: { ...base.schedule, enabled: false } };
    const result = resolveScheduledConfig(config, at(0, 10));
    expect(result.enabled).toBe(false);
    expect(result.activeEntry).toBeNull();
    expect(result.config).toBe(config);
  });
});
