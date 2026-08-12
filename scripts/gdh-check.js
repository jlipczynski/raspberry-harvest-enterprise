/* eslint-disable @typescript-eslint/no-require-imports -- skrypt uruchamiany bezpośrednio node'em, nie przez bundler */
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const sections = await p.section.findMany({
    include: { block: { select: { name: true } }, variety: { select: { name: true, baseTemp: true, gdhWinteredFruitSummer: true, gdhPlantedFruitSummer: true, gdhLcFruitSummer: true } } }
  });

  for (const s of sections) {
    const baseTemp = s.variety.baseTemp;
    if (baseTemp == null) { console.log(s.block.name + ' | ' + (s.name||'?') + ' | BRAK baseTemp na odmianie — pomijam'); continue; }
    let threshold, ttype;
    if (s.winteredInTunnel) {
      threshold = s.gdhWinteredFruitSummer || s.variety.gdhWinteredFruitSummer;
      ttype = 'W';
    } else if (s.plantMaterialType === 'LONGCANE') {
      threshold = s.gdhLcFruitSummer || s.variety.gdhLcFruitSummer;
      ttype = 'LC';
    } else {
      threshold = s.gdhPlantedFruitSummer || s.variety.gdhPlantedFruitSummer;
      ttype = 'P';
    }

    const plantDate = s.plantingDate ? s.plantingDate.toISOString().slice(0,10) : null;
    const useFromPlanting = (s.winteredInTunnel === false) && s.plantingDate;

    let gdhQuery;
    if (useFromPlanting) {
      gdhQuery = await p.$queryRaw`
        SELECT DATE("timestamp") as date, COUNT(*)::int as cnt,
          COALESCE(SUM(GREATEST(0, LEAST("temperature", 26.0) - ${baseTemp})), 0)::float as sum_gdh
        FROM temperature_readings WHERE "sectionId" = ${s.id} AND "timestamp" >= ${s.plantingDate}
        GROUP BY DATE("timestamp") ORDER BY date
      `;
    } else {
      gdhQuery = await p.$queryRaw`
        SELECT DATE("timestamp") as date, COUNT(*)::int as cnt,
          COALESCE(SUM(GREATEST(0, LEAST("temperature", 26.0) - ${baseTemp})), 0)::float as sum_gdh
        FROM temperature_readings WHERE "sectionId" = ${s.id}
        GROUP BY DATE("timestamp") ORDER BY date
      `;
    }

    let cum = 0;
    let fruitDate = null;
    for (const d of gdhQuery) {
      const daily = d.cnt > 0 ? (Number(d.sum_gdh) * 24.0) / d.cnt : 0;
      cum += daily;
      if (fruitDate === null && threshold && cum >= threshold) {
        fruitDate = String(d.date).slice(0,10);
      }
    }

    const remaining = threshold ? Math.round(threshold - cum) : 0;
    const gdhStart = useFromPlanting ? plantDate : 'od-poczatku';
    console.log(
      s.block.name.padEnd(10) + '| ' + (s.name||'?').padEnd(12) + '| ' + s.variety.name.padEnd(18)
      + '| w=' + (s.winteredInTunnel ? 'T' : 'N')
      + ' | plant=' + (plantDate || 'BRAK').padEnd(12)
      + '| gdhOd=' + String(gdhStart).padEnd(14)
      + '| base=' + baseTemp
      + ' | prog(' + ttype + ')=' + String(threshold).padEnd(6)
      + '| GDH=' + String(Math.round(cum)).padEnd(6)
      + '| fruit=' + (fruitDate || 'NIE').padEnd(12)
      + '| brak=' + remaining
    );
  }
  await p.$disconnect();
})().catch(console.error);
