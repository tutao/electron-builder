import { promises as fs } from "fs"
import { Lazy } from "lazy-val"
import * as path from "path"

export interface ReadConfigResult<T> {
  readonly result: T
  readonly configFile: string | null
}

async function readConfig<T>(configFile: string, _request: ReadConfigRequest): Promise<ReadConfigResult<T>> {
  const data = await fs.readFile(configFile, "utf8")
  let result: any

  if (configFile.endsWith(".json")) {
    result = JSON.parse(data)
  }
  else {
    throw new Error("who do you think you are (needs json config)")
  }

  return {result, configFile}
}

export async function findAndReadConfig<T>(request: ReadConfigRequest): Promise<ReadConfigResult<T> | null> {
  const prefix = request.configFilename
  for (const configFile of [`${prefix}.json`]) {
    const data = await orNullIfFileNotExist(readConfig<T>(path.join(request.projectDir, configFile), request))
    if (data != null) {
      return data
    }
  }

  return null
}

export function orNullIfFileNotExist<T>(promise: Promise<T>): Promise<T | null> {
  return orIfFileNotExist(promise, null)
}

export function orIfFileNotExist<T>(promise: Promise<T>, fallbackValue: T): Promise<T> {
  return promise.catch(e => {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") {
      return fallbackValue
    }
    throw e
  })
}

export interface ReadConfigRequest {
  packageKey: string
  configFilename: string

  projectDir: string
  packageMetadata: Lazy<Record<string, any> | null> | null
}

export async function loadConfig<T>(request: ReadConfigRequest): Promise<ReadConfigResult<T> | null> {
  let packageMetadata = request.packageMetadata == null ? null : await request.packageMetadata.value
  if (packageMetadata == null) {
    const json = await orNullIfFileNotExist(fs.readFile(path.join(request.projectDir, "package.json"), "utf8"))
    packageMetadata = json == null ? null : JSON.parse(json)
  }

  const data: T = packageMetadata == null ? null : packageMetadata[request.packageKey]
  return data == null ? findAndReadConfig<T>(request) : {result: data, configFile: null}
}

export function getConfig<T>(request: ReadConfigRequest, configPath?: string | null): Promise<ReadConfigResult<T> | null> {
  if (configPath == null) {
    return loadConfig<T>(request)
  }
  else {
    return readConfig<T>(path.resolve(request.projectDir, configPath), request)
  }
}

export async function loadParentConfig<T>(request: ReadConfigRequest, spec: string): Promise<ReadConfigResult<T>> {
  let isFileSpec: boolean | undefined
  if (spec.startsWith("file:")) {
    spec = spec.substring("file:".length)
    isFileSpec = true
  }

  let parentConfig = await orNullIfFileNotExist(readConfig<T>(path.resolve(request.projectDir, spec), request))
  if (parentConfig == null && isFileSpec !== true) {
    let resolved: string | null = null
    try {
      resolved = require.resolve(spec)
    }
    catch (_e) {
      // ignore
    }

    if (resolved != null) {
      parentConfig = await readConfig<T>(resolved, request)
    }
  }

  if (parentConfig == null) {
    throw new Error(`Cannot find parent config file: ${spec}`)
  }

  return parentConfig
}
