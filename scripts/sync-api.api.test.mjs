import { spawn, spawnSync, execFileSync, execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYNC } from '../src/config/gameConfig.ts'
import { generateSyncCode, hashSyncCode } from '../src/core/sync/code.ts'

/**
 * 真实环境集成测试：启动本地 `wrangler pages dev` + 隔离的本地 D1。
 * 不连接线上数据库，不登录 Cloudflare。
 */
const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const persistDir = path.join(root, '.local', 'sync-api-test')
const wranglerBin = path.join(
  root,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
)

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let server = null
let serverOutput = ''
let base = ''
let ipSeed = 0

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref()
  })
}

function uniqueIp() {
  ipSeed += 1
  return `10.${(ipSeed >> 8) & 0xff}.${ipSeed & 0xff}.${(ipSeed % 200) + 20}`
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port =
        address && typeof address === 'object' ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

async function request(
  pathname,
  { method = 'POST', code, body, rawBody, headers = {}, ip } = {},
) {
  const requestHeaders = new Headers(headers)
  if (code) {
    requestHeaders.set('authorization', `Bearer ${code}`)
  }
  if (ip) {
    requestHeaders.set('cf-connecting-ip', ip)
  }

  let payload
  if (rawBody !== undefined) {
    payload = rawBody
  } else if (body !== undefined) {
    payload = JSON.stringify(body)
    requestHeaders.set('content-type', 'application/json')
  }

  return fetch(`${base}${pathname}`, {
    method,
    headers: requestHeaders,
    body: payload,
  })
}

async function newAccount() {
  const code = generateSyncCode()
  const codeHash = await hashSyncCode(code)
  const response = await request('/api/sync/register', {
    body: { codeHash },
    ip: uniqueIp(),
  })
  expect(response.status).toBe(201)
  await response.text()
  return { code, codeHash }
}

function record(key, value, updatedAt) {
  return { key, json: JSON.stringify(value), updatedAt, deleted: false }
}

function tombstone(key, updatedAt) {
  return { key, updatedAt, deleted: true }
}

function checkinEvent(id, dishId, dateKey, createdAt) {
  return record(
    `checkins/${id}`,
    { id, dishId, dateKey, createdAt },
    createdAt,
  )
}

async function push(code, changes, { deviceId = 'device-a', isEmpty = false } = {}) {
  return request('/api/sync/push', {
    code,
    body: { deviceId, isEmpty, changes },
  })
}

async function pull(code, recordRev = 0, imageRev = 0) {
  const response = await request('/api/sync/pull', {
    code,
    body: { recordRev, imageRev },
  })
  expect(response.status).toBe(200)
  return response.json()
}

async function fullPull(code) {
  let recordRev = 0
  let imageRev = 0
  const records = []
  const images = []
  for (let round = 0; round < 100; round += 1) {
    const page = await pull(code, recordRev, imageRev)
    records.push(...page.records)
    images.push(...page.images)
    recordRev = page.recordRev
    imageRev = page.imageRev
    if (!page.hasMoreRecords && !page.hasMoreImages) {
      return { records, images, recordRev, imageRev }
    }
  }
  throw new Error('pull 未能在 100 页内收敛')
}

async function status(code) {
  const response = await request('/api/sync/status', { code })
  expect(response.status).toBe(200)
  return response.json()
}

async function jsonError(response) {
  expect(response.headers.get('content-type')).toContain('application/json')
  return response.json()
}

async function waitForHealth(deadlineMs = 90_000) {
  const started = Date.now()
  while (Date.now() - started < deadlineMs) {
    if (server.exitCode !== null) {
      throw new Error(
        `wrangler pages dev 提前退出（code ${server.exitCode}）：\n${serverOutput.slice(-4000)}`,
      )
    }
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) {
        await response.text()
        return
      }
      await response.text()
    } catch {
      // 端口还没起来，继续等。
    }
    await delay(500)
  }
  throw new Error(`本地 Functions 未就绪：\n${serverOutput.slice(-4000)}`)
}

async function stopServer() {
  if (!server) {
    return
  }
  const proc = server
  server = null

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
      stdio: 'ignore',
    })
  } else {
    try {
      process.kill(-proc.pid, 'SIGTERM')
    } catch {
      try {
        proc.kill('SIGTERM')
      } catch {
        // 已退出。
      }
    }
  }

  await Promise.race([
    new Promise((resolve) => {
      if (proc.exitCode !== null) {
        resolve()
        return
      }
      proc.once('exit', resolve)
    }),
    delay(10_000),
  ])
}

