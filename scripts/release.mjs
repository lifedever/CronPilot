import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const targets = ['aarch64-apple-darwin', 'x86_64-apple-darwin'];
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

const results = {
  version: `v${version}`,
  notes: `Release v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {}
};

const repo = 'lifedever/CronPilot';
const tag = `v${version}`;

for (const target of targets) {
  console.log(`\n🚀 Building for target: ${target}...\n`);

  // Phase 1: Build .app + updater artifacts
  try {
    console.log(`📦 Phase 1: Building app bundle for ${target}...`);
    execSync(`npx tauri build --target ${target} --bundles app`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Error building app for ${target}:`, err.message);
    process.exit(1);
  }

  // Phase 2: Build DMG (allowed to fail)
  try {
    console.log(`\n💿 Phase 2: Building DMG for ${target}...`);
    execSync(`npx tauri build --target ${target} --bundles dmg`, { stdio: 'inherit' });
    console.log(`✅ DMG created for ${target}`);
  } catch (err) {
    console.warn(`⚠️ DMG creation failed for ${target} (non-fatal): ${err.message}`);
  }

  // Collect updater artifacts
  const bundleDir = path.join('src-tauri', 'target', target, 'release', 'bundle', 'macos');

  if (fs.existsSync(bundleDir)) {
    const files = fs.readdirSync(bundleDir);
    const tarGzFile = files.find(f => f.endsWith('.tar.gz') && !f.endsWith('.sig'));
    const sigFile = files.find(f => f.endsWith('.tar.gz.sig'));

    if (tarGzFile && sigFile) {
      const signature = fs.readFileSync(path.join(bundleDir, sigFile), 'utf8').trim();
      const tauriPlatform = target.startsWith('aarch64') ? 'darwin-aarch64' : 'darwin-x86_64';
      const arch = target.startsWith('aarch64') ? 'aarch64' : 'x86_64';

      const baseName = tarGzFile.replace('.app.tar.gz', '');
      const safeBaseName = baseName.replace(/ /g, '_');
      const renamedTarGz = `${safeBaseName}_${arch}.app.tar.gz`;

      fs.copyFileSync(
        path.join(bundleDir, tarGzFile),
        path.join(bundleDir, renamedTarGz)
      );

      results.platforms[tauriPlatform] = {
        signature,
        url: `https://github.com/${repo}/releases/download/${tag}/${renamedTarGz}`
      };

      console.log(`✅ Collected updater info for ${tauriPlatform}`);
    } else {
      console.warn(`⚠️ Missing updater artifacts in ${bundleDir}`);
    }
  } else {
    console.error(`❌ Bundle directory does not exist: ${bundleDir}`);
  }
}

fs.writeFileSync('latest.json', JSON.stringify(results, null, 2));
console.log(`\n✨ latest.json created`);
console.log(JSON.stringify(results, null, 2));

if (Object.keys(results.platforms).length === 0) {
  console.error('\n❌ No platforms collected!');
  process.exit(1);
}
