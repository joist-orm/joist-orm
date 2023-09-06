import { defaultConfig } from "./config";
import { logWarning } from "./utils";

describe("utils", () => {
  it("Config strict mode", () => {
    it("warn util throws when config set to strict", () => {
      expect(logWarning({ ...defaultConfig, strictMode: true }, "Some Error")).toThrow();
    });
    it("warn util does not throws when config not set to strict", () => {
      expect(logWarning({ ...defaultConfig, strictMode: false }, "Some Error")).not.toThrow();
    });
  });
});
