import { addCloudDeviceAccess } from "./cloudMediaUrl";

describe("addCloudDeviceAccess", () => {
  it("adds both credentials while preserving existing query parameters", () => {
    expect(
      addCloudDeviceAccess(
        "http://192.168.1.3:3000/api/media/file/users/u/a.mp4?download=1",
        "device-1",
        "device-token"
      )
    ).toBe(
      "http://192.168.1.3:3000/api/media/file/users/u/a.mp4?download=1&deviceId=device-1&deviceToken=device-token"
    );
  });

  it("replaces an expired device token instead of retaining it", () => {
    expect(
      addCloudDeviceAccess(
        "http://server/api/media/file/users/u/a.jpg?deviceId=old&deviceToken=expired",
        "device-1",
        "fresh-token"
      )
    ).toBe(
      "http://server/api/media/file/users/u/a.jpg?deviceId=device-1&deviceToken=fresh-token"
    );
  });

  it("leaves unrelated and non-file URLs unchanged", () => {
    expect(addCloudDeviceAccess("https://cdn.example.com/a.jpg", "device-1", "token")).toBe(
      "https://cdn.example.com/a.jpg"
    );
  });
});
