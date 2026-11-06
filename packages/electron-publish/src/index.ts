import { MultiProgress } from "builder-util"
import { CancellationToken } from "builder-util-runtime"

export { MultiProgress }

export type PublishPolicy = "always" | "never"

export interface PublishOptions {
  publish?: PublishPolicy | null
}

export { Publisher } from "./publisher"

export interface PublishContext {
  readonly cancellationToken: CancellationToken
  readonly progress: MultiProgress | null
}
