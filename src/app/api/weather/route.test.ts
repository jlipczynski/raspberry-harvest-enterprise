import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as fetchHistoricalRoute from './fetch-historical/route'
import * as weatherRoute from './route'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    farm: {
      findFirst: vi.fn().mockResolvedValue({ latitude: 52.0, longitude: 21.0 }),
    },
    weatherData: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  },
}))

const mockedPrisma = (await import('@/lib/prisma')) as any

const makeRequest = (url: string, body?: unknown) => {
  const init: RequestInit = body
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    : { method: 'GET' }
  return new NextRequest(url, init as any)
}

describe('weather API', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetch-historical GET returns daily temperatures from Open-Meteo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          time: ['2026-04-01', '2026-04-02', '2026-04-03'],
          temperature_2m_min: [4.5, 5.0, 6.0],
          temperature_2m_max: [12.0, 13.0, 14.0],
        },
      }),
    }))

    const request = makeRequest('http://localhost/?startDate=2026-04-01&endDate=2026-04-03')
    const response = await fetchHistoricalRoute.GET(request)
    const body = await response.json()

    expect(body.error).toBeUndefined()
    expect(body.temperatures).toHaveLength(3)
    expect(body.temperatures[0]).toEqual({ date: '2026-04-01', min: 4.5, max: 12.0, avg: 8.3 })
    expect(body.temperatures[1]).toEqual({ date: '2026-04-02', min: 5.0, max: 13.0, avg: 9.0 })
    expect(body.temperatures[2]).toEqual({ date: '2026-04-03', min: 6.0, max: 14.0, avg: 10.0 })
  })

  it('weather POST saves weather records through prisma', async () => {
    const request = makeRequest('http://localhost', {
      farmId: 'farm-1',
      weatherRecords: [
        { date: '2026-04-01', tempMin: 4.5, tempMax: 12.0, gdhDaily: 50, gdhCumulative: 50 },
        { date: '2026-04-02', tempMin: 5.0, tempMax: 13.0, gdhDaily: 55, gdhCumulative: 105 },
      ],
    })

    const response = await weatherRoute.POST(request as any)
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(body.count).toBe(2)
    expect(mockedPrisma.prisma.weatherData.deleteMany).toHaveBeenCalledWith({ where: { farmId: 'farm-1' } })
    expect(mockedPrisma.prisma.weatherData.createMany).toHaveBeenCalled()
    expect(mockedPrisma.prisma.weatherData.createMany.mock.calls[0][0].data[0]).toMatchObject({
      farmId: 'farm-1',
      tempMin: 4.5,
      tempMax: 12.0,
      gdhDaily: 50,
      gdhCumulative: 50,
    })
  })
})
