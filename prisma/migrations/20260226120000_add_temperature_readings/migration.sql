-- CreateTable
CREATE TABLE "temperature_readings" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "sectionId" TEXT NOT NULL,
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temperature_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "temperature_readings_sectionId_timestamp_idx" ON "temperature_readings"("sectionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "temperature_readings_sectionId_timestamp_key" ON "temperature_readings"("sectionId", "timestamp");

-- AddForeignKey
ALTER TABLE "temperature_readings" ADD CONSTRAINT "temperature_readings_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
