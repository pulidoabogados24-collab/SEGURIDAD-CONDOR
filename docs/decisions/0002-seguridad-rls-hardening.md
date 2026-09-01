# ADR 0002 — Hardening de seguridad post-schema (RLS + funciones)

## Contexto

Tras aplicar el schema inicial (migraciones 0001-0008), se ejecutó el
advisor de seguridad de Supabase (`get_advisors type=security`) como
paso obligatorio de la Fase 1/3. Se encontraron 3 clases de hallazgos.

## Hallazgos y resolución

**1. Funciones sin `search_path` fijo (`set_updated_at`, `haversine_meters`)**
Riesgo: un atacante con capacidad de crear objetos en un schema anterior
en el `search_path` podría hacer "search_path hijacking". Corregido en
migración 0009 fijando `search_path = public` en ambas funciones.

**2. Funciones `SECURITY DEFINER` ejecutables por `anon` y por `PUBLIC`**
Este fue el hallazgo más importante. Postgres otorga `EXECUTE` a `PUBLIC`
por defecto al crear cualquier función, y como `anon`/`authenticated`
heredan de `PUBLIC`, un simple `REVOKE ... FROM anon` (migración 0009)
NO era suficiente — el rol seguía pudiendo ejecutar vía el grant heredado
de `PUBLIC`. Se verificó esto directamente con
`has_function_privilege(rolname, oid, 'EXECUTE')` antes y después.

Corrección real (migración 0010): `REVOKE EXECUTE ... FROM PUBLIC` en
todas las funciones sensibles, y luego `GRANT EXECUTE ... TO authenticated`
explícito solo en las que un usuario logueado debe poder invocar
(`register_checkpoint_scan`, `create_incident`, `finish_route_session`,
los helpers `current_company_id`/`is_super_admin`/etc.). Las funciones de
uso exclusivamente interno (`sweep_operational_alerts` — job de cron vía
service_role; `handle_new_auth_user` y `prevent_self_privilege_escalation`
— disparadas por triggers) no reciben ningún grant a `authenticated` ni
`anon`. Se confirmó que los triggers siguen funcionando sin ese grant:
la ejecución de una función por un trigger no requiere que el rol que
disparó el INSERT/UPDATE tenga privilegio `EXECUTE` directo sobre ella.

Esto es el control de seguridad más importante del proyecto hasta ahora:
sin él, cualquier usuario anónimo (sin sesión) habría podido llamar
`/rest/v1/rpc/register_checkpoint_scan` o `/rest/v1/rpc/create_incident`
directamente. Aunque la lógica interna de esas funciones valida
`auth.uid()` y `current_company_id()`, dejar la puerta de ejecución
abierta a `anon` viola el principio de defensa en profundidad exigido
por la constitución de ingeniería de este tipo de proyectos (nunca
confiar en una sola capa).

**3. `spatial_ref_sys` sin RLS / extensión `postgis` en schema `public`**
`spatial_ref_sys` es una tabla de sistema de la extensión PostGIS, de
solo lectura, sin datos de clientes (solo definiciones de sistemas de
referencia espacial estándar). Postgres rechaza
`ALTER TABLE spatial_ref_sys ENABLE ROW LEVEL SECURITY` con
"must be owner of table" incluso para el rol admin del proyecto gestionado
por Supabase — es una limitación de la plataforma gestionada, no algo que
se pueda corregir desde migraciones de la aplicación. Aceptado como riesgo
nulo y documentado (no se está usando PostGIS para nada más que la
extensión instalada; el cálculo de distancia real usa Haversine puro en
SQL, ver `haversine_meters()`). Revisar en Fase 2 si se decide adoptar
tipos `geography` de PostGIS — en ese punto vale la pena mover la extensión
a un schema dedicado (`extensions`) en un proyecto nuevo o vía migración
mayor.

## Verificación

Se re-ejecutó `get_advisors` tras 0009 y se confirmó por SQL directo
(`has_function_privilege`) que `anon` y `PUBLIC` ya no pueden ejecutar
ninguna de las funciones críticas, y que `authenticated` solo puede
ejecutar las que la aplicación necesita invocar desde el cliente.

## Adenda — regresión al cambiar firmas (migraciones 0013/0014)

Durante la Fase 3 (corrección de tipos TypeScript para parámetros
opcionales de `register_checkpoint_scan` y `create_incident`) fue
necesario cambiar la firma de ambas funciones (agregar `DEFAULT NULL` a
parámetros de coordenadas GPS y reordenar para cumplir la regla de
Postgres de que los parámetros con `DEFAULT` deben ir al final).

Al aplicar `CREATE OR REPLACE FUNCTION` con una firma distinta a la
original, Postgres/Supabase trató la función como un objeto nuevo y le
otorgó automáticamente `EXECUTE` directo a `anon` y `authenticated`
(no solo heredado de `PUBLIC`), revirtiendo silenciosamente el
hardening de la sección anterior para esas dos funciones específicas.
Esto se detectó de inmediato porque volver a correr `get_advisors` tras
0013 mostró de nuevo el hallazgo "Public Can Execute SECURITY DEFINER
Function" para ambas — y se confirmó con `has_function_privilege()`
directo (`anon_can_exec = true`).

Corregido en 0014 con `REVOKE EXECUTE ... FROM anon` explícito (no solo
`FROM PUBLIC`) seguido del `GRANT ... TO authenticated`. Verificado de
nuevo tras aplicar: `anon = false`, `authenticated = true`,
`public = false` en ambas funciones.

**Regla operativa para el resto del proyecto:** todo `CREATE OR REPLACE
FUNCTION` que cambie la firma (agregar/quitar/reordenar parámetros) de
una función sensible debe ir seguido, en la misma migración, de
`REVOKE EXECUTE ... FROM PUBLIC` y `REVOKE EXECUTE ... FROM anon`
explícitos antes del `GRANT` a `authenticated` — nunca asumir que los
grants previos persisten solo porque el nombre de la función no cambió.
Correr `get_advisors(type=security)` después de cualquier
`CREATE OR REPLACE FUNCTION` sobre una función `SECURITY DEFINER`
sensible, no solo después de crearla la primera vez.
