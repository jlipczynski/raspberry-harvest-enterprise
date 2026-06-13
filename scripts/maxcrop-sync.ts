/**
 * MaxCrop Harvest Sync Agent
 *
 * Loguje się do maxcropdata.com, scrapuje tabelę "Suma zbiorów" dzień po dniu
 * (od dziś do startu sezonu), i robi upsert do harvest_entries.
 *
 * Uruchamianie: npx tsx scripts/maxcrop-sync.ts
 * Cron: codziennie o 21:00
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import { mapAreaToBlockName } from '../src/lib/maxcrop-harvest-parser'

const MAXCROP_URL = 'https://www.maxcropdata.com/'
const MAXCROP_USER = process.env.MAXCROP_USER
const MAXCROP_PASS = process.env.MAXCROP_PASS

if (!MAXCROP_USER || !MAXCROP_PASS) {
  console.error('Brak MAXCROP_USER lub MAXCROP_PASS w .env.local')
  process.exit(1)
}

const prisma = new PrismaClient()

function getSeasonStartDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), 4, 1) // 1 maja
}

interface HarvestRow {
  date: string
  areaName: string
  productClass: string
  weightKg: number
  quantity: number
}

async function main() {
  const seasonStart = getSeasonStartDate()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalDays = Math.ceil((today.getTime() - seasonStart.getTime()) / 86400000) + 1
  console.log(`[MaxCrop Sync] Sezon: ${seasonStart.toISOString().slice(0, 10)} → ${today.toISOString().slice(0, 10)} (${totalDays} dni)`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
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

    // 2. Navigate to "Suma zbiorów"
    await page.click('text=Suma zbiorów')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // 3. Click "Bieżący" to start from today
    await page.click('text=Bieżący')
    await page.waitForTimeout(1500)

    // 4. Scrape day by day, going back with "<" button
    const allRows: HarvestRow[] = []
    let emptyDays = 0

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
      // Scrape first Vaadin table ("Dzienne informacje o zbiorach")
      const firstTable = page.locator('.v-table').first()
      const tableRows = await firstTable.locator('.v-table-row, .v-table-row-odd').all()

      let dayRows = 0
      for (const tr of tableRows) {
        const cells = await tr.locator('.v-table-cell-content').all()
        if (cells.length < 4) continue

        const cellTexts = await Promise.all(cells.map(c => c.textContent()))
        const dateCell = (cellTexts[0] || '').trim()
        const areaName = (cellTexts[1] || '').trim()
        const productClass = (cellTexts[2] || '').trim()
        const weightStr = (cellTexts[3] || '').trim().replace(',', '.')
        const quantityStr = cells.length > 4 ? (cellTexts[4] || '').trim().replace(',', '.') : '0'

        if (!dateCell || dateCell === 'Data' || !areaName) continue
        if (areaName.toLowerCase().includes('suma')) continue

        const weightKg = parseFloat(weightStr)
        const quantity = parseFloat(quantityStr)
        if (isNaN(weightKg) || weightKg <= 0) continue

        allRows.push({ date: dateCell, areaName, productClass, weightKg, quantity: isNaN(quantity) ? 0 : quantity })
        dayRows++
      }

      if (dayRows > 0) {
        emptyDays = 0
      } else {
        emptyDays++
      }

      // Log progress
      if (dayOffset % 7 === 0) {
        const currentDate = new Date(today)
        currentDate.setDate(currentDate.getDate() - dayOffset)
        console.log(`[MaxCrop Sync] ${currentDate.toISOString().slice(0, 10)}: ${dayRows} wierszy (łącznie ${allRows.length})`)
      }

      // Stop if we're past season start or 10+ empty days in a row
      if (emptyDays >= 10) {
        console.log('[MaxCrop Sync] 10 pustych dni z rzędu — stop.')
        break
      }

      if (dayOffset < totalDays - 1) {
        // Click "<" to go to previous day
        const prevButtons = await page.locator('.v-button-caption').all()
        let clicked = false
        for (const btn of prevButtons) {
          const text = await btn.textContent()
          if (text?.trim() === '<') {
            await btn.click()
            clicked = true
            break
          }
        }
        if (!clicked) break
        await page.waitForTimeout(1000)
      }
    }

    console.log(`[MaxCrop Sync] Scrapowano ${allRows.length} wierszy`)

    if (allRows.length === 0) {
      console.log('[MaxCrop Sync] Brak danych.')
      return
    }

    // 5. Get farm and blocks for mapping
    const farm = await prisma.farm.findFirst({
      include: { blocks: { select: { id: true, name: true } } },
    })
    if (!farm) {
      console.error('[MaxCrop Sync] Brak farmy w bazie!')
      return
    }

    const blockMap = new Map(farm.blocks.map(b => [b.name, b.id]))

    // 6. Upsert to harvest_entries
    let inserted = 0
    let updated = 0
    let errors = 0

    for (const row of allRows) {
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
            sourceFile: 'maxcrop-sync',
          },
          create: {
            date: new Date(row.date),
            areaName: row.areaName,
            productClass: row.productClass,
            weightKg: row.weightKg,
            quantity: row.quantity,
            blockId,
            farmId: farm.id,
            sourceFile: 'maxcrop-sync',
          },
        })
        inserted++ // upsert — can't easily tell insert vs update
      } catch (e) {
        console.error(`[MaxCrop Sync] Upsert error: ${row.date} ${row.areaName}:`, e)
        errors++
      }
    }

    console.log(`[MaxCrop Sync] Gotowe: ${inserted} upserted, ${errors} błędów`)

  } catch (error) {
    console.error('[MaxCrop Sync] Błąd:', error)
    const { mkdirSync, existsSync } = await import('fs')
    if (!existsSync('tmp')) mkdirSync('tmp', { recursive: true })
    await page.screenshot({ path: 'tmp/maxcrop-error.png', fullPage: true })
    console.error('[MaxCrop Sync] Screenshot: tmp/maxcrop-error.png')
    process.exit(1)
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

main()
