/**
 * fetchMissingLines 테스트 — mock fetch 사용
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMissingLines } from '../../scripts/missing-translations/fetchMissingLines.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(responseBody, ok = true) {
  const mockResponse = {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(responseBody),
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))
}

describe('fetchMissingLines', () => {
  it('정상 응답 — lines 배열을 반환한다', async () => {
    mockFetch({ lines: ['화염 저항 +25%', '냉기 피해 15% 증가'] })

    const result = await fetchMissingLines('https://api.example.com', {
      version: 'poe2',
      since: '2026-06-01T00:00:00.000Z',
    })

    expect(result).toEqual(['화염 저항 +25%', '냉기 피해 15% 증가'])
  })

  it('since 쿼리 파라미터가 URL에 포함된다', async () => {
    mockFetch({ lines: [] })

    await fetchMissingLines('https://api.example.com', {
      version: 'poe1',
      since: '2026-06-01T00:00:00.000Z',
    })

    const called = vi.mocked(fetch).mock.calls[0][0]
    expect(called).toContain('version=poe1')
    expect(called).toContain('since=2026-06-01T00%3A00%3A00.000Z')
  })

  it('version 쿼리 파라미터가 URL에 포함된다', async () => {
    mockFetch({ lines: [] })

    await fetchMissingLines('https://api.example.com', {
      version: 'poe2',
    })

    const called = vi.mocked(fetch).mock.calls[0][0]
    expect(called).toContain('version=poe2')
  })

  it('응답에 lines 필드가 없으면 빈 배열 반환', async () => {
    mockFetch({ data: null }) // lines 없음

    const result = await fetchMissingLines('https://api.example.com', { version: 'poe2' })
    expect(result).toEqual([])
  })

  it('네트워크 실패 시 빈 배열 반환 (throw 안 함)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network Error')))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchMissingLines('https://api.example.com', { version: 'poe2' })

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('HTTP 에러 응답(ok=false) 시 빈 배열 반환 (throw 안 함)', async () => {
    mockFetch({}, false)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await fetchMissingLines('https://api.example.com', { version: 'poe2' })

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('since 미전달 시에도 정상 동작', async () => {
    mockFetch({ lines: ['스탯 라인'] })

    const result = await fetchMissingLines('https://api.example.com', { version: 'poe2' })
    expect(result).toEqual(['스탯 라인'])

    const called = vi.mocked(fetch).mock.calls[0][0]
    expect(called).not.toContain('since=')
  })
})
