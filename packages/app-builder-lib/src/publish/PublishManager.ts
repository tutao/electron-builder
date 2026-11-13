import { Arch, asArray, AsyncTaskManager, exists, InvalidConfigurationError, log, MultiProgress, safeStringifyJson, serializeToYaml, UploadTask } from "builder-util"
import { CancellationToken, GenericServerOptions, Nullish, PublishConfiguration } from "builder-util-runtime"
import _debug from "debug"
import { PublishContext, Publisher, PublishOptions } from "electron-publish"
import { writeFile } from "fs/promises"
import * as path from "path"
import { WriteStream as TtyWriteStream } from "tty"
import * as url from "url"
import { AppInfo, ArtifactCreated, Configuration, Platform, PlatformSpecificBuildOptions, Target, TargetSpecificOptions } from "../index"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { expandMacro } from "../util/macroExpander"
import { parseUrl } from "../util/pathManager"
import { resolveModule } from "../util/resolve"
import { WinPackager } from "../winPackager"
import { createUpdateInfoTasks, UpdateInfoFileTask, writeUpdateInfoFiles } from "./updateInfoBuilder"

const debug = _debug("electron-builder:publish")

function checkOptions(publishPolicy: unknown) {
  if (publishPolicy != null && publishPolicy !== "always" && publishPolicy !== "never") {
    if (typeof publishPolicy === "string") {
      throw new InvalidConfigurationError(
        `Expected one of "always", "never", but got ${JSON.stringify(publishPolicy)}.\nPlease note that publish configuration should be specified under "config"`
      )
    }
  }
}

export class PublishManager implements PublishContext {
  private readonly nameToPublisher = new Map<string, Publisher | null>()

  private readonly taskManager: AsyncTaskManager

  readonly isPublish: boolean = false

