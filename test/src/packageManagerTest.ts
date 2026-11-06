import { Platform } from "app-builder-lib"
import { PM } from "app-builder-lib/src/node-module-collector"
import { spawn } from "builder-util"
import { outputFile } from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, assertPack, getPackageManagerWithVersion, linuxDirTarget, modifyPackageJson, verifyAsarFileTree } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"

const npmVersion = getPackageManagerWithVersion(PM.NPM).prepareEntry

const packageConfig = (data: any, version: string) => {
  data.packageManager = version
  data.name = "hello-world"
  data.version = "1.0.0"
  data.dependencies = {
    ...data.debpendencies,
    debug: "4.4.3",
  }
  data.devDependencies = {
    electron: ELECTRON_VERSION,
  }
  data.optionalDependencies = {}
  return data
}

describe("Package Managers", () => {
  // Test for npm package manager
  test("npm", ({ expect }) =>
    app(
      expect,
      {
        targets: linuxDirTarget,
      },
      {
        storeDepsLockfileSnapshot: true,
        packed: context => verifyAsarFileTree(expect, context.getResources(Platform.LINUX)),
        projectDirCreated: projectDir => modifyPackageJson(projectDir, data => packageConfig(data, npmVersion), false),
      }
    ))

  // Test for local file:// protocol

  Object.values(PM).forEach(pm => {
    test(`local file:// protocol with ${pm} for project outside workspace`, ({ expect }) => {
      return assertPack(
        expect,
        "test-app-one",
        {
          targets: linuxDirTarget,
          config: {
            files: ["**/*"],
            asarUnpack: ["**/node_modules/foo/**/*"],
          },
        },
        {
          storeDepsLockfileSnapshot: false,
          packageManager: pm,
          projectDirCreated: async (projectDir, tmpDir, testEnv) => {
            const tempDir = await tmpDir.getTempDir()
            const localPath = path.join(tempDir, "foo")
            await outputFile(path.join(localPath, "package.json"), `{"name":"foo","version":"9.0.0","main":"index.js","license":"MIT","dependencies":{"ms":"2.0.0"}}`)
            await outputFile(path.join(localPath, "index.js"), `module.exports = require("ms")`)

            const pmCommand = getPackageManagerWithVersion(pm).cli
            await spawn(pmCommand, ["install"], {
              cwd: projectDir,
              env: { ...testEnv, YARN_ENABLE_IMMUTABLE_INSTALLS: "false" },
              stdio: "ignore",
            })
            await modifyPackageJson(projectDir, data => {
              data.dependencies = {
                foo: `file:${localPath}`,
              }
            })

            //`localPath` is dynamic and changes for every which causes `--frozen-lockfile` and `npm ci` to fail
            await spawn(pmCommand, ["install"], {
              cwd: projectDir,
              env: { ...testEnv, YARN_ENABLE_IMMUTABLE_INSTALLS: "false" },
              stdio: "ignore",
            })
          },
          packed: async context => {
            const resources = context.getResources(Platform.LINUX)
            await assertThat(expect, path.join(resources, "app.asar.unpacked", "node_modules", "foo", "package.json")).isFile()
          },
        }
      )
    })
  })
})
