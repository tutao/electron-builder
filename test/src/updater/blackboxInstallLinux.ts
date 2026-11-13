import path from "path"

export function installLinux(target: string, dirPath: string): string {
  if (target === "AppImage") {
    return path.join(dirPath, `TestApp.AppImage`)
  }

  throw new Error(`Unsupported Linux target: ${target}`)
}