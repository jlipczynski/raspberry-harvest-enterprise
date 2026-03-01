-- MaxCrop 2025 data migration: correct yields and curves per section
-- Source: sum_of_crops_2025_05_01_2025_12_06.xls (117,858 kg total)

-- Variety: Diamond Jubilee — autumn was 0.44, real is 0.67; curves from MaxCrop
UPDATE "varieties" SET
  "yieldAutumnPerShoot" = 0.67,
  "harvestCurveSummer" = '[0.5,1.8,2.5,8.3,18.2,19.9,22.1,17.0,7.8,2.6]',
  "harvestCurveAutumn" = '[2.8,10.1,10.0,17.1,22.9,15.1,11.8,5.9,3.5,0.4,0.2]'
WHERE "name" = 'Diamond Jubilee';

-- Variety: Ruby — autumn was 0.51, real is 0 (no autumn production); curves from MaxCrop
UPDATE "varieties" SET
  "yieldAutumnPerShoot" = 0,
  "harvestCurveSummer" = '[0.5,3.8,6.3,14.3,12.4,16.3,17.4,19.1,5.9,3.9]',
  "harvestCurveAutumn" = '[]'
WHERE "name" = 'Ruby';

-- Section A1-9: DJ baseline
UPDATE "sections" SET
  "yieldSummerPerShoot" = 1.47,
  "yieldAutumnPerShoot" = 0.63
WHERE "name" = 'A1-9';

-- Section A10-19: DJ baseline
UPDATE "sections" SET
  "yieldSummerPerShoot" = 1.48,
  "yieldAutumnPerShoot" = 0.70
WHERE "name" = 'A10-19';

-- Section B01-07: Ruby, no autumn
UPDATE "sections" SET
  "yieldSummerPerShoot" = 1.55,
  "yieldAutumnPerShoot" = 0
WHERE "name" = 'B01-07';

-- Section B08-13: Ruby, higher summer, no autumn
UPDATE "sections" SET
  "yieldSummerPerShoot" = 2.13,
  "yieldAutumnPerShoot" = 0
WHERE "name" = 'B08-13';

-- Section C01-05: DJ poor condition, zero summer
UPDATE "sections" SET
  "yieldSummerPerShoot" = 0,
  "yieldAutumnPerShoot" = 0.22
WHERE "name" = 'C01-05';

-- Section C06-11: DJ poor condition, zero summer
UPDATE "sections" SET
  "yieldSummerPerShoot" = 0,
  "yieldAutumnPerShoot" = 0.22
WHERE "name" = 'C06-11';

-- Section D01-09: DJ PLUG year 1
UPDATE "sections" SET
  "yieldSummerPerShoot" = 1.74,
  "yieldAutumnPerShoot" = 0.13
WHERE "name" = 'D01-09';

-- Section D10-18: DJ PLUG year 1
UPDATE "sections" SET
  "yieldSummerPerShoot" = 1.74,
  "yieldAutumnPerShoot" = 0.13
WHERE "name" = 'D10-18';
