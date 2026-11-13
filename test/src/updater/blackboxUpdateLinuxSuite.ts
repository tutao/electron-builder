import { ToolsetConfig } from "app-builder-lib"
import { Arch } from "electron-builder"
import { TestContext } from "vitest"
import { optionsForFlakyE2E, runTest } from "./blackboxUpdateHelpers"

export function registerBlackboxLinuxTests(toolset: Required<Pick<ToolsetConfig, "appimage">>): void {
  const appimage = toolset.appimage
  describe(`appimage tool: ${appimage}`, optionsForFlakyE2E, () => {
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "arm64")("AppImage - arm64", async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.arm64, {appimage})
    })

    // only works on x64, so this will fail on arm64 macs due to arch mismatch
    test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true" && process.arch === "x64")("AppImage - x64", async (context: TestContext) => {
      await runTest(context, "AppImage", "appimage", Arch.x64, {appimage})
    })
  })
}
