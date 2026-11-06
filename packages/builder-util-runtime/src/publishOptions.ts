import { OutgoingHttpHeaders } from "http"

export type PublishProvider = "generic" | "custom"

// typescript-json-schema generates only PublishConfiguration if it is specified in the list, so, it is not added here
export type AllPublishOptions = string | GenericServerOptions | CustomPublishOptions

export interface PublishConfiguration {
  /**
   * The provider.
   */
  readonly provider: PublishProvider

  /**
   * @private
   * win-only
   */
  publisherName?: Array<string> | null

  /**
   * @private
   * win-only
   */
  readonly updaterCacheDirName?: string | null

  /**
   * Whether to publish auto update info files.
   *
   * Auto update relies only on the first provider in the list (you can specify several publishers).
   * Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
   *
   * @default true
   */
  readonly publishAutoUpdate?: boolean

  /**
   * Any custom request headers
   */
  readonly requestHeaders?: OutgoingHttpHeaders

  /**
   * Request timeout in milliseconds. (Default is 2 minutes; O is ignored)
   *
   * @default 120000
   */
  readonly timeout?: number | null
}

// https://github.com/electron-userland/electron-builder/issues/3261
export interface CustomPublishOptions extends PublishConfiguration {
  /**
   * The provider. Must be `custom`.
   */
  readonly provider: "custom"

  /**
   * The Provider to provide UpdateInfo regarding available updates.  Required
   * to use custom providers with electron-updater.
   */
  updateProvider?: new (options: CustomPublishOptions, updater: any, runtimeOptions: any) => any

  [index: string]: any
}

/**
 * Generic (any HTTP(S) server) options.
 * In all publish options [File Macros](https://www.electron.build/file-patterns#file-macros) are supported.
 */
export interface GenericServerOptions extends PublishConfiguration {
  /**
   * The provider. Must be `generic`.
   */
  readonly provider: "generic"

  /**
   * The base url. e.g. `https://bucket_name.s3.amazonaws.com`.
   */
  readonly url: string

  /**
   * The channel.
   * @default latest
   */
  readonly channel?: string | null

  /**
   * Whether to use multiple range requests for differential update. Defaults to `true` if `url` doesn't contain `s3.amazonaws.com`.
   */
  readonly useMultipleRangeRequest?: boolean
}

export interface GitlabReleaseInfo {
  name: string
  tag_name: string
  description: string
  created_at: string
  released_at: string
  upcoming_release: boolean
  assets: GitlabReleaseAsset
}

export interface GitlabReleaseAsset {
  count: number
  sources: Array<{
    format: string
    url: string
  }>
  links: Array<{
    id: number
    name: string
    url: string
    direct_asset_url: string
    link_type: string
  }>
}
