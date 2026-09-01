// Iconos SVG mínimos, sin dependencia externa (evita agregar una librería
// de iconos completa solo para ~15 símbolos usados en toda la app).
import type { SVGProps } from 'react'

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={18}
      height={18}
      {...props}
    />
  )
}

export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></Icon>
)
export const IconBuilding = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" /></Icon>
)
export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><circle cx="9" cy="8" r="3" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /><circle cx="17" cy="8" r="2.5" /><path d="M17.5 14c2.5.4 4.5 2.4 4.5 6" /></Icon>
)
export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 9v4" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 17h.01" /></Icon>
)
export const IconReport = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4" /><path d="M9 13h6M9 17h6M9 9h2" /></Icon>
)
export const IconMap = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></Icon>
)
export const IconQr = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM19 14h2v2M14 19h2v2M19 19h2v2" /></Icon>
)
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z" /></Icon>
)
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></Icon>
)
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
)
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></Icon>
)
export const IconLocation = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></Icon>
)
export const IconClipboard = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><rect x="6" y="4" width="12" height="17" rx="1.5" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 10h6M9 14h6M9 18h4" /></Icon>
)
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
)
export const IconChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>
)
export const IconWifiOff = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.5a10 10 0 0 1 3.5-2.4M19 12.5a10 10 0 0 0-3-2.2M12 20h.01" /></Icon>
)
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>
)
export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Icon>
)
