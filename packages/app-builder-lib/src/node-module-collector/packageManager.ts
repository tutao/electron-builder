import { exists, log } from "builder-util"
import * as fs from "fs-extra"
import * as path from "path"
import * as which from "which"

export enum PM {
  NPM = "npm",
  TRAVERSAL = "traversal",
}

// Cache for resolved paths
const pmPathCache: Record<PM, string | null | undefined> = {
  [PM.NPM]: undefined,
  [PM.TRAVERSAL]: undefined,
}

function resolveCommand(pm: PM): string {
  const fallback = pm

  if (process.platform !== "win32") {
    return fallback
  }

  try {
    return which.sync(fallback)
  } catch {
    // If `which` fails (not found), still return the fallback string
    return fallback
  }
}

export function getPackageManagerCommand(pm: PM) {
  if (pmPathCache[pm] !== undefined) {
    return pmPathCache[pm]!
  }

  const resolved = resolveCommand(pm)
  pmPathCache[pm] = resolved
  return resolved
}

type PackageManagerSetup = {
  pm: PM
  corepackConfig: string | undefined
  resolvedDirectory: string | undefined
  detectionMethod: string
}

export async function detectPackageManager(searchPaths: string[]): Promise<PackageManagerSetup> {
  let pm: PM | null = null
  const dedupedPaths = Array.from(new Set(searchPaths)) // reduce file operations, dedupe paths since primary use case has projectDir === appDir

  const resolveIfYarn = (pm: PM, version: string, cwd: string) => Promise.resolve(pm)

  for (const dir of dedupedPaths) {
    const packageJsonPath = path.join(dir, "package.json")
    const packageManager = (await exists(packageJsonPath)) ? (await fs.readJson(packageJsonPath, "utf8"))?.packageManager : undefined
    if (packageManager) {
      const [pm, version] = packageManager.split("@")
      if (Object.values(PM).includes(pm as PM)) {
        const resolvedPackageManager = await resolveIfYarn(pm as PM, version, dir)
        return { pm: resolvedPackageManager, corepackConfig: packageManager, resolvedDirectory: dir, detectionMethod: "packageManager field" }
      }
    }

    pm = await detectPackageManagerByFile(dir)
    if (pm) {
      const resolvedPackageManager = await resolveIfYarn(pm, "", dir)
      return { pm: resolvedPackageManager, resolvedDirectory: dir, corepackConfig: undefined, detectionMethod: "lock file" }
    }
  }

  pm = detectPackageManagerByEnv() || PM.NPM
  const cwd = process.env.npm_package_json ? path.dirname(process.env.npm_package_json) : (process.env.INIT_CWD ?? process.cwd())
  const resolvedPackageManager = await resolveIfYarn(pm, "", cwd)
  log.info({ resolvedPackageManager, detected: cwd }, "packageManager not detected by file, falling back to environment detection")
  return { pm: resolvedPackageManager, resolvedDirectory: undefined, corepackConfig: undefined, detectionMethod: "process environment" }
}

function detectPackageManagerByEnv(): PM | null {
  const priorityChecklist = [(key: string) => process.env.npm_config_user_agent?.includes(key), (key: string) => process.env.npm_execpath?.includes(key)]

  const pms = Object.values(PM)
  for (const checker of priorityChecklist) {
    for (const pm of pms) {
      if (checker(pm)) {
        return pm
      }
    }
  }
  return null
}

async function detectPackageManagerByFile(dir: string): Promise<PM | null> {
  const has = (file: string) => exists(path.join(dir, file))

  const detected: PM[] = []
  if (await has("package-lock.json")) {
    detected.push(PM.NPM)
  }

  if (detected.length === 1) {
    return detected[0]
  }

  return null
}
