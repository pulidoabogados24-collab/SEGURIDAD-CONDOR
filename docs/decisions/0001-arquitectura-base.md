# ADR 0001 — Arquitectura base de ControlGuard

## Contexto

ControlGuard es un SaaS multi-empresa para empresas de vigilancia y seguridad
privada en Colombia. Debe centralizar rondas, puntos de control por QR,
evidencia fotográfica, GPS, novedades, cumplimiento, alertas y reportes,
con aislamiento estricto entre empresas (multi-tenant) y una app de
vigilante que funcione sin conexión a internet.

No existía proyecto previo: se parte de cero.

## Decisión

**Stack:**
- Frontend: React 18 + TypeScript + Vite. PWA con `vite-plugin-pwa`
  (Workbox) para service worker, cache e instalación.
- Estilos: Tailwind CSS. Paleta negro/gris/blanco + un color de acción
  (ámbar de seguridad `#F5A623`→ ajustado a `#E8A33D` para AA contrast)
  sobre fondo oscuro tipo centro de operaciones.
- Backend: Supabase (Postgres + Auth + Storage + Realtime). No se
  construye un backend Node separado: la lógica crítica vive en
  Postgres (RLS + funciones `SECURITY DEFINER` + triggers) y en Edge
  Functions de Supabase para operaciones que requieren service role
  (p. ej. crear usuarios, invalidar QR masivamente, generar reportes PDF).
- Offline: IndexedDB (vía `idb`) como cola de sincronización local en
  el navegador del vigilante. Nunca como base de datos principal —
  es un buffer temporal que se vacía al sincronizar.
- QR: `qrcode` (generación) + `@zxing/browser` (lectura vía cámara,
  más tolerante en gama baja de Android que `jsQR` puro).
- Mapas: se deja interfaz `MapProvider` abstracta; implementación MVP
  con Leaflet + OpenStreetMap (sin costo, sin API key) para no bloquear
  el MVP con una cuenta de Google Maps que Josep no tiene todavía.
- Hosting: Vercel (frontend). Supabase gestiona su propia infraestructura.

**Por qué Supabase y no backend propio:** el 80% del trabajo de este
proyecto es aislamiento de datos correcto (multi-tenant) y auditoría.
Postgres RLS resuelve esto en la capa de datos, de forma verificable con
SQL, en vez de reimplementar filtros de tenant en cada endpoint. Esto es
más seguro (una fuga de código en un endpoint no expone datos de otra
empresa) y más rápido de construir correctamente.

**Por qué no NFC/reconocimiento facial ahora:** están fuera del MVP.
Se deja el modelo de datos preparado (`qr_codes.tag_type` admite valores
futuros) pero no se implementa lectura NFC en esta fase.

## Multi-tenancy

Aislamiento a nivel de fila (RLS), nunca a nivel de frontend. Cada tabla
operativa tiene `company_id` y una política que exige
`company_id = current_company_id()`, función que lee el `company_id` del
JWT/perfil del usuario autenticado. El rol `super_admin` tiene una
política adicional que le permite ver todas las empresas (uso exclusivo
del panel SaaS, nunca expuesto a admins de empresa).

## Offline-first

El vigilante puede: abrir la app, ver su turno, iniciar ronda, escanear
puntos, tomar fotos y registrar novedades sin internet. Cada evento se
guarda primero en IndexedDB con un UUID generado en el cliente
(`client_event_id`). Ese UUID es la clave de idempotencia en el servidor
(`UNIQUE` en `checkpoint_scans.client_event_id`), de modo que reintentos
de sincronización nunca dupliquen datos. Las fotos se guardan como Blob
en IndexedDB y se suben a Supabase Storage solo al sincronizar.

## Consecuencias

- Reversible: elección de Leaflet vs Google Maps (interfaz abstracta,
  cambiar el proveedor no toca el resto del sistema).
- Reversible: Edge Functions vs. lógica en RLS/triggers — se puede migrar
  lógica de un lado a otro sin cambiar el modelo de datos.
- Poco reversible una vez haya datos de producción: el esquema de
  multi-tenancy (`company_id` en cada tabla + RLS). Cambiarlo después
  implica migración de datos reales de empresas de seguridad. Por eso
  se diseña completo desde la Fase 1, aunque el MVP no exponga todavía
  todas las pantallas.
- Fuera de este MVP (documentado como Fase 2, arquitectura ya preparada):
  pagos reales (Wompi/Mercado Pago/Stripe), envío de WhatsApp/SMS/Email
  para alertas (se deja tabla `notifications` y un campo de canal
  preparado), reconocimiento facial, NFC, asistente de IA.
