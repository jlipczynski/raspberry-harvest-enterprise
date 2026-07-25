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

      {/* Środek rozkłada pola na całą wysokość między nagłówkiem a producentem */}
      <div className="lbl-body">
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
          /* Pełna wysokość pola druku A4 (297 - 2×10 mm margines) minus drobny
             luz, żeby druk się nie przelał na drugą stronę. */
          height: 273mm;
          display: flex;
          flex-direction: column;
          background: #fff;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }
        .lbl {
          flex: 1 1 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          border: 1.4pt solid #111;
          padding: 3.5mm;
          overflow: hidden;
        }
        .lbl-header {
          flex: 0 0 auto;
          background: #111;
          color: #fff;
          text-align: center;
          font-weight: 700;
          font-size: 14pt;
          letter-spacing: 0.03em;
          padding: 2.6mm 0;
          margin: -3.5mm -3.5mm 0 -3.5mm;
        }
        .lbl-header-en { font-size: 8.5pt; font-weight: 400; opacity: 0.75; }
        .lbl-header-sep { margin: 0 3mm; opacity: 0.5; font-weight: 400; }
        /* Środek wypełnia całą przestrzeń; każdy wiersz pól rośnie równo */
        .lbl-body {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          padding: 3mm 0;
          gap: 2.5mm;
        }
        .lbl-body > * { flex: 1 1 0; min-height: 0; }
        .lbl-row { display: flex; gap: 3mm; }
        .lbl-row > * { flex: 1; }
        .lbl-field {
          border: 0.7pt solid #111;
          padding: 2mm 3mm;
          display: flex;
          flex-direction: column;
        }
        .lbl-field-blank { border: none; }
        .lbl-field-label {
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          color: #333;
          font-weight: 700;
          line-height: 1.15;
        }
        .lbl-field-en {
          display: block;
          font-size: 6.5pt;
          font-weight: 400;
          font-style: italic;
          color: #777;
          text-transform: none;
          letter-spacing: 0;
        }
        .lbl-field-value {
          flex: 1;
          display: flex;
          align-items: center;
          font-size: 15pt;
          font-weight: 700;
          margin-top: 1.2mm;
          word-break: break-word;
          line-height: 1.1;
        }
        .lbl-muted { color: #999; font-weight: 400; }
        .lbl-producer {
          flex: 0 0 auto;
          background: #111;
          color: #fff;
          padding: 2.4mm 3mm;
        }
        .lbl-producer-label { color: #bbb; }
        .lbl-producer-en { color: #999; }
        .lbl-producer-name { font-size: 10pt; font-weight: 700; margin-top: 0.8mm; }
        .lbl-producer-ids { font-size: 8.5pt; margin-top: 0.4mm; color: #ddd; }
        .lbl-cut {
          flex: 0 0 auto;
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
