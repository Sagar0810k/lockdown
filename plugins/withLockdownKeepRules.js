const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Lockdown's native module classes are loaded through reflection at startup
 * (expo.modules.ExpoModulesPackageList and expo.modules.lockdown.LockdownModule).
 * Release builds use R8, which strips classes that have no static references, so the
 * whole module silently disappears from the APK. Keep them and the v1 registry class.
 */
module.exports = function withLockdownKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const appDir = path.join(cfg.modRequest.platformProjectRoot, 'app');
      const rulesPath = path.join(appDir, 'proguard-rules.pro');
      const marker = '# lockdown-keep-rules';

      let contents = '';
      if (fs.existsSync(rulesPath)) {
        contents = fs.readFileSync(rulesPath, 'utf8');
      }
      if (!contents.includes(marker)) {
        const rules = [
          marker,
          '# The v1 generated module registry: loaded reflectively at startup, so R8',
          '# must not strip it (the class itself, not just its members).',
          '-keep class expo.modules.ExpoModulesPackageList { *; }',
          '-keep class expo.modules.ExpoModulesInlineModulesList { *; }',
          '-keep class inline.modules.ExpoInlineModulesList { *; }',
          '# Our module and everything it uses.',
          '-keep class expo.modules.lockdown.** { *; }',
          '',
        ].join('\n');
        contents = contents.replace(/\s*$/, '\n\n') + rules;
        fs.writeFileSync(rulesPath, contents);
      }
      return cfg;
    },
  ]);
};
