import { SYNC } from '../../src/config/gameConfig'

export type ApiErrorCode =
  | 'unauthorized'
  | 'rate-limited'
  | 'too-large'
  | 'bad-request'
  | 'empty-local-protected'
  | 'server-error'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode

  constructor(status: number, code: ApiErrorCode) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const NO_STORE = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE })
}

export function emptyResponse(status = 204): Response {
  return new Response(null, {
    status,
    headers: { allow: 'POST, OPTIONS', 'cache-control': 'no-store' },
  })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse({ error: error.code }, error.status)
  }
  // 不打印请求体、Authorization 或同步码；只保留错误名，避免日志泄密。
  const name = error instanceof Error ? error.name : 'UnknownError'
  console.error(`[sync-api] ${name}`)
  return jsonResponse({ error: 'server-error' }, 500)
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

/** 存在 Origin 时必须同源；本地开发允许 localhost / 127.0.0.1 任意端口互访。 */
function checkOrigin(request: Request): void {
  const origin = request.headers.get('Origin')
  if (!origin) {
    return
  }

  let originUrl: URL
  let requestUrl: URL
  try {
    originUrl = new URL(origin)
    requestUrl = new URL(request.url)
  } catch {
    throw new ApiError(403, 'bad-request')
  }

  if (originUrl.host === requestUrl.host) {
    return
  }
  if (
    isLoopbackHost(originUrl.hostname) &&
    isLoopbackHost(requestUrl.hostname)
  ) {
    return
  }
  throw new ApiError(403, 'bad-request')
}

/** 每个 POST 端点共用：OPTIONS → 204，方法/来源不合法直接拒绝。 */
export function preflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return emptyResponse()
  }
  if (request.method !== 'POST') {
    return errorResponse(new ApiError(405, 'bad-request'))
  }
  try {
    checkOrigin(request)
    return null
  } catch (error) {
    return errorResponse(error)
  }
}

const encoder = new TextEncoder()

/** 先看 Content-Length，再按实际字节数复核，超限返回 413。 */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const declared = request.headers.get('content-length')
  if (declared !== null) {
    const length = Number(declared)
    if (!Number.isFinite(length) || length < 0) {
      throw new ApiError(400, 'bad-request')
    }
    if (length > SYNC.maxRequestBodyBytes) {
      throw new ApiError(413, 'too-large')
    }
  }

  let text: string
  try {
    text = await request.text()
  } catch {
    throw new ApiError(400, 'bad-request')
  }
  if (encoder.encode(text).byteLength > SYNC.maxRequestBodyBytes) {
    throw new ApiError(413, 'too-large')
  }

  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new ApiError(400, 'bad-request')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(400, 'bad-request')
  }
  return value as Record<string, unknown>
}

export function clientIp(request: Request): string {
  const cf = request.headers.get('CF-Connecting-IP')
  if (cf && cf.trim().length > 0) {
    return cf.trim()
  }
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) {
      return first
    }
  }
  return 'local'
}
