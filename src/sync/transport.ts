import type {
  CloudImageData,
  CloudImageUpload,
  PullResult,
  PushRequest,
  PushResult,
  ServerStatus,
} from './types'

export type SyncTransportErrorKind =
  | 'network'
  | 'unauthorized'
  | 'rate-limited'
  | 'too-large'
  | 'empty-local-protected'
  | 'bad-request'
  | 'server'

/** 只携带分类，不携带请求体、同步码或服务端原文。 */
export class SyncTransportError extends Error {
  readonly kind: SyncTransportErrorKind
  readonly status: number

  constructor(kind: SyncTransportErrorKind, status = 0) {
    super(kind)
    this.name = 'SyncTransportError'
    this.kind = kind
    this.status = status
  }
}

export interface SyncTransport {
  register(codeHash: string): Promise<void>
  status(code: string): Promise<ServerStatus>
  pull(
    code: string,
    input: { recordRev: number; imageRev: number },
  ): Promise<PullResult>
  push(code: string, request: PushRequest): Promise<PushResult>
  rotate(code: string, newCodeHash: string): Promise<void>
  putImages(
    code: string,
    input: { deviceId: string; images: CloudImageUpload[] },
  ): Promise<{ rev: number }>
  getImages(code: string, ids: string[]): Promise<CloudImageData[]>
}

export interface CreateHttpTransportOptions {
  /** 生产同源为空；测试可指向本地 wrangler。 */
  baseUrl?: string
  fetchImpl?: typeof fetch
  /** 单次请求超时，避免弱网下同步永远挂起。 */
  timeoutMs?: number
}

function mapStatus(status: number, serverCode: string | null): SyncTransportError {
  if (status === 401) {
    return new SyncTransportError('unauthorized', status)
  }
  if (status === 429) {
    return new SyncTransportError('rate-limited', status)
  }
  if (status === 413) {
    return new SyncTransportError('too-large', status)
  }
  if (status === 409 && serverCode === 'empty-local-protected') {
    return new SyncTransportError('empty-local-protected', status)
  }
  if (status >= 500) {
    return new SyncTransportError('server', status)
  }
  return new SyncTransportError('bad-request', status)
}

export function createHttpTransport(
  options: CreateHttpTransportOptions = {},
): SyncTransport {
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? 30_000

  async function post(
    path: string,
    code: string | null,
    body: unknown,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    if (code) {
      headers.authorization = `Bearer ${code}`
    }

    const controller =
      typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null

    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        ...(controller ? { signal: controller.signal } : {}),
      })
    } catch {
      throw new SyncTransportError('network')
    } finally {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }

    const text = await response.text()
    let parsed: unknown = null
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown
      } catch {
        parsed = null
      }
    }

    if (!response.ok) {
      const serverCode =
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as { error?: unknown }).error === 'string'
          ? ((parsed as { error: string }).error)
          : null
      throw mapStatus(response.status, serverCode)
    }

    return parsed
  }

  function asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SyncTransportError('server')
    }
    return value as Record<string, unknown>
  }

  return {
    async register(codeHash) {
      await post('/api/sync/register', null, { codeHash })
    },

    async status(code) {
      const parsed = asRecord(await post('/api/sync/status', code, undefined))
      return {
        rev: typeof parsed.rev === 'number' ? parsed.rev : 0,
        liveRecords:
          typeof parsed.liveRecords === 'number' ? parsed.liveRecords : 0,
        hasData: parsed.hasData === true,
        lastUpdatedAt:
          typeof parsed.lastUpdatedAt === 'number'
            ? parsed.lastUpdatedAt
            : null,
      }
    },

    async pull(code, input) {
      const parsed = asRecord(await post('/api/sync/pull', code, input))
      return parsed as unknown as PullResult
    },

    async push(code, request) {
      const parsed = asRecord(await post('/api/sync/push', code, request))
      return {
        rev: typeof parsed.rev === 'number' ? parsed.rev : 0,
        accepted:
          typeof parsed.accepted === 'number' ? parsed.accepted : 0,
      }
    },

    async rotate(code, newCodeHash) {
      await post('/api/sync/rotate', code, { newCodeHash })
    },

    async putImages(code, input) {
      const parsed = asRecord(await post('/api/images/put', code, input))
      return {
        rev: typeof parsed.rev === 'number' ? parsed.rev : 0,
      }
    },

    async getImages(code, ids) {
      const parsed = asRecord(await post('/api/images/get', code, { ids }))
      const images = Array.isArray(parsed.images) ? parsed.images : []
      return images.filter(
        (image): image is CloudImageData =>
          typeof image === 'object' &&
          image !== null &&
          typeof (image as CloudImageData).id === 'string' &&
          typeof (image as CloudImageData).mime === 'string' &&
          typeof (image as CloudImageData).data === 'string' &&
          typeof (image as CloudImageData).updatedAt === 'number',
      )
    },
  }
}
