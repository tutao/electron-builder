import { GenericServerOptions } from "builder-util-runtime"
import { Arch, createTargets, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
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
      targets: createTargets([Platform.LINUX, Platform.MAC], "zip", "x64"),
      config: {
        publish: {
          provider: "generic",
          url: "http://example.org/${channel}/${os}",
        },
      },
    },
    {
      publish: "always",
      // FIXME: will fail
      projectDirCreated: async () => {},
      packed: context => {
        expect((context.packager.config.publish as GenericServerOptions).url).toBe("http://exmaple.org/stable/linux")
        return Promise.resolve()
      },
    }
  )
)

// https://github.com/electron-userland/electron-builder/issues/3261
test.ifNotWindows("custom provider", ({ expect }) =>
  app(
    expect,
    {
      targets: createTargets([Platform.LINUX], "deb", "x64"),
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
