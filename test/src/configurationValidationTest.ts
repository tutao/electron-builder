import { validateConfiguration } from "app-builder-lib/out/util/config/config"
import { Arch, DebugLogger } from "builder-util"
import { Configuration, Platform } from "electron-builder"
import { app, appThrows, linuxDirTarget } from "./helpers/packTester"

test.ifNotWindows("validation", ({expect}) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        foo: 123,
        mac: {
          foo: 12123,
        },
      } as any,
    },
    undefined,
    error => error.message.includes("configuration has an unknown property 'foo'")
  )
)

test.ifNotWindows("appId as object", ({expect}) =>
  appThrows(expect, {
    targets: linuxDirTarget,
    config: {
      appId: {},
    } as any,
  })
)

// https://github.com/electron-userland/electron-builder/issues/1302
test.ifNotWindows("extraFiles", ({expect}) =>
  app(expect, {
    targets: Platform.LINUX.createTarget("appimage", Arch.x64),
    config: {
      linux: {
        target: "zip:ia32",
      },
      extraFiles: [
        "lib/*.jar",
        "lib/Proguard/**/*",
        {
          from: "lib/",
          to: ".",
          filter: ["*.dll"],
        },
        {
          from: "lib/",
          to: ".",
          filter: ["*.exe"],
        },
        "BLClient/BLClient.json",
        {
          from: "include/",
          to: ".",
        },
      ],
    },
  })
)

test.ifNotWindows("files", () => {
  return validateConfiguration(
    {
      appId: "com.example.myapp",
      files: [{from: "dist/app", to: "app", filter: "*.js"}],
      win: {
        target: "NSIS",
        icon: "build/icon.ico",
      },
    },
    new DebugLogger()
  )
})

test.ifNotWindows("unknown mac property reports correct path", ({expect}) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: {mac: {unknownMacProp: true}} as any,
    },
    undefined,
    error => error.message.includes("configuration.mac has an unknown property 'unknownMacProp'")
  )
)

test.ifNotWindows("unknown nsis property reports correct path", ({expect}) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: {nsis: {unknownNsisProp: "bad"}} as any,
    },
    undefined,
    error => error.message.includes("configuration.nsis has an unknown property 'unknownNsisProp'")
  )
)

test.ifNotWindows("valid callback function passes validation", async ({expect}) => {
  await expect(
    validateConfiguration(
      {
        afterPack: () => Promise.resolve(),
      },
      new DebugLogger()
    )
  ).resolves.toBeUndefined()
})

test.ifNotWindows("null callback passes validation", async ({expect}) => {
  await expect(
    validateConfiguration(
      {
        afterPack: null,
      } as unknown as Configuration,
      new DebugLogger()
    )
  ).resolves.toBeUndefined()
})

test.ifNotWindows("invalid string type for schema-level field throws via schema validator", async ({expect}) => {
  // productName must be a string|null — passing an object exercises the schema validator
  let err: Error | undefined
  try {
    await validateConfiguration({productName: {}} as any, new DebugLogger())
  }
  catch (e: any) {
    err = e
  }
  expect(err).toBeDefined()
  expect(err!.message).toContain("configuration.productName")
})

test.ifNotWindows("unknown linux property reports correct nested path", ({expect}) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
      config: {linux: {unknownLinuxProp: true}} as any,
    },
    undefined,
    error => error.message.includes("configuration.linux has an unknown property 'unknownLinuxProp'")
  )
)