beforeAll(async () => {
  if (!existsSync(path.join(root, 'dist', 'index.html'))) {
    execSync('npm run build', { cwd: root, stdio: 'pipe' })
  }

  execFileSync(
    process.execPath,
    [
      wranglerBin,
      'd1',
      'migrations',
      'apply',
      'diet-diary-sync',
      '--local',
      '--persist-to',
      persistDir,
    ],
    {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  )

  const port = await getFreePort()
  base = `http://127.0.0.1:${port}`

  server = spawn(
    process.execPath,
    [
      wranglerBin,
      'pages',
      'dev',
      'dist',
      '--port',
      String(port),
      '--persist-to',
      persistDir,
      '--ip',
      '127.0.0.1',
    ],
    {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  )
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString()
  })
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString()
  })

  await waitForHealth()
}, 180_000)

afterAll(async () => {
  await stopServer()
}, 30_000)

describe('health、方法与来源校验', () => {
  it('健康检查返回 ok', async () => {
    const response = await fetch(`${base}/api/health`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('OPTIONS 返回 204，GET 同步接口返回 405', async () => {
    const options = await request('/api/sync/status', { method: 'OPTIONS' })
    expect(options.status).toBe(204)
    expect(options.headers.get('allow')).toContain('POST')

    const get = await request('/api/sync/status', { method: 'GET' })
    expect(get.status).toBe(405)
    expect(await jsonError(get)).toEqual({ error: 'bad-request' })
  })

  it('跨站 Origin 返回 403，loopback 互访放行', async () => {
    const { code } = await newAccount()

    const evil = await request('/api/sync/status', {
      code,
      headers: { origin: 'https://evil.example' },
    })
    expect(evil.status).toBe(403)
    expect(await jsonError(evil)).toEqual({ error: 'bad-request' })

    const dev = await request('/api/sync/status', {
      code,
      headers: { origin: 'http://localhost:5173' },
    })
    expect(dev.status).toBe(200)
    await dev.text()
  })
})

describe('鉴权与注册', () => {
  it('缺失、错误格式、未知同步码都返回统一 401', async () => {
    const missing = await request('/api/sync/status')
    expect(missing.status).toBe(401)

    const wrongScheme = await request('/api/sync/status', {
      headers: { authorization: 'Token abc' },
    })
    expect(wrongScheme.status).toBe(401)

    const unknown = await request('/api/sync/status', {
      code: generateSyncCode(),
    })
    expect(unknown.status).toBe(401)

    for (const response of [missing, wrongScheme, unknown]) {
      expect(await jsonError(response)).toEqual({ error: 'unauthorized' })
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('注册校验哈希且幂等', async () => {
    const invalid = await request('/api/sync/register', {
      body: { codeHash: 'not-a-hash' },
      ip: uniqueIp(),
    })
    expect(invalid.status).toBe(400)

    const code = generateSyncCode()
    const codeHash = await hashSyncCode(code)
    const ip = uniqueIp()

    const first = await request('/api/sync/register', {
      body: { codeHash },
      ip,
    })
    expect(first.status).toBe(201)

    const second = await request('/api/sync/register', {
      body: { codeHash },
      ip,
    })
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ ok: true })
  })
})

describe('push / pull / status', () => {
  it('往返保留键、JSON、时间、设备与 rev', async () => {
    const { code } = await newAccount()

    const empty = await status(code)
    expect(empty).toMatchObject({
      rev: 0,
      liveRecords: 0,
      hasData: false,
      lastUpdatedAt: null,
    })

    const changes = [
      record('meta/profile', { name: 'test', targetCalories: 1800 }, 1000),
      record('days/2026-10-29/lunch', { mealType: 'lunch' }, 1001),
      checkinEvent('e1', 'dish-1', '2026-10-29', 1),
      record('customDishes/dish-1', { id: 'dish-1', name: '自制' }, 1002),
    ]
    const pushed = await push(code, changes)
    expect(pushed.status).toBe(200)
    expect(await pushed.json()).toEqual({ rev: 1, accepted: 4 })

    const page = await pull(code)
    expect(page.recordRev).toBe(1)
    expect(page.imageRev).toBe(0)
    expect(page.hasMoreRecords).toBe(false)
    expect(page.records).toHaveLength(4)

    const byKey = Object.fromEntries(
      page.records.map((row) => [row.key, row]),
    )
    expect(byKey['meta/profile']).toMatchObject({
      collection: 'meta',
      id: 'profile',
      json: JSON.stringify({ name: 'test', targetCalories: 1800 }),
      updatedAt: 1000,
      deviceId: 'device-a',
      deleted: false,
      rev: 1,
    })
    expect(JSON.parse(byKey['checkins/e1'].json)).toMatchObject({
      id: 'e1',
      dishId: 'dish-1',
    })

    const again = await pull(code, page.recordRev, page.imageRev)
    expect(again.records).toHaveLength(0)
    expect(again.hasMoreRecords).toBe(false)

    const filled = await status(code)
    expect(filled).toMatchObject({
      rev: 1,
      liveRecords: 4,
      hasData: true,
      lastUpdatedAt: 1002,
    })
  })

  it('LWW：旧时间不覆盖，新时间覆盖，同时间按 deviceId 决胜', async () => {
    const { code } = await newAccount()
    await push(code, [record('meta/settings', { theme: 'light' }, 2000)])

    const older = await push(code, [
      record('meta/settings', { theme: 'dark' }, 1999),
    ])
    expect((await older.json()).accepted).toBe(0)

    const tieWinner = await push(
      code,
      [record('meta/settings', { theme: 'vivid' }, 2000)],
      { deviceId: 'device-b' },
    )
    expect((await tieWinner.json()).accepted).toBe(1)

    const tieLoser = await push(
      code,
      [record('meta/settings', { theme: 'simple' }, 2000)],
      { deviceId: 'device-a' },
    )
    expect((await tieLoser.json()).accepted).toBe(0)

    const newer = await push(
      code,
      [record('meta/settings', { theme: 'cute' }, 2001)],
      { deviceId: 'device-a' },
    )
    expect((await newer.json()).accepted).toBe(1)

    const row = (await fullPull(code)).records.find(
      (item) => item.key === 'meta/settings',
    )
    expect(JSON.parse(row.json)).toEqual({ theme: 'cute' })
    expect(row.deviceId).toBe('device-a')
  })

  it('打卡事件只插不改', async () => {
    const { code } = await newAccount()
    const first = await push(code, [
      checkinEvent('evt-1', 'dish-1', '2026-10-29', 1),
    ])
    expect((await first.json()).accepted).toBe(1)

    const second = await push(
      code,
      [
        record(
          'checkins/evt-1',
          {
            id: 'evt-1',
            dishId: 'dish-2',
            dateKey: '2026-10-30',
            createdAt: 2,
          },
          5000,
        ),
      ],
      { deviceId: 'device-b' },
    )
    expect((await second.json()).accepted).toBe(0)

    const row = (await fullPull(code)).records.find(
      (item) => item.key === 'checkins/evt-1',
    )
    expect(JSON.parse(row.json).dishId).toBe('dish-1')
    expect(row.deviceId).toBe('device-a')
  })

  it('墓碑删除可拉取，新编辑可复活', async () => {
    const { code } = await newAccount()
    await push(code, [record('customDishes/x', { id: 'x' }, 1000)])

    const deleted = await push(code, [tombstone('customDishes/x', 2000)])
    expect((await deleted.json()).accepted).toBe(1)
    expect((await status(code)).liveRecords).toBe(0)

    let row = (await fullPull(code)).records.find(
      (item) => item.key === 'customDishes/x',
    )
    expect(row).toMatchObject({ deleted: true, json: 'null' })

    const revived = await push(code, [
      record('customDishes/x', { id: 'x', name: '回来' }, 3000),
    ])
    expect((await revived.json()).accepted).toBe(1)

    row = (await fullPull(code)).records.find(
      (item) => item.key === 'customDishes/x',
    )
    expect(row.deleted).toBe(false)
    expect(JSON.parse(row.json).name).toBe('回来')
  })

  it('空本地绝不覆盖云端数据', async () => {
    const { code } = await newAccount()
    await push(code, [record('meta/profile', { name: 'cloud' }, 1000)])

    const guarded = await push(
      code,
      [record('meta/profile', { name: 'empty' }, 2000)],
      { isEmpty: true },
    )
    expect(guarded.status).toBe(409)
    expect(await jsonError(guarded)).toEqual({
      error: 'empty-local-protected',
    })

    const row = (await fullPull(code)).records.find(
      (item) => item.key === 'meta/profile',
    )
    expect(JSON.parse(row.json).name).toBe('cloud')
  })

  it('非法游标、设备、键和超量批次被拒绝', async () => {
    const { code } = await newAccount()

    const badCursor = await request('/api/sync/pull', {
      code,
      body: { recordRev: -1 },
    })
    expect(badCursor.status).toBe(400)

    const badDevice = await request('/api/sync/push', {
      code,
      body: { deviceId: 'bad device', changes: [] },
    })
    expect(badDevice.status).toBe(400)

    const badKey = await push(code, [
      { key: 'unknown/x', json: '{}', updatedAt: 1, deleted: false },
    ])
    expect(badKey.status).toBe(400)

    const badCheckin = await push(code, [
      {
        key: 'checkins/e1',
        json: JSON.stringify({ id: 'other' }),
        updatedAt: 1,
        deleted: false,
      },
    ])
    expect(badCheckin.status).toBe(400)

    const tooMany = await push(
      code,
      Array.from({ length: SYNC.maxRecordsPerPush + 1 }, (_, index) =>
        record(`meta/k${index}`, { index }, 1),
      ),
    )
    expect(tooMany.status).toBe(413)
  })

  it('分页只返回完整 rev 块且不跳行', async () => {
    const { code } = await newAccount()
    for (let batch = 0; batch < 5; batch += 1) {
      const changes = Array.from({ length: 50 }, (_, index) =>
        record(
          `customIngredients/ing-${batch}-${index}`,
          { n: batch * 50 + index },
          1000 + batch,
        ),
      )
      const response = await push(code, changes)
      expect(response.status).toBe(200)
      expect((await response.json()).accepted).toBe(50)
    }

    const first = await pull(code)
    expect(first.records).toHaveLength(200)
    expect(first.hasMoreRecords).toBe(true)
    expect(first.recordRev).toBe(4)
    const firstRevs = new Set(first.records.map((row) => row.rev))
    expect([...firstRevs].sort((a, b) => a - b)).toEqual([1, 2, 3, 4])
    for (const rev of firstRevs) {
      expect(first.records.filter((row) => row.rev === rev)).toHaveLength(50)
    }

    const second = await pull(code, first.recordRev, first.imageRev)
    expect(second.records).toHaveLength(50)
    expect(second.hasMoreRecords).toBe(false)
    expect(second.recordRev).toBe(5)

    const keys = new Set(
      [...first.records, ...second.records].map((row) => row.key),
    )
    expect(keys.size).toBe(250)
  })

  it('每日快照在覆盖前生成，同一天不重复复制已有行', async () => {
    const { code } = await newAccount()
    await push(code, [
      record('meta/a', { v: 1 }, 1000),
      record('meta/b', { v: 1 }, 1001),
    ])
    let snapshot = await status(code)
    // 第一次 push 时云端为空，没有可复制的行。
    expect(snapshot.snapshotDays).toBe(0)
    expect(snapshot.snapshotRows).toBe(0)

    await push(code, [record('meta/c', { v: 1 }, 1002)])
    snapshot = await status(code)
    expect(snapshot.snapshotDays).toBe(1)
    expect(snapshot.snapshotRows).toBe(2)

    await push(code, [record('meta/d', { v: 1 }, 1003)])
    snapshot = await status(code)
    expect(snapshot.snapshotDays).toBe(1)
    // 同一天只补新键（c），已有键 a/b 不重复写入。
    expect(snapshot.snapshotRows).toBe(3)
  })
})

describe('图片同步', () => {
  it('base64 往返、缺失跳过、旧时间不覆盖', async () => {
    const { code } = await newAccount()

    const put = await request('/api/images/put', {
      code,
      body: {
        deviceId: 'device-a',
        images: [
          {
            id: 'img-1',
            mime: 'image/png',
            base64: PNG_BASE64,
            updatedAt: 2000,
          },
        ],
      },
    })
    expect(put.status).toBe(200)
    expect(await put.json()).toEqual({ rev: 1 })

    const got = await request('/api/images/get', {
      code,
      body: { ids: ['img-1', 'missing', 'img-1'] },
    })
    expect(got.status).toBe(200)
    const images = (await got.json()).images
    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({
      id: 'img-1',
      mime: 'image/png',
      data: PNG_BASE64,
      rev: 1,
    })

    const older = await request('/api/images/put', {
      code,
      body: {
        deviceId: 'device-a',
        images: [
          {
            id: 'img-1',
            mime: 'image/png',
            base64: Buffer.from('old').toString('base64'),
            updatedAt: 1000,
          },
        ],
      },
    })
    expect(older.status).toBe(200)

    const after = await request('/api/images/get', {
      code,
      body: { ids: ['img-1'] },
    })
    expect((await after.json()).images[0].data).toBe(PNG_BASE64)

    const page = await pull(code)
    expect(page.images).toHaveLength(1)
    expect(page.images[0]).toMatchObject({
      id: 'img-1',
      mime: 'image/png',
      deleted: false,
      rev: 1,
    })
    expect(page.imageRev).toBe(1)
  })

  it('图片数量与体积上限返回 413', async () => {
    const { code } = await newAccount()

    const tooMany = await request('/api/images/put', {
      code,
      body: {
        deviceId: 'device-a',
        images: Array.from(
          { length: SYNC.maxImagesPerPush + 1 },
          (_, index) => ({
            id: `img-${index}`,
            mime: 'image/png',
            base64: PNG_BASE64,
            updatedAt: 1,
          }),
        ),
      },
    })
    expect(tooMany.status).toBe(413)

    const tooBig = await request('/api/images/put', {
      code,
      body: {
        deviceId: 'device-a',
        images: [
          {
            id: 'big',
            mime: 'image/png',
            base64: Buffer.alloc(
              SYNC.cloudImageServerMaxBytes + 1,
            ).toString('base64'),
            updatedAt: 1,
          },
        ],
      },
    })
    expect(tooBig.status).toBe(413)

    const manyIds = await request('/api/images/get', {
      code,
      body: {
        ids: Array.from(
          { length: SYNC.maxImagesPerGet + 1 },
          (_, index) => `id-${index}`,
        ),
      },
    })
    expect(manyIds.status).toBe(413)
  })
})

describe('体积与限流', () => {
  it('超过 2 MB 的请求体返回 413', async () => {
    const { code } = await newAccount()
    const response = await request('/api/sync/push', {
      code,
      rawBody: 'x'.repeat(SYNC.maxRequestBodyBytes + 1),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(413)
    expect(await jsonError(response)).toEqual({ error: 'too-large' })
  })

  it('已认证用户每分钟 60 次后返回 429', async () => {
    const { code } = await newAccount()
    for (let index = 0; index < SYNC.authRateLimitPerMinute; index += 1) {
      const response = await request('/api/sync/status', { code })
      expect(response.status).toBe(200)
      await response.text()
    }

    const limited = await request('/api/sync/status', { code })
    expect(limited.status).toBe(429)
    expect(await jsonError(limited)).toEqual({ error: 'rate-limited' })
  })

  it('注册每 IP 每分钟 30 次后返回 429', async () => {
    const ip = '198.51.100.77'
    const statuses = []
    for (let index = 0; index < SYNC.registerRateLimitPerMinute + 1; index += 1) {
      const response = await request('/api/sync/register', {
        ip,
        body: { codeHash: randomBytes(32).toString('hex') },
      })
      statuses.push(response.status)
      await response.text()
    }
    expect(statuses.slice(0, SYNC.registerRateLimitPerMinute)).toEqual(
      Array(SYNC.registerRateLimitPerMinute).fill(201),
    )
    expect(statuses[SYNC.registerRateLimitPerMinute]).toBe(429)
  })
})

describe('轮换同步码', () => {
  it('新码立即可用，旧码宽限期内仍可用，数据不迁移', async () => {
    const account = await newAccount()
    await push(account.code, [record('meta/profile', { name: 'rotated' }, 1000)])

    const newCode = generateSyncCode()
    const newCodeHash = await hashSyncCode(newCode)
    const rotated = await request('/api/sync/rotate', {
      code: account.code,
      body: { newCodeHash },
    })
    expect(rotated.status).toBe(200)
    expect(await rotated.json()).toEqual({ ok: true })

    expect((await status(newCode)).liveRecords).toBe(1)
    expect((await status(account.code)).liveRecords).toBe(1)

    const reregister = await request('/api/sync/register', {
      ip: uniqueIp(),
      body: { codeHash: newCodeHash },
    })
    expect(reregister.status).toBe(200)

    const row = (await fullPull(newCode)).records.find(
      (item) => item.key === 'meta/profile',
    )
    expect(JSON.parse(row.json).name).toBe('rotated')
  })

  it('拒绝轮换到其他账户正在使用的同步码', async () => {
    const first = await newAccount()
    const second = await newAccount()

    const conflict = await request('/api/sync/rotate', {
      code: first.code,
      body: { newCodeHash: second.codeHash },
    })
    expect(conflict.status).toBe(409)
    expect(await jsonError(conflict)).toEqual({ error: 'bad-request' })

    // 失败不改变原码。
    expect((await status(first.code)).rev).toBe(0)
  })
})
