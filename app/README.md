# ControlGuard — app (frontend PWA)

Frontend de ControlGuard: React 19 + TypeScript + Vite + Tailwind CSS v4,
empaquetado como PWA instalable (funciona sin conexión para el rol
vigilante).

Ver el README raíz del repositorio (`../README.md`) para la visión general
del proyecto, arquitectura y guía de despliegue.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar con las credenciales de tu proyecto Supabase
npm run dev
```

## Comandos

- `npm run dev` — servidor de desarrollo con hot reload.
- `npm run build` — typecheck (`tsc -b`) + build de producción a `dist/`.
- `npm run preview` — sirve el build de producción localmente.
- `npm run lint` — lint con Oxlint.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (`anon`/`publishable`) del proyecto — nunca la `service_role`. |

## Estructura

```
src/
  components/    componentes de UI reutilizables (Button, Card, Badge, etc.)
  lib/
    offline/     cola de sincronización en IndexedDB (db.ts, sync.ts)
    stores/      estado global (Zustand) — auth.ts
    supabase/    cliente Supabase + tipos generados desde el esquema real
    types/       tipos de dominio y mapas de etiquetas en español
  pages/
    admin/       panel de administrador de empresa
    superadmin/  panel SaaS (todas las empresas, métricas)
    supervisor/  centro de operaciones en vivo
    guard/       app PWA del vigilante (funciona offline)
    client/      portal de solo lectura para el cliente contratante
  routes/        guardas de ruta por rol (RBAC de UX — la seguridad real vive en RLS)
scripts/
  gen_icons.py   genera los iconos PWA (public/icons/, favicon.svg, apple-touch-icon.png)
```

---

## Gestión desde la app (octubre 2026)

- **Vigilantes** (`/admin/vigilantes`): crear, editar nombre/teléfono/cédula/correo/rondas, cambiar
  contraseña, desactivar (bloquea el acceso real y cancela sus rondas pendientes) y eliminar
  (solo si no tiene historial). Backend: función Edge `admin-manage-user`.
- **Supervisores** (`/admin/usuarios`): las mismas acciones + servicios que supervisan.
- **Puntos / QR** (`/admin/puntos`, `/supervisor/puntos`): añadir, renombrar, tarifa, regenerar QR,
  descargar QR, desactivar/reactivar y eliminar (solo sin historial). RPC `create_checkpoint`,
  `update_checkpoint`, `set_checkpoint_active`, `regenerate_checkpoint_qr`, `delete_checkpoint`.
- **Ubicación en vivo**: `components/guard/LiveLocationSharer.tsx` está montado en toda la app; al
  pasar la ronda a «en curso» (`start_route_session`) empieza a enviar la posición (primer envío
  inmediato + latido cada 15 s) hasta que la ronda termina. `/admin/mapa` la recibe por Realtime.
- **Realtime** requiere que las tablas estén en la publicación `supabase_realtime` (migración 0031).

### Migraciones
Las migraciones `0030` y `0031` están en `supabase/migrations`. Algunas migraciones antiguas se
aplicaron directamente en Supabase y no tienen archivo aquí (0011, 0025–0027, 0029); para
regenerarlas usa `supabase db pull`. **Pendiente:** `supabase/PENDIENTE_delete_checkpoint.sql`
(habilita «Eliminar punto»); pégalo en Supabase → SQL Editor y ejecútalo.

### Pruebas visuales
`npm run build && npx vite preview --port 4173 &` y luego
`node scripts/visual-check-gestion.cjs` (API simulada; no valida consultas reales).
