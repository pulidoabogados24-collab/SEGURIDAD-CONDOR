# ADR 0003 — Bugs encontrados en QA y motor de alertas periódico

## Contexto

Antes de dar por cerrado el MVP, se ejecutaron los 7 casos de QA
obligatorios del prompt maestro directamente contra la base de datos y las
funciones desplegadas en el proyecto Supabase real (no contra mocks), y se
programó la ejecución periódica del motor de alertas (`sweep-alerts`), que
hasta este punto solo existía como función Edge desplegada pero sin nada
que la invocara automáticamente.

## Bugs encontrados y corregidos durante QA

Todos verificados con llamadas reales a la API (`/rest/v1/rpc/...`) contra
el proyecto Supabase `vgmyryxelsayscxbjjoh`, no solo revisión de código.

**1. Login completamente roto para todos los usuarios (bug crítico).**
El bug estaba en el seed directo de `auth.users`: varias columnas de texto que GoTrue usa internamente para
flujos de cambio de email/teléfono (`email_change`,
`email_change_token_new`, etc.) quedaron en `NULL` porque el INSERT directo
a `auth.users` (necesario porque no hay flujo de signup público expuesto)
no las incluía en la lista de columnas. GoTrue las escanea a campos string
no punteros en Go; un NULL ahí crashea el login de CUALQUIER usuario con
"Database error querying schema" (500). Corregido en la migración 0015
(dato) y en la 0012 (fuente, para que un re-seed futuro no reintroduzca el
bug). Ver el detalle completo en el comentario de la migración 0015.

**2. `useAuthStore.init()` nunca registraba el listener de sesión en una
carga fresca sin sesión (bug crítico, en el frontend).** El
`onAuthStateChange` vivía dentro del branch "hay sesión" de `init()`; en
una carga sin sesión previa (el caso normal de "abrir la app y hacer
login") el listener nunca se registraba, así que un login exitoso posterior
actualizaba Supabase pero nada avisaba a la UI — el botón "Iniciar sesión"
parecía no hacer nada. Corregido registrando el listener de forma
incondicional al inicio de `init()`, con una función `loadProfileFor`
compartida entre el path de carga inicial y el de cambios de sesión.

**3. `register_checkpoint_scan()` fallaba con un QR que no existe en
absoluto en el sistema (bug crítico, caso de QA "rechazo de QR
inválido").** Encontrado y corregido en tres iteraciones (migraciones
0018-0020):
   - `checkpoint_scans.route_point_id` era `NOT NULL`, pero cuando el QR
     escaneado no existe, no hay ningún punto que resolver — la inserción
     fallaba con un 400 sin manejar en vez de devolver limpiamente
     `result = 'invalid_qr'`. Corregido permitiendo NULL solo para ese caso
     (con un `CHECK` que lo garantiza).
   - El check de "escaneo demasiado rápido" (`too_fast`) no respetaba que
     ya hubiera una anomalía detectada, así que podía sobrescribir
     `invalid_qr` y volver a violar el constraint anterior. Corregido dándole
     la misma prioridad relativa que las demás anomalías.
   - La expresión `case when ... then 'high' else 'medium' end` para
     `alerts.severity` (un enum `incident_priority`) se resolvía a tipo
     `text` en vez de a un literal coaccionable, y Postgres no permite esa
     asignación implícita dentro de un `INSERT`. Corregido con un cast
     explícito `::incident_priority`.

**4. Migración de datos con `exception when others` que escondió un fallo
real.** Al crear una segunda empresa de control para probar aislamiento
multi-tenant, un bloque `do $$ ... exception when others ...$$` atrapó
silenciosamente un error real (columna `NOT NULL` sin valor) y provocó
rollback total del bloque sin que la migración se reportara como fallida.
Lección aplicada: nunca capturar excepciones a ciegas en una migración de
datos — un fallo real debe propagarse.

## Casos de QA — resultado final

Los 7 casos obligatorios se ejecutaron contra la base de datos real después
de las correcciones anteriores, con JWTs reales de usuarios demo:

1. Ronda 10/10 = 100% (🟢) — verificado con sesión sembrada 7/7.
2. Sincronización offline→online sin pérdida ni duplicación — verificado
   con `client_event_id` repetido en `create_incident` y en
   `register_checkpoint_scan`: misma fila devuelta, sin duplicar, sin
   duplicar el avance de `completed_points`.
3. Rechazo de QR inválido — verificado tras las correcciones del punto 3.
4. Advertencia por ubicación distante — verificado: ~17m tolerado (`ok`),
   ~1000m rechazado (`location_mismatch`) con alerta `suspicious_location`
   visible para supervisor.
5. Aislamiento cross-tenant imposible — verificado con dos empresas reales:
   lectura de listados, lectura directa por ID y escritura directa contra
   datos de la otra empresa, las tres bloqueadas por RLS.
6. Ronda incompleta genera alerta — verificado: 4/7 finalizada →
   `route_incomplete` / `high` / 57.14%.
7. Incidente crítico llega inmediatamente al supervisor — verificado:
   alerta `critical_incident` visible al instante para el rol supervisor,
   invisible para el rol guard (RLS correcta).

Los datos de prueba introducidos durante QA (empresa de control, escaneos
e incidentes de prueba) se eliminaron después de verificar cada caso; el
seed de demo quedó restaurado a sus conteos originales exactos.

## Motor de alertas periódico (`sweep-alerts`)

**Decisión:** programar `sweep-alerts` con `pg_cron` + `pg_net` (nativo de
Postgres/Supabase) en vez de un programador externo, corriendo cada 5
minutos.

**Por qué se cambió `verify_jwt` a `true` y se eliminó el `CRON_SECRET`
personalizado:** el diseño original protegía la función con un header
`x-cron-secret` validado contra una variable de entorno de la función.
Las herramientas MCP de Supabase disponibles en este proyecto no exponen
ninguna forma de fijar secretos de Edge Functions — solo desplegar código
y ejecutar SQL — así que ese secreto nunca podría configurarse, dejando el
endpoint permanentemente inaccesible (401 para siempre, incluso para el
propio cron). Se resolvió redesplegando la función con `verify_jwt=true`:
la puerta de entrada de Supabase exige un JWT válido antes de ejecutar el
código, sin depender de un secreto no configurable. El cron llama con la
`anon`/publishable key del proyecto como Bearer (JWT válido de bajo
privilegio); la acción realmente privilegiada
(`sweep_operational_alerts()`) la ejecuta la función usando su propia
`SUPABASE_SERVICE_ROLE_KEY`, inyectada automáticamente por Supabase en el
entorno de cada función desplegada y nunca expuesta al llamador. Verificado
con una llamada sin `Authorization`: responde `401
UNAUTHORIZED_NO_AUTH_HEADER`.

**Reversibilidad:** si en el futuro se configura `CRON_SECRET` por otra vía
(CLI de Supabase, dashboard), se puede volver al esquema original sin
cambiar el modelo de datos ni la lógica de `sweep_operational_alerts()`.
