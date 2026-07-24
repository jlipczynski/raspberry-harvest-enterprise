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

/** Pole z dwujęzycznym podpisem: polski, pod nim angielski. */
function Field({ pl, en, value, muted }: { pl: string; en: string; value: string; muted?: boolean }) {
  return (
    <div className="lbl-field">
      <div className="lbl-field-label">
        {pl}
        <span className="lbl-field-en">{en}</span>
      </div>
      <div className={`lbl-field-value${muted ? ' lbl-muted' : ''}`}>{value || ' '}</div>
    </div>
  )
}

function OneLabel({ data }: { data: LabelData }) {
  const mass = totalNetKg(data.cartons ?? 0, data.packaging)

  return (
    <div className="lbl">
      <div className="lbl-header">
        <span className="lbl-header-main">ETYKIETA PALETOWA <span className="lbl-header-en">/ PALLET LABEL</span></span>
        <span className="lbl-header-sep">|</span>
        <span className="lbl-header-main">MALINY <span className="lbl-header-en">/ RASPBERRIES</span></span>
      </div>

      <Field pl="Odbiorca / klient" en="Recipient / customer" value={data.recipient} />

      <div className="lbl-row">
        <Field pl="Liczba kartonów zbiorczych" en="No. of master cartons"
          value={data.cartons != null ? String(data.cartons) : ''} />
        <Field pl="Numer partii" en="Batch number" value={data.batchNumber} />
      </div>

      <div className="lbl-row">
        <Field pl="Konfekcja" en="Packaging" value={data.packaging ? packagingLabel(data.packaging) : ''} />
        <Field pl="Masa łączna netto [kg]" en="Total net weight [kg]"
          value={mass != null ? formatKg(mass) : ''} />
      </div>

      <div className="lbl-row">
        <Field pl="Data zbioru" en="Harvest date"
          value={data.harvestDate ? formatLabelDate(data.harvestDate) : ''} />
        <Field pl="Data przygotowania" en="Preparation date"
          value={data.prepDate ? formatLabelDate(data.prepDate) : ''} />
      </div>

      <div className="lbl-row">
        <Field pl="Numer palety" en="Pallet number" value={data.palletNumber} muted />
        <div className="lbl-field lbl-field-blank" />
      </div>

      {/* Dane producenta na samym dole etykiety */}
      <div className="lbl-producer">
        <div className="lbl-field-label lbl-producer-label">
          Dane producenta<span className="lbl-field-en lbl-producer-en">Producer details</span>
        </div>
        <div className="lbl-producer-name">{PRODUCER.name}&nbsp;&nbsp;|&nbsp;&nbsp;{PRODUCER.address}</div>
        <div className="lbl-producer-ids">
          NIP: {PRODUCER.nip}&nbsp;&nbsp;|&nbsp;&nbsp;REGON: {PRODUCER.regon}&nbsp;&nbsp;|&nbsp;&nbsp;GGN: {PRODUCER.ggn}
        </div>
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
        <span className="lbl-cut-text">LINIA CIĘCIA / CUT LINE</span>
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
          border: 1.2pt solid #111;
          padding: 2.5mm;
        }
        .lbl-header {
          background: #111;
          color: #fff;
          text-align: center;
          font-weight: 700;
          font-size: 12pt;
          letter-spacing: 0.03em;
          padding: 1.8mm 0;
          margin: -2.5mm -2.5mm 2mm -2.5mm;
        }
        .lbl-header-en { font-size: 7.5pt; font-weight: 400; opacity: 0.75; }
        .lbl-header-sep { margin: 0 2.5mm; opacity: 0.5; font-weight: 400; }
        .lbl-row { display: flex; gap: 2.5mm; }
        .lbl-row > * { flex: 1; }
        .lbl-field {
          border: 0.6pt solid #111;
          padding: 1.2mm 2.5mm 1.5mm;
          margin-bottom: 2mm;
        }
        .lbl-field-blank { border: none; }
        .lbl-field-label {
          font-size: 7pt;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #333;
          font-weight: 700;
          line-height: 1.15;
        }
        .lbl-field-en {
          display: block;
          font-size: 6pt;
          font-weight: 400;
          font-style: italic;
          color: #777;
          text-transform: none;
          letter-spacing: 0;
        }
        .lbl-field-value {
          font-size: 12.5pt;
          font-weight: 700;
          margin-top: 0.8mm;
          min-height: 5mm;
          word-break: break-word;
          line-height: 1.1;
        }
        .lbl-muted { color: #999; font-weight: 400; }
        .lbl-producer {
          background: #111;
          color: #fff;
          padding: 1.8mm 2.5mm;
          margin-bottom: 0;
        }
        .lbl-producer-label { color: #bbb; }
        .lbl-producer-en { color: #999; }
        .lbl-producer-name { font-size: 9pt; font-weight: 700; margin-top: 0.6mm; }
        .lbl-producer-ids { font-size: 7.5pt; margin-top: 0.3mm; color: #ddd; }
        .lbl-cut {
          display: flex;
          align-items: center;
          gap: 2mm;
          color: #888;
          font-size: 7.5pt;
          letter-spacing: 0.08em;
          padding: 1.5mm 0;
        }
        .lbl-cut-scissors { font-size: 10pt; }
        .lbl-cut-line { flex: 1; border-top: 1px dashed #999; }
        .lbl-cut-text { white-space: nowrap; }
      ` }} />
    </div>
  )
}
