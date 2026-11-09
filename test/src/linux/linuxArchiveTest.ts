import { Arch, Platform } from "electron-builder"
import { app, EXTENDED_TIMEOUT } from "../helpers/packTester"

// this currently needs lzip to be installed, should we just rip .lz case?
test.ifNotWindows("tar", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
  app(expect, {
    targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"], Arch.x64),
    config: {
      electronFuses: {
        runAsNode: true,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: true,
        enableNodeCliInspectArguments: true,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
        loadBrowserProcessSpecificV8Snapshot: true,
        grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
      },
    },
  })
)
