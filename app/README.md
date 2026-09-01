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