  readonly progress = (process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null

  private readonly updateFileWriteTask: Array<UpdateInfoFileTask> = []

  constructor(
    private readonly packager: Packager,
    private readonly publishOptions: PublishOptions,
    readonly cancellationToken: CancellationToken = packager.cancellationToken
  ) {
    checkOptions(publishOptions.publish)

    this.taskManager = new AsyncTaskManager(cancellationToken)

    const publishPolicy = publishOptions.publish
    this.isPublish = publishPolicy != null && publishOptions.publish !== "never"

    packager.onAfterPack(async event => {
      const packager = event.packager
      if (event.electronPlatformName === "darwin") {
        if (!event.targets.some(it => it.name === "dmg" || it.name === "zip")) {
          return
        }
      }
      else if (packager.platform === Platform.WINDOWS) {
        if (!event.targets.some(it => isSuitableWindowsTarget(it))) {
          return
        }
      }

      const publishConfig = await getAppUpdatePublishConfiguration(packager, null, event.arch, this.isPublish)
      if (publishConfig != null) {
        await writeFile(path.join(packager.getResourcesDir(event.appOutDir), "app-update.yml"), serializeToYaml(publishConfig))
      }
    })

    packager.onArtifactCreated(async event => {
      const publishConfiguration = event.publishConfig
      if (publishConfiguration == null) {
        this.taskManager.addTask(this.artifactCreatedWithoutExplicitPublishConfig(event))
      }
      else if (this.isPublish) {
        if (debug.enabled) {
          debug(`artifactCreated (isPublish: ${this.isPublish}): ${safeStringifyJson(event, new Set(["packager"]))},\n  publishConfig: ${safeStringifyJson(publishConfiguration)}`)
        }
        await this.scheduleUpload(publishConfiguration, event, this.getAppInfo(event.packager))
      }
    })
  }

  private getAppInfo(platformPackager: PlatformPackager<any> | null) {
    return platformPackager == null ? this.packager.appInfo : platformPackager.appInfo
  }

  async getGlobalPublishConfigurations(): Promise<Array<PublishConfiguration> | null> {
    const publishers = this.packager.config.publish
    return await resolvePublishConfigurations(publishers, null, this.packager, null, true)
  }

  async scheduleUpload(publishConfig: PublishConfiguration, event: UploadTask, appInfo: AppInfo): Promise<void> {
    if (publishConfig.provider === "generic") {
      return
    }

    const publisher = await this.getOrCreatePublisher(publishConfig, appInfo)
    if (publisher == null) {
      log.debug(
        {
          file: log.filePath(event.file),
          reason: "publisher is null",
          publishConfig: safeStringifyJson(publishConfig),
        },
        "not published"
      )
      return
    }

    if (publishConfig.timeout) {
      event.timeout = publishConfig.timeout
    }

    this.taskManager.addTask(publisher.upload(event))
  }

  private async artifactCreatedWithoutExplicitPublishConfig(event: ArtifactCreated) {
    const platformPackager = event.packager
    const target = event.target
    const publishConfigs = await getPublishConfigs(platformPackager, target == null ? null : target.options, event.arch, this.isPublish)

    if (debug.enabled) {
      debug(`artifactCreated (isPublish: ${this.isPublish}): ${safeStringifyJson(event, new Set(["packager"]))},\n  publishConfigs: ${safeStringifyJson(publishConfigs)}`)
    }

    const eventFile = event.file
    if (publishConfigs == null) {
      if (this.isPublish) {
        log.debug({file: eventFile, reason: "no publish configs"}, "not published")
      }
      return
    }

    if (this.isPublish) {
      for (const publishConfig of publishConfigs) {
        if (this.cancellationToken.cancelled) {
          log.debug({file: event.file, reason: "cancelled"}, "not published")
          break
        }

        await this.scheduleUpload(publishConfig, event, this.getAppInfo(platformPackager))
      }
    }

    if (
      event.isWriteUpdateInfo &&
      target != null &&
      eventFile != null &&
      !this.cancellationToken.cancelled &&
      (platformPackager.platform !== Platform.WINDOWS || isSuitableWindowsTarget(target))
    ) {
      this.taskManager.addTask(createUpdateInfoTasks(event, publishConfigs).then(it => this.updateFileWriteTask.push(...it)))
    }
  }

  private async getOrCreatePublisher(publishConfig: PublishConfiguration, appInfo: AppInfo): Promise<Publisher | null> {
    // to not include token into cache key
    const providerCacheKey = safeStringifyJson(publishConfig)
    let publisher = this.nameToPublisher.get(providerCacheKey)
    if (publisher == null) {
      publisher = await createPublisher(this, appInfo.version, publishConfig, this.publishOptions, this.packager)
      this.nameToPublisher.set(providerCacheKey, publisher)
      log.info({publisher: publisher!.toString()}, "publishing")
    }
    return publisher
  }

  // noinspection JSUnusedGlobalSymbols
  cancelTasks() {
    this.taskManager.cancelTasks()
    this.nameToPublisher.clear()
  }

  async awaitTasks(): Promise<void> {
    await this.taskManager.awaitTasks()

    const updateInfoFileTasks = this.updateFileWriteTask
    if (this.cancellationToken.cancelled || updateInfoFileTasks.length === 0) {
      return
    }

    await writeUpdateInfoFiles(updateInfoFileTasks, this.packager)
    await this.taskManager.awaitTasks()
  }
}

export async function getAppUpdatePublishConfiguration(
  packager: PlatformPackager<any>,
  targetSpecificOptions: TargetSpecificOptions | Nullish,
  arch: Arch,
  errorIfCannot: boolean
): Promise<PublishConfiguration | null> {
  const publishConfigs = await getPublishConfigsForUpdateInfo(packager, await getPublishConfigs(packager, null, arch, errorIfCannot), arch)
  if (publishConfigs == null || publishConfigs.length === 0) {
    return null
  }

  const publishConfig = {
    ...publishConfigs[0],
    updaterCacheDirName: packager.appInfo.updaterCacheDirName,
  }

  if (packager.platform === Platform.WINDOWS && publishConfig.publisherName == null) {
    const winPackager = packager as WinPackager
    const publisherName = winPackager.isForceCodeSigningVerification ? await (await winPackager.signingManager.value).computedPublisherName.value : undefined
    if (publisherName != null) {
      publishConfig.publisherName = publisherName
    }
  }
  return publishConfig
}

export async function getPublishConfigsForUpdateInfo(
  packager: PlatformPackager<any>,
  publishConfigs: Array<PublishConfiguration> | null,
  arch: Arch | null
): Promise<Array<PublishConfiguration> | null> {
  if (publishConfigs === null) {
    return null
  }

  if (publishConfigs.length === 0) {
    log.debug(null, "getPublishConfigsForUpdateInfo: no publishConfigs")
  }
  return Promise.resolve(publishConfigs)
}

export async function createPublisher(
  context: PublishContext,
  version: string,
  publishConfig: PublishConfiguration,
  options: PublishOptions,
  packager: Packager
): Promise<Publisher | null> {
  const provider = publishConfig.provider
  debug(`Create publisher: ${provider}`)

  switch (provider) {
    case "generic":
      return null

    default: {
      const clazz = await requireProviderClass(provider, packager)
      return clazz == null ? null : new clazz(context, publishConfig)
    }
  }
}

async function requireProviderClass(provider: string, packager: Packager): Promise<any | null> {
  switch (provider) {
    case "generic":
      return null

    default: {
      const extensions = ["mjs", "js", "cjs"]
      const template = `electron-publisher-${provider}`
      const name = (ext: string) => `${template}.${ext}`

      const validPublisherFiles = extensions.map(ext => path.join(packager.buildResourcesDir, name(ext)))
      for (const potentialFile of validPublisherFiles) {
        if (await exists(potentialFile)) {
          const module: any = await resolveModule(packager.appInfo.type, potentialFile)
          return module.default || module
        }
      }
      log.error({path: log.filePath(packager.buildResourcesDir), template, extensionsChecked: extensions}, "unable to find publish provider in build resources")
      throw new InvalidConfigurationError(`Cannot find module for publisher "${provider}" with any extension: ${extensions.join(", ")}`)
    }
  }
}

export function computeDownloadUrl(publishConfiguration: PublishConfiguration, fileName: string | null, packager: PlatformPackager<any>) {
  if (publishConfiguration.provider === "generic") {
    const baseUrlString = (publishConfiguration as GenericServerOptions).url
    if (fileName == null) {
      return baseUrlString
    }

    const baseUrl = parseUrl(baseUrlString)
    return url.format({...baseUrl, pathname: path.posix.resolve(baseUrl?.pathname || "/", encodeURI(fileName))})
  }
  throw new Error(`Unsupported provider ${publishConfiguration.provider}`)
}

export async function getPublishConfigs(
  platformPackager: PlatformPackager<any>,
  targetSpecificOptions: PlatformSpecificBuildOptions | Nullish,
  arch: Arch | null,
  errorIfCannot: boolean
): Promise<Array<PublishConfiguration> | null> {
  let publishers

  // check build.nsis (target)
  if (targetSpecificOptions != null) {
    publishers = targetSpecificOptions.publish
    // if explicitly set to null - do not publish
    if (publishers === null) {
      return null
    }
  }

  // check build.win (platform)
  if (publishers == null) {
    publishers = platformPackager.platformSpecificBuildOptions.publish
    if (publishers === null) {
      return null
    }
  }

  if (publishers == null) {
    publishers = platformPackager.config.publish
    if (publishers === null) {
      return null
    }
  }
  return await resolvePublishConfigurations(publishers, platformPackager, platformPackager.info, arch, errorIfCannot)
}

async function resolvePublishConfigurations(
  publishers: any,
  platformPackager: PlatformPackager<any> | null,
  packager: Packager,
  arch: Arch | null,
  errorIfCannot: boolean
): Promise<Array<PublishConfiguration> | null> {
  if (publishers == null) {
    return []
  }

  debug(`Explicit publish provider: ${safeStringifyJson(publishers)}`)
  return (await Promise.all(
    asArray(publishers).map(it => getResolvedPublishConfig(platformPackager, packager, typeof it === "string" ? {provider: it} : it, arch, errorIfCannot))
  )) as PublishConfiguration[]
}

function isSuitableWindowsTarget(target: Target) {
  return target.name === "nsis" || target.name.startsWith("nsis-")
}

function expandPublishConfig(options: any, platformPackager: PlatformPackager<any> | null, packager: Packager, arch: Arch | null): void {
  for (const name of Object.keys(options)) {
    const value = options[name]
    if (typeof value === "string") {
      const archValue = arch == null ? null : Arch[arch]
      const expanded = platformPackager == null ? expandMacro(value, archValue, packager.appInfo) : platformPackager.expandMacro(value, archValue)
      if (expanded !== value) {
        options[name] = expanded
      }
    }
  }
}

function isDetectUpdateChannel(platformSpecificConfiguration: PlatformSpecificBuildOptions | null, configuration: Configuration) {
  const value = platformSpecificConfiguration == null ? null : platformSpecificConfiguration.detectUpdateChannel
  return value == null ? configuration.detectUpdateChannel !== false : value
}

async function getResolvedPublishConfig(
  platformPackager: PlatformPackager<any> | null,
  packager: Packager,
  options: PublishConfiguration,
  arch: Arch | null,
  errorIfCannot: boolean
): Promise<PublishConfiguration | null> {
  options = {...options}
  expandPublishConfig(options, platformPackager, packager, arch)

  let channelFromAppVersion: string | null = null
  if (
    (options as GenericServerOptions).channel == null &&
    isDetectUpdateChannel(platformPackager == null ? null : platformPackager.platformSpecificBuildOptions, packager.config)
  ) {
    channelFromAppVersion = packager.appInfo.channel
  }

  const provider = options.provider
  if (provider === "generic") {
    const o = options as GenericServerOptions
    if (o.url == null) {
      throw new InvalidConfigurationError(`Please specify "url" for "generic" update server`)
    }

    if (channelFromAppVersion != null) {
      ;(o as any).channel = channelFromAppVersion
    }
    return options
  }

  const providerClass = await requireProviderClass(options.provider, packager)
  if (providerClass != null && providerClass.checkAndResolveOptions != null) {
    await providerClass.checkAndResolveOptions(options, channelFromAppVersion, errorIfCannot)
    return options
  }

  return options
}
