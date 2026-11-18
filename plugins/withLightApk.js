const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Lockdown targets modern phones only. Restricting ABI splits to arm64-v8a
 * drops ~44 MB of x86/x86_64/armeabi-v7a native libraries from the APK.
 * To also support 32-bit devices, change the filter to: ['arm64-v8a', 'armeabi-v7a'].
 */
module.exports = function withLightApk(config) {
  return withAppBuildGradle(config, (cfg) => {
    const { modResults } = cfg;
    if (modResults.contents.includes('abiFilters')) {
      return cfg; // already applied
    }
    if (modResults.language === 'groovy') {
      modResults.contents = modResults.contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {\n        ndk {\n            abiFilters 'arm64-v8a'\n        }`
      );
    } else {
      modResults.contents = modResults.contents.replace(
        /defaultConfig\s*\{/,
        `defaultConfig {\n        ndk {\n            abiFilters += listOf("arm64-v8a")\n        }`
      );
    }
    return cfg;
  });
};
