/**
 * MaxCrop Harvest Sync Agent
 *
 * Loguje się do maxcropdata.com, ustawia zakres dat (sezon → dziś),
 * pobiera Excel, parsuje go i robi upsert do harvest_entries.
 *
 * Uruchamianie: npx tsx scripts/maxcrop-sync.ts
 * Cron: codziennie o 21:00
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import { mapAreaToBlockName, parseHarvestRows } from '../src/lib/maxcrop-harvest-parser'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const MAXCROP_URL = 'https://www.maxcropdata.com/'
const MAXCROP_USER = process.env.MAXCROP_USER
const MAXCROP_PASS = process.env.MAXCROP_PASS
const MAXCROP_FARM_ID = process.env.MAXCROP_FARM_ID

if (!MAXCROP_USER || !MAXCROP_PASS) {
  console.error('Brak MAXCROP_USER lub MAXCROP_PASS w .env.local')
  process.exit(1)
}

if (!MAXCROP_FARM_ID) {
  console.error('Brak MAXCROP_FARM_ID w .env.local')
  process.exit(1)
}

const prisma = new PrismaClient()

function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getSeasonStartDate(): string {
  const now = new Date()
  return formatDate(new Date(now.getFullYear(), 4, 1)) // 1 maja
}

async function main() {
  const seasonStart = getSeasonStartDate()
  const today = formatDate(new Date())

  console.log(`[MaxCrop Sync] Zakres dat: ${seasonStart} → ${today}`)

  const tmpDir = path.resolve('tmp')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const downloadPath = tmpDir

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  try {
    // 1. Login via iframe
    console.log('[MaxCrop Sync] Logowanie...')
    await page.goto(MAXCROP_URL, { waitUntil: 'networkidle' })

    const loginFrame = page.frameLocator('iframe[src*="login"]')
    await loginFrame.locator('input').first().waitFor({ timeout: 10000 })

    const frameInputs = await loginFrame.locator('input').all()
    for (let i = 0; i < frameInputs.length; i++) {
      const type = await frameInputs[i].getAttribute('type').catch(() => '')
      if (type === 'password') {
        await frameInputs[i].fill(MAXCROP_PASS!)
        if (i > 0) await frameInputs[i - 1].fill(MAXCROP_USER!)
      }
    }
    await loginFrame.locator('input[type="submit"], button[type="submit"], input[value*="Zaloguj"]').click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    console.log('[MaxCrop Sync] Zalogowano.')

    // 2. Navigate to "Suma zbiorow"
    await page.click('text=Suma zbiorów')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // 3. Set date range: "Data od" and "Data do"
    // Vaadin date fields — dump all to find the right ones
    const dateInputs = await page.locator('.v-datefield-textfield').all()
    console.log(`[MaxCrop Sync] Znaleziono ${dateInputs.length} pól daty`)
    for (let i = 0; i < dateInputs.length; i++) {
      const val = await dateInputs[i].inputValue().catch(() => '')
      console.log(`[MaxCrop Sync]   input[${i}] value="${val}"`)
    }

    // Fields: [0]=Rok (just year), [1]=Data od, [2]=Data do
    // But screenshot showed 3 fields and dates got swapped — find by current value
    let dataOdIdx = -1
    let dataDoIdx = -1
    for (let i = 0; i < dateInputs.length; i++) {
      const val = await dateInputs[i].inputValue().catch(() => '')
      // Rok field has just a year like "2026" or is short
      if (val.length <= 4) continue
      if (dataOdIdx === -1) {
        dataOdIdx = i
      } else if (dataDoIdx === -1) {
        dataDoIdx = i
      }
    }

    // If we couldn't detect by value, use last two fields
    if (dataOdIdx === -1 || dataDoIdx === -1) {
      dataOdIdx = dateInputs.length - 2
      dataDoIdx = dateInputs.length - 1
    }

    console.log(`[MaxCrop Sync] Data od: input[${dataOdIdx}], Data do: input[${dataDoIdx}]`)

    // Fill "Data od" first, then "Data do"
    await dateInputs[dataOdIdx].click({ clickCount: 3 })
    await dateInputs[dataOdIdx].fill(seasonStart)
    await dateInputs[dataOdIdx].press('Tab')
    await page.waitForTimeout(500)

    await dateInputs[dataDoIdx].click({ clickCount: 3 })
    await dateInputs[dataDoIdx].fill(today)
    await dateInputs[dataDoIdx].press('Tab')
    await page.waitForTimeout(500)

    // 4. Click "Szukaj"
    console.log('[MaxCrop Sync] Klikam Szukaj...')
    await page.click('text=Szukaj')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Take screenshot for debugging
    await page.screenshot({ path: path.join(tmpDir, 'maxcrop-after-search.png'), fullPage: true })
    console.log('[MaxCrop Sync] Screenshot: tmp/maxcrop-after-search.png')

    // 5. Click "Excel" to download
    console.log('[MaxCrop Sync] Pobieram Excel...')
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('text=Excel'),
    ])

    const fileName = `maxcrop_${today}.xls`
    const filePath = path.join(downloadPath, fileName)
    await download.saveAs(filePath)
    console.log(`[MaxCrop Sync] Pobrano: ${filePath}`)

    // 6. Parse Excel
    const wb = XLSX.readFile(filePath)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as Array<Array<string | number>>

    // Skip title row and header row
    const dataRows = rawRows.filter(row => {
      if (row.length < 4) return false
      const first = String(row[0] || '')
      if (first === 'Data' || first.includes('Suma zbiorów') || first === '') return false
      return true
    })

    console.log(`[MaxCrop Sync] Excel: ${rawRows.length} wierszy surowych, ${dataRows.length} wierszy danych`)

    const parsedRows = parseHarvestRows(dataRows)
    console.log(`[MaxCrop Sync] Sparsowano ${parsedRows.length} wierszy`)

    if (parsedRows.length === 0) {
      console.log('[MaxCrop Sync] Brak danych do importu.')
      return
    }

    // 7. Get farm and blocks for mapping
    const farm = await prisma.farm.findUnique({
      where: { id: MAXCROP_FARM_ID! },
      include: { blocks: { select: { id: true, name: true } } },
    })
    if (!farm) {
      console.error(`[MaxCrop Sync] Brak farmy o ID ${MAXCROP_FARM_ID} w bazie!`)
      return
    }

    const blockMap = new Map(farm.blocks.map(b => [b.name, b.id]))

    // 8. Upsert to harvest_entries
    let upserted = 0
    let errors = 0

    for (const row of parsedRows) {
      const blockName = mapAreaToBlockName(row.areaName)
      const blockId = blockName ? blockMap.get(blockName) ?? null : null

      try {
        await prisma.harvestEntry.upsert({
          where: {
            farmId_date_areaName_productClass: {
              farmId: farm.id,
              date: new Date(row.date),
              areaName: row.areaName,
              productClass: row.productClass,
            },
          },
          update: {
            weightKg: row.weightKg,
            quantity: row.quantity,
            blockId,
            sourceFile: fileName,
          },
          create: {
            date: new Date(row.date),
            areaName: row.areaName,
            productClass: row.productClass,
            weightKg: row.weightKg,
            quantity: row.quantity,
            blockId,
            farmId: farm.id,
            sourceFile: fileName,
          },
        })
        upserted++
      } catch (e) {
        console.error(`[MaxCrop Sync] Upsert error: ${row.date} ${row.areaName}:`, e)
        errors++
      }
    }

    console.log(`[MaxCrop Sync] Gotowe: ${upserted} upserted, ${errors} błędów`)

  } catch (error) {
    console.error('[MaxCrop Sync] Błąd:', error)
    await page.screenshot({ path: path.join(tmpDir, 'maxcrop-error.png'), fullPage: true })
    console.error('[MaxCrop Sync] Screenshot: tmp/maxcrop-error.png')
    process.exit(1)
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

main()
