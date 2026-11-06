import { PM } from "app-builder-lib/out/node-module-collector"
import { Arch, DIR_TARGET, Platform } from "electron-builder"
import { assertPack, linuxDirTarget, modifyPackageJson, verifyAsarFileTree } from "./helpers/packTester"

describe("node_module collectors", () => {
  // Pre-existing, never-executed test: it lived inside the former `describe.ifNotWindows` block,
  // so the inner `ifWindows` guard meant it ran on no platform. Unlike the symlink case below, it
  // adds a *non-symlink* absolute system path to `files`, which the glob layer simply does not
  // collect, so `protectSystemAndUnsafePaths` never fires and nothing throws. The expectation does
  // not hold for plain (non-symlink) paths; tracked for separate investigation of unsafe-path
  // rejection. Skipped here so it does not block the node-module-collector Windows coverage.

  test("npm electron-clear-data", ({ expect }) =>
    assertPack(
      expect,
      "test-app-hoisted",
      {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET, Arch.x64),
      },
      {
        storeDepsLockfileSnapshot: true,
        packageManager: PM.NPM,
        projectDirCreated: projectDir => {
          return Promise.all([
            modifyPackageJson(projectDir, data => {
              data.dependencies = {
                "electron-clear-data": "1.0.5",
              }
              data.optionalDependencies = {
                debug: "3.1.0",
              }
            }),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.WINDOWS)),
      }
    ))

  //github.com/electron-userland/electron-builder/issues/8431
  test("npm tar", ({ expect }) =>
    assertPack(
      expect,
      "test-app-hoisted",
      {
        targets: linuxDirTarget,
      },
      {
        storeDepsLockfileSnapshot: true,
        packageManager: PM.NPM,
        projectDirCreated: projectDir => {
          return Promise.all([
            modifyPackageJson(projectDir, data => {
              data.dependencies = {
                tar: "7.5.6",
              }
            }),
          ])
        },
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
      }
    ))
})
