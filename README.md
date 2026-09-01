# ControlGuard

SaaS multi-empresa de control operativo para empresas de vigilancia y
seguridad privada en Colombia: rondas con checkpoints QR, evidencia
fotográfica, GPS, novedades, cumplimiento automático, alertas en tiempo
real y reportes — con aislamiento estricto entre empresas (multi-tenant
real, vía Row Level Security de Postgres) y una app de vigilante que
funciona completamente sin conexión a internet.

Concepto central: `VIGILANTE → RONDA → PUNTO → QR → HORA → UBICACIÓN →
EVIDENCIA → NOVEDAD → SUPERVISOR → REPORTE → CLIENTE`.

## Estructura del repositorio

```
app/          Frontend: React + TypeScript + Vite + Tailwind, PWA offline-first
supabase/
  migrations/ Esquema completo de base de datos, RLS, funciones de negocio (SQL, versionado)
  functions/  Edge Functions (Deno): provisión de usuarios, motor de alertas
docs/
  decisions/  ADRs — decisiones de arquitectura y seguridad documentadas
mockup/       Mockup visual HTML independiente (referencia de diseño)
```

## Stack

- **Frontend:** React 19 + TypeScript + Vite, Tailwind CSS v4, PWA
  (`vite-plugin-pwa`/Workbox), `@zxing/browser` para escaneo QR por cámara,
  Zustand para estado de sesión, IndexedDB (`idb`) como cola de
  sincronización offline.
- **Backend:** Supabase — Postgres (con Row Level Security como única capa
  real de aislamiento multi-tenant), Auth, Storage, Realtime, Edge
  Functions. No hay un backend Node separado: la lógica crítica de negocio
  vive en funciones `SECURITY DEFINER` de Postgres, verificable
  directamente con SQL.
- **Hosting:** Vercel (frontend) + Supabase (backend gestionado).

Ver `docs/decisions/` para el razonamiento completo detrás de cada
decisión de arquitectura, incluyendo los bugs reales encontrados y
corregidos durante la fase de QA (`0003-qa-bugs-y-cron.md`).

## Puesta en marcha

### 1. Base de datos (Supabase)

Las migraciones en `supabase/migrations/` son la fuente de verdad del
esquema, en orden. Contra un proyecto Supabase nuevo:

```bash
# Con la CLI de Supabase, desde la raíz del repo:
supabase link --project-ref <tu-project-ref>
supabase db push
```

Esto crea las ~24 tablas, todas las políticas RLS, las funciones de
negocio (`register_checkpoint_scan`, `create_incident`,
`finish_route_session`, `sweep_operational_alerts`, etc.) y siembra la
empresa de demostración ("Seguridad Integral Demo") con vigilantes,
rondas y datos históricos realistas.

Después de aplicar las migraciones, despliega las Edge Functions:

```bash
supabase functions deploy admin-provision-user
supabase functions deploy sweep-alerts
```

`sweep-alerts` se auto-programa vía `pg_cron` (migración
`0021_schedule_sweep_alerts_cron.sql`) para correr cada 5 minutos — no
requiere configuración externa adicional.

### 2. Frontend

```bash
cd app
npm install
cp .env.example .env.local   # completar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run build                # typecheck + build de producción
```

Ver `app/README.md` para el detalle de comandos y estructura del frontend.

### 3. Despliegue

- **Frontend → Vercel:** conectar el repositorio, configurar el
  directorio raíz del proyecto Vercel como `app/`, y definir las mismas
  variables de entorno (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) en
  la configuración del proyecto.
- **Backend:** ya vive en Supabase; no requiere despliegue adicional más
  allá de aplicar migraciones y Edge Functions.

## Empresas cargadas

El sistema es multi-empresa: cada empresa ve exclusivamente sus datos,
garantizado por Row Level Security en Postgres (no por filtros de la
aplicación). Hoy hay dos empresas cargadas, y **ninguna ve los datos de la
otra**.

### Condor Security — operación real

Contraseña para todos: `Condor2026!`

| Rol | Correo | Qué ve |
|---|---|---|
| Administrador | `admin@condorsecurity.co` | Panel, rondas, puntos de control con QR, clientes, reportes |
| Supervisor | `supervisor@condorsecurity.co` | Centro de operaciones y alertas |
| Vigilante | `vigilante@condorsecurity.co` | App de ronda con escaneo QR |

Cliente cargado: **Conjunto Residencial Los Alpes — Vereda El Cairo**
(Villavicencio), con la ronda "Ronda Los Alpes" de **104 puntos de control**,
cada uno con su código QR activo y su tarifa mensual. Cartera del sector:
**$5.270.000/mes**.

Las coordenadas de los puntos están vacías a propósito: los nombres que
entregó el cliente son referencias locales ("Casa escaleras", "Camioneta
gris"), no direcciones geocodificables. Cada punto queda anclado a su
coordenada real la primera vez que un vigilante lo escanea — el mapa se
construye con datos verdaderos o no se construye.

### Seguridad Integral Demo — datos de demostración

Contraseña para todos: `Demo2026!`

| Rol | Correo |
|---|---|
| Super admin (plataforma) | `superadmin@controlguard.demo` |
| Admin de empresa | `admin@seguridadintegraldemo.com` |
| Supervisor | `supervisor@seguridadintegraldemo.com` |
| Vigilante | `carlos.rodriguez@seguridadintegraldemo.com` |
| Cliente (portal) | `cliente@elporvenir.demo` |

## Cómo poner los QR a funcionar

1. Entra como administrador y ve a **Puntos de control**.
2. Pulsa **Imprimir códigos** — la vista de impresión saca cada QR con el
   nombre de su punto.
3. Pega cada código en el sitio físico correspondiente.
4. El vigilante entra desde el celular, abre su ronda y escanea. Queda
   registrada la hora, quién lo hizo, la ubicación GPS y la distancia al
   punto esperado.

El escaneo requiere cámara, y los navegadores solo la permiten sobre HTTPS
— la URL de Vercel ya lo es, así que funciona desde el celular sin
configuración adicional.

## Secciones del panel

| Sección | Contenido |
|---|---|
| Panel | Indicadores del día con comparativo, rondas en curso en vivo, anillo de cumplimiento, actividad reciente y alertas abiertas |
| Rondas | Historial; al abrir una ronda se ve punto por punto quién escaneó, a qué hora, a qué distancia y con qué resultado |
| Puntos de control | Catálogo de QR, imprimible, con búsqueda, filtro por cliente, tarifa y último escaneo |
| Clientes | Establecimientos, su valor mensual y su cumplimiento a 30 días |
| Servicios / Vigilantes / Novedades / Reportes / Usuarios | Gestión operativa |

Todo el panel es responsive: en el celular la barra lateral se convierte en
un cajón que se abre desde la cabecera.

## QA

Los 7 casos de prueba obligatorios (cumplimiento 100%, sincronización
offline sin pérdida de datos, rechazo de QR inválido, advertencia por
ubicación distante, aislamiento multi-tenant imposible de violar, alerta
por ronda incompleta, e incidente crítico visible de inmediato al
supervisor) se verificaron contra el proyecto Supabase real — no contra
mocks. El detalle de cada caso, los bugs reales que surgieron al probarlos
y cómo se corrigieron están documentados en
`docs/decisions/0003-qa-bugs-y-cron.md`.
