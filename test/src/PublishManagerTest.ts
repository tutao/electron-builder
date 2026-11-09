import { GenericServerOptions } from "builder-util-runtime"
import { Arch, createTargets, Platform } from "electron-builder"
import { outputFile, readFile } from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app } from "./helpers/packTester"

function genericPublisher(url: string): GenericServerOptions {
  return {
    provider: "generic",
    url,
  }
}

test.ifNotWindows("generic", ({ expect }) =>
  app(expect, {
    targets: Platform.MAC.createTarget("zip", Arch.x64),
    config: {
      generateUpdatesFilesForAllChannels: true,
      mac: {
        electronUpdaterCompatibility: ">=2.16",
      },
      publish: [genericPublisher("https://example.com/downloads")],
    },
  })
)

// otherwise test "os macro" always failed for pull requests
process.env.PUBLISH_FOR_PULL_REQUEST = "true"

test.ifNotWindows("os macro", ({ expect }) =>
  app(
    expect,
    {
      targets: createTargets([Platform.LINUX], "zip", "x64"),
      config: {
        publish: {
          provider: "generic",
          url: "http://example.org/${channel}/${os}",
        },
      },
    },
    {
      publish: "always",
      projectDirCreated: async () => {},
      packed: async context => {
        const dir = path.join(context.projectDir, "dist/linux-unpacked")
        await assertThat(expect, dir).isDirectory()
        const outputYamlContents = await readFile(path.join(dir, "resources", "app-update.yml"), "utf-8")
        const outputYaml = load(outputYamlContents) as Record<string, string>
        expect(outputYaml["url"]).toBe("http://example.org/latest/linux")
      },
    }
  )
)

// https://github.com/electron-userland/electron-builder/issues/3261
test.ifNotWindows("custom provider", ({ expect }) =>
  app(
    expect,
    {
      targets: createTargets([Platform.LINUX], "zip", "x64"),
      config: {
        publish: {
          provider: "custom",
          boo: "foo",
        },
      },
    },
    {
      publish: "never",
      projectDirCreated: projectDir =>
        outputFile(
          path.join(projectDir, "build/electron-publisher-custom.js"),
          `class Publisher {
    async upload(task) {
    }
  }

  module.exports = Publisher`
        ),
    }
  )
)
