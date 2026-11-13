import { readAsarJson } from "app-builder-lib/out/asar/asar"
import { Platform } from "electron-builder"
import { coerceTypes } from "electron-builder/out/builder"
import { readJson } from "fs-extra"
import * as path from "path"
import { ExpectStatic } from "vitest"
import { assertThat } from "./helpers/fileAssert"
import { app, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"

function createExtraMetadataTest(expect: ExpectStatic, asar: boolean) {
  return app(
    expect,
    {
      targets: linuxDirTarget,
      config: coerceTypes({
        asar,
        linux: {
          executableName: "new-name",
        },
        extraMetadata: {
          version: "1.0.0-beta.19",
          foo: {
            bar: 12,
            updated: "true",
            disabled: "false",
          },
          rootKey: "false",
          rootKeyT: "true",
          rootKeyN: "null",
        },
      }),
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.scripts = {}
          data.foo = {
            bar: 42,
            existingProp: 22,
          }
        }),
      packed: async context => {
        await assertThat(expect, path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
        if (asar) {
          expect(await readAsarJson(path.join(context.getResources(Platform.LINUX), "app.asar"), "package.json")).toMatchSnapshot()
        }
        else {
          expect(await readJson(path.join(context.getResources(Platform.LINUX), "app", "package.json"))).toMatchSnapshot()
        }
      },
    }
  )
}

test("extra metadata", ({expect}) => createExtraMetadataTest(expect, true))
test("extra metadata (no asar)", ({expect}) => createExtraMetadataTest(expect, false))