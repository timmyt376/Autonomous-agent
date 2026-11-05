const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withOpenCLNativeLibrary(config) {
  return withAndroidManifest(config, mod => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error("Android application manifest entry was not found.");
    application["uses-native-library"] = application["uses-native-library"] || [];
    const entries = application["uses-native-library"];
    const exists = entries.some(entry => entry.$?.["android:name"] === "libOpenCL.so");
    if (!exists) {
      entries.push({
        $: {
          "android:name": "libOpenCL.so",
          "android:required": "false"
        }
      });
    }
    return mod;
  });
};
