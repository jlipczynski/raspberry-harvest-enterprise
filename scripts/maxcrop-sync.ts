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

async function main() {
  const today = formatDate(new Date())

  console.log(`[MaxCrop Sync] Pobieram dane za: ${today}`)

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

    // 3. Click "Bieżący" — sets both dates to today, shows today's data
    console.log('[MaxCrop Sync] Klikam Bieżący...')
    await page.click('text=Bieżący')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // 4. No need to change dates — "Bieżący" already shows today's data
    //    Just verify what dates are set
    const dateInputs = await page.locator('.v-datefield-textfield').all()
    for (let i = 0; i < dateInputs.length; i++) {
      const val = await dateInputs[i].inputValue().catch(() => '')
      console.log(`[MaxCrop Sync]   input[${i}] value="${val}"`)
    }

    // 5. Click "Szukaj" to confirm
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
