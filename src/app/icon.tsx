import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 64,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <svg viewBox="0 0 64 64" width="64" height="64">
          <path d="M32 8 C28 4, 22 6, 24 12 C26 16, 30 16, 32 14" fill="#22c55e"/>
          <path d="M32 8 C36 4, 42 6, 40 12 C38 16, 34 16, 32 14" fill="#16a34a"/>
          <rect x="31" y="4" width="2" height="12" rx="1" fill="#15803d"/>
          <circle cx="26" cy="24" r="6" fill="#dc2626"/>
          <circle cx="38" cy="24" r="6" fill="#dc2626"/>
          <circle cx="32" cy="22" r="6" fill="#ef4444"/>
          <circle cx="22" cy="32" r="6" fill="#dc2626"/>
          <circle cx="32" cy="30" r="6" fill="#ef4444"/>
          <circle cx="42" cy="32" r="6" fill="#dc2626"/>
          <circle cx="26" cy="40" r="6" fill="#b91c1c"/>
          <circle cx="38" cy="40" r="6" fill="#b91c1c"/>
          <circle cx="32" cy="38" r="6" fill="#dc2626"/>
          <circle cx="32" cy="48" r="6" fill="#991b1b"/>
          <circle cx="26" cy="48" r="5" fill="#b91c1c"/>
          <circle cx="38" cy="48" r="5" fill="#b91c1c"/>
          <circle cx="32" cy="54" r="4" fill="#991b1b"/>
        </svg>
      </div>
    ),
    { ...size }
  )
}
