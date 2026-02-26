export interface TemperatureRecord {
  timestamp: Date
  temperature: number
}

/**
 * Matches a block name from file to sections in the database.
 * Supports exact match, partial match (block contains target or target contains block).
 */
export function matchBlockToSections(
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
