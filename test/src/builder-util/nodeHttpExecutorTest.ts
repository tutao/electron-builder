import { NodeHttpExecutor } from "builder-util"
import { afterEach, beforeEach, vi } from "vitest"

const PROXY_VARS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const

describe("NodeHttpExecutor.createRequest", () => {
  let executor: NodeHttpExecutor

  beforeEach(() => {
    executor = new NodeHttpExecutor()
    for (const key of PROXY_VARS) {
      delete process.env[key]
    }
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // createRequest mutates options.agent before delegating to http/https.request.
  // The returned ClientRequest makes a real async connection; suppress the resulting
  // ECONNREFUSED so it doesn't surface as an unhandled error after the test.
  function callCreateRequest(executor: NodeHttpExecutor, options: any) {
    const req = executor.createRequest(options, vi.fn()) as any
    req?.on?.("error", () => {})
    req?.destroy?.()
    return req
  }

  describe("proxy agent assignment", () => {
    test("does not set agent when no proxy env vars are set", ({expect}) => {
      const options: any = {protocol: "https:"}
      callCreateRequest(executor, options)
      expect(options.agent).toBeUndefined()
    })

    test("does not set agent when https_proxy is set but protocol is http: (mismatch)", ({expect}) => {
      vi.stubEnv("https_proxy", "https://proxy.example.com:8080")
      const options: any = {protocol: "http:"}
      callCreateRequest(executor, options)
      expect(options.agent).toBeUndefined()
    })

    test("does not set agent when http_proxy is set but protocol is https: (mismatch)", ({expect}) => {
      vi.stubEnv("http_proxy", "http://proxy.example.com:3128")
      const options: any = {protocol: "https:"}
      callCreateRequest(executor, options)
      expect(options.agent).toBeUndefined()
    })
  })
})
