#! /usr/bin/env node

import { AppInfo, CancellationToken, checkBuildRequestOptions, Packager, PackagerOptions, PublishManager, PublishOptions } from "app-builder-lib"
import { Publish } from "app-builder-lib/out/core"
import { computeSafeArtifactNameIfNeeded } from "app-builder-lib/out/platformPackager"
import { getConfig } from "app-builder-lib/out/util/config/config"
import { archFromString, InvalidConfigurationError, log, UploadTask } from "builder-util"
import { PublishPolicy } from "electron-publish"
import * as path from "path"
import { BuildOptions, normalizeOptions } from "./builder"

export async function publish(args: { files: string[]; version: string | undefined; configurationFilePath: string | undefined; policy: PublishPolicy }) {
  const uploadTasks = args.files.map(f => {
    return {
      file: path.resolve(f),
      arch: null,
    }
  })
  return publishArtifactsWithOptions(uploadTasks, args.version, args.configurationFilePath, undefined, {publish: args.policy})
}

export async function publishArtifactsWithOptions(
  uploadOptions: { file: string; arch: string | null }[],
  buildVersion?: string,
  configurationFilePath?: string,
  publishConfiguration?: Publish,
  publishOptions?: PublishOptions
) {
  const projectDir = process.cwd()
  const config = await getConfig(projectDir, configurationFilePath || null, {publish: publishConfiguration, detectUpdateChannel: false})

  const buildOptions: BuildOptions = normalizeOptions({config, publish: publishOptions?.publish})
  checkBuildRequestOptions(buildOptions)

  const uniqueUploads = Array.from(new Set(uploadOptions))
  const tasks: UploadTask[] = uniqueUploads.map(({file, arch}) => {
    const filename = path.basename(file)
    return {file, arch: arch ? archFromString(arch) : null, safeArtifactName: computeSafeArtifactNameIfNeeded(filename, () => filename)}
  })

  return publishPackageWithTasks(buildOptions, tasks, buildVersion)
}

async function publishPackageWithTasks(
  options: PackagerOptions & PublishOptions,
  uploadTasks: UploadTask[],
  buildVersion?: string,
  cancellationToken: CancellationToken = new CancellationToken(),
  packager: Packager = new Packager(options, cancellationToken)
) {
  await packager.validateConfig()
  const appInfo = new AppInfo(packager, buildVersion)
  const publishManager = new PublishManager(packager, options, cancellationToken)

  const sigIntHandler = () => {
    log.warn("cancelled by SIGINT")
    packager.cancellationToken.cancel()
    publishManager.cancelTasks()
  }
  process.once("SIGINT", sigIntHandler)

  try {
    const publishConfigurations = await publishManager.getGlobalPublishConfigurations()
    if (publishConfigurations == null || publishConfigurations.length === 0) {
      throw new InvalidConfigurationError("unable to find any publish configuration")
    }

    for (const newArtifact of uploadTasks) {
      for (const publishConfiguration of publishConfigurations) {
        await publishManager.scheduleUpload(publishConfiguration, newArtifact, appInfo)
      }
    }

    await publishManager.awaitTasks()
    return uploadTasks
  }
  catch (error: any) {
    packager.cancellationToken.cancel()
    publishManager.cancelTasks()
    process.removeListener("SIGINT", sigIntHandler)
    log.error({message: (error.stack || error.message || error).toString()}, "error publishing")
  }
  return null
}
