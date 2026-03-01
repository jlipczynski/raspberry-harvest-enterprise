export interface TemperatureRecord {
  timestamp: Date
  temperature: number
}

/**
 * Matches a Testo title (e.g. "Tunel 9C") or block code (e.g. "9C") to specific sections.
 *
 * Logic:
 * 1. Parse input: "Tunel 9C" → tunnelNumber=9, blockLetter=C
 * 2. Find block whose name matches the letter (e.g. block "C")
 * 3. Find section whose range covers the tunnel number (e.g. "C06-C11" covers 9)
 *
 * Section name formats supported: "C06-C11", "C06 - C11", "C6-C11", "C06-11"
 * Falls back to returning all sections if no range-based match is possible.
 */
export function matchBlockToSections(
  blockName: string,
  blocks: Array<{ id: string; name: string; sections: Array<{ id: string; name: string | null }> }>
): Array<{ sectionId: string; sectionName: string | null; blockId: string; blockName: string }> {
  const parsed = parseTunnelIdentifier(blockName)

  if (parsed) {
    return matchByTunnelNumber(parsed, blocks)
  }

  // Fallback: simple string matching for non-tunnel formats
  return matchByStringComparison(blockName, blocks)
}

interface TunnelId {
  tunnelNumber: number
  blockLetter: string
}

/**
 * Parse "Tunel 9C" → { tunnelNumber: 9, blockLetter: "C" }
 * Also handles: "9C", "tunel 12B", "Tunel9C"
 */
function parseTunnelIdentifier(input: string): TunnelId | null {
  const normalized = input.trim()

  // Pattern: "Tunel 9C" or "tunel 9C" or "Tunel9C" or just "9C"
  // Number followed by letter
  const match = normalized.match(/(\d+)\s*([A-Za-z])$/i)
  if (match) {
    return {
      tunnelNumber: parseInt(match[1]),
      blockLetter: match[2].toUpperCase(),
    }
  }

  return null
}

/**
 * Parse section name to extract a range.
 * "C06-C11" → { letter: "C", start: 6, end: 11 }
 * "C06-11"  → { letter: "C", start: 6, end: 11 }
 * "C6-C11"  → { letter: "C", start: 6, end: 11 }
 * "C06 - C11" → { letter: "C", start: 6, end: 11 }
 */
function parseSectionRange(name: string): { letter: string; start: number; end: number } | null {
  // Pattern: Letter + Number - (optionalLetter) + Number
  const match = name.trim().match(/^([A-Za-z])(\d+)\s*-\s*(?:[A-Za-z])?(\d+)$/i)
  if (match) {
    return {
      letter: match[1].toUpperCase(),
      start: parseInt(match[2]),
      end: parseInt(match[3]),
    }
  }
  return null
}

function matchByTunnelNumber(
  tunnel: TunnelId,
  blocks: Array<{ id: string; name: string; sections: Array<{ id: string; name: string | null }> }>
): Array<{ sectionId: string; sectionName: string | null; blockId: string; blockName: string }> {
  const matches: Array<{ sectionId: string; sectionName: string | null; blockId: string; blockName: string }> = []

  // Find the block matching the letter
  const block = blocks.find(b => {
    const n = b.name.toUpperCase().trim()
    return n === tunnel.blockLetter || n === `BLOK ${tunnel.blockLetter}`
  })

  if (!block) return matches

  // Try to match specific section by range
  for (const section of block.sections) {
    if (!section.name) continue
    const range = parseSectionRange(section.name)
    if (range && range.letter === tunnel.blockLetter && tunnel.tunnelNumber >= range.start && tunnel.tunnelNumber <= range.end) {
      matches.push({
        sectionId: section.id,
        sectionName: section.name,
        blockId: block.id,
        blockName: block.name,
      })
    }
  }

  // If no range matched, fall back to all sections in the block
  if (matches.length === 0) {
    for (const section of block.sections) {
      matches.push({
        sectionId: section.id,
        sectionName: section.name,
        blockId: block.id,
        blockName: block.name,
      })
    }
  }

  return matches
}

function matchByStringComparison(
  blockName: string,
  blocks: Array<{ id: string; name: string; sections: Array<{ id: string; name: string | null }> }>
): Array<{ sectionId: string; sectionName: string | null; blockId: string; blockName: string }> {
  const matches: Array<{ sectionId: string; sectionName: string | null; blockId: string; blockName: string }> = []

  for (const block of blocks) {
    const blockNameUpper = block.name.toUpperCase()
    const targetUpper = blockName.toUpperCase()

    if (blockNameUpper === targetUpper || blockNameUpper.includes(targetUpper) || targetUpper.includes(blockNameUpper)) {
      for (const section of block.sections) {
        matches.push({
          sectionId: section.id,
          sectionName: section.name,
          blockId: block.id,
          blockName: block.name,
        })
      }
    }
  }

  return matches
}
