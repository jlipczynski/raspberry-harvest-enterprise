'use client'

import { formatKg, formatLabelDate, packagingLabel, type Packaging } from '@/lib/shipping'
import { totalNetKg } from '@/lib/shipping'

/**
 * Dane producenta drukowane na każdej etykiecie. To stała treść etykiety
 * (jak nagłówki UI) — tożsamość gospodarstwa Jana, ta sama na każdej palecie.
 * Docelowo mogłaby pochodzić z ustawień farmy; na razie jest zaszyta świadomie.
 */
export const PRODUCER = {
  name: 'Gospodarstwo Rolne Jan Lipczyński',
  address: 'Wyszynki 1A, 64-834 Wyszynki',
  nip: '7772488146',
  regon: '639841302',
  ggn: '4063061939883',
}

export interface LabelData {
  recipient: string
  cartons: number | null
  packaging: Packaging | null
  batchNumber: string
  harvestDate: string
  prepDate: string
  palletNumber: string
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="lbl-field">
      <div className="lbl-field-label">{label}</div>
      <div className={`lbl-field-value${muted ? ' lbl-muted' : ''}`}>{value || ' '}</div>
    </div>
  )
}

function OneLabel({ data }: { data: LabelData }) {
  const mass = totalNetKg(data.cartons ?? 0, data.packaging)

  return (
    <div className="lbl">
      <div className="lbl-header">
        <span>ETYKIETA PALETOWA</span>
        <span className="lbl-header-sep">|</span>
        <span>MALINY</span>
      </div>

      <Field label="Odbiorca / klient" value={data.recipient} />

      <div className="lbl-row">
        <Field label="Liczba kartonów zbiorczych" value={data.cartons != null ? String(data.cartons) : ''} />
        <Field label="Numer partii" value={data.batchNumber} />
      </div>

      <div className="lbl-row">
        <Field label="Konfekcja" value={data.packaging ? packagingLabel(data.packaging) : ''} />
        <Field label="Masa łączna netto [kg]" value={mass != null ? formatKg(mass) : ''} />
      </div>

      <div className="lbl-producer">
        <div className="lbl-field-label lbl-producer-label">Dane producenta</div>
        <div className="lbl-producer-name">{PRODUCER.name}&nbsp;&nbsp;|&nbsp;&nbsp;{PRODUCER.address}</div>
        <div className="lbl-producer-ids">
          NIP: {PRODUCER.nip}&nbsp;&nbsp;|&nbsp;&nbsp;REGON: {PRODUCER.regon}&nbsp;&nbsp;|&nbsp;&nbsp;GGN: {PRODUCER.ggn}
        </div>
      </div>

      <div className="lbl-row">
        <Field label="Data zbioru" value={data.harvestDate ? formatLabelDate(data.harvestDate) : ''} />
        <Field label="Data przygotowania" value={data.prepDate ? formatLabelDate(data.prepDate) : ''} />
      </div>

      <div className="lbl-row">
        <Field label="Numer palety" value={data.palletNumber} muted />
        <div className="lbl-field lbl-field-blank" />
      </div>
    </div>
  )
}

/** Arkusz A4 z dwiema identycznymi etykietami i linią cięcia. */
export default function LabelSheet({ data }: { data: LabelData }) {
  return (
    <div className="lbl-sheet">
      <OneLabel data={data} />
      <div className="lbl-cut">
        <span className="lbl-cut-scissors">✂</span>
        <span className="lbl-cut-line" />
        <span className="lbl-cut-text">LINIA CIĘCIA</span>
        <span className="lbl-cut-line" />
      </div>
      <OneLabel data={data} />

      <style dangerouslySetInnerHTML={{ __html: `
        .lbl-sheet {
          width: 190mm;
          background: #fff;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }
        .lbl {
          border: 1.5pt solid #111;
          padding: 4mm;
          margin: 0;
        }
        .lbl-header {
          background: #111;
          color: #fff;
          text-align: center;
          font-weight: 700;
          font-size: 15pt;
          letter-spacing: 0.05em;
          padding: 3mm 0;
          margin: -4mm -4mm 3mm -4mm;
        }
        .lbl-header-sep { margin: 0 3mm; opacity: 0.6; font-weight: 400; }
        .lbl-row { display: flex; gap: 3mm; }
        .lbl-row > * { flex: 1; }
        .lbl-field {
          border: 0.75pt solid #111;
          padding: 2mm 3mm;
          margin-bottom: 3mm;
          min-height: 11mm;
        }
        .lbl-field-blank { border: none; }
        .lbl-field-label {
          font-size: 7.5pt;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #444;
          font-weight: 700;
        }
        .lbl-field-value {
          font-size: 14pt;
          font-weight: 700;
          margin-top: 1mm;
          min-height: 6mm;
          word-break: break-word;
        }
        .lbl-muted { color: #999; font-weight: 400; }
        .lbl-producer {
          background: #111;
          color: #fff;
          padding: 2.5mm 3mm;
          margin-bottom: 3mm;
        }
        .lbl-producer-label { color: #bbb; }
        .lbl-producer-name { font-size: 10pt; font-weight: 700; margin-top: 1mm; }
        .lbl-producer-ids { font-size: 8.5pt; margin-top: 0.5mm; color: #ddd; }
        .lbl-cut {
          display: flex;
          align-items: center;
          gap: 2mm;
          color: #888;
          font-size: 8pt;
          letter-spacing: 0.1em;
          padding: 2.5mm 0;
        }
        .lbl-cut-scissors { font-size: 11pt; }
        .lbl-cut-line { flex: 1; border-top: 1px dashed #999; }
        .lbl-cut-text { white-space: nowrap; }
      ` }} />
    </div>
  )
}
