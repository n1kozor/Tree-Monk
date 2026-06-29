// Ad-hoc code-sign the macOS app after packing.
//
// We have no paid Apple Developer ID, so the build is not notarized. But on
// Apple Silicon (arm64) an *unsigned* app is reported by Gatekeeper as
// "damaged and can't be opened" — which scares users into trashing it. An
// ad-hoc signature (codesign -s -) is enough to make the binary valid for
// arm64, so the warning downgrades to the normal "unidentified developer"
// dialog that a right-click → Open bypasses once.
//
// Best-effort: any failure is non-fatal so the CI build still produces a dmg.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
    // eslint-disable-next-line no-console
    console.log(`afterPack: ad-hoc signed ${appPath}`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('afterPack: ad-hoc codesign failed (non-fatal):', err && err.message)
  }
}
