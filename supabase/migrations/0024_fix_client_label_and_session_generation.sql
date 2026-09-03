-- ============================================================================
-- 0024_fix_client_label_and_session_generation.sql
--
-- Corrige dos problemas reales encontrados en la operación real de Condor
-- Security (Los Alpes — Vereda El Cairo), reportados por el cliente:
--
-- 1. "Los QR no están funcionando."
--    Diagnóstico verificado contra la base de datos real: los 104 códigos QR
--    existen y están activos, y register_checkpoint_scan() funciona
--    correctamente (ya probado en QA). El problema real es que NUNCA se
--    generó ninguna fila en route_sessions para la ronda real: no existe en
--    todo el sistema ningún mecanismo (ni cron, ni botón en el panel de
--    admin) que cree la sesión del día. La demo (migración 0012) se sembró
--    a mano, saltándose por completo esa función — que nunca se construyó.
--    Sin una route_sessions, el vigilante no tiene ninguna ronda que
--    iniciar, así que no hay nada en qué escanear: el QR nunca llega a
--    probarse. Además, el vigilante ya creado (guard_id
--    c01948c4-85e6-4613-b28e-e0865f334a60) nunca quedó vinculado a la ronda
--    en route_guards, y routes.days_of_week de la ronda real se sembró como
--    {1,2,3,4,5,6,7} — un arreglo inválido para la convención del esquema
--    (0=domingo..6=sábado, ver comentario de la migración 0003): sin el 0
--    (domingo) y con un 7 que ningún día representa. Aunque hubiera existido
--    un generador de sesiones, los domingos jamás se habrían generado.
--
--    Esta migración: (a) corrige days_of_week a {0,1,2,3,4,5,6}, (b) crea el
--    vínculo en route_guards, (c) crea la función
--    generate_daily_route_sessions() que genera la sesión del día para cada
--    ronda activa cuyo day-of-week (hora de Bogotá) corresponda, una por
--    cada vigilante asignado en route_guards, sin duplicar si ya existe una
--    para ese día, (d) la programa con pg_cron a las 00:05 hora de Bogotá
--    (05:05 UTC) — mismo patrón ya verificado en sweep-alerts (migración
--    0021) —, y (e) la ejecuta una vez de inmediato para dejar lista la
--    ronda de hoy sin esperar al cron de mañana.
--
-- 2. "No pongas a todos conjunto residencial, solo por el nombre."
--    El cliente real se sembró como "Conjunto Residencial Los Alpes —
--    Vereda El Cairo" con service_type = 'residencial' — un valor que ni
--    siquiera pertenece al conjunto válido documentado en el esquema
--    ('neighborhood'|'condo'|'company'|'warehouse'|'farm'|'mall'|
--    'institution'|'other'), así que la UI lo mostraba literalmente como
--    "residencial" en vez de una etiqueta reconocible. Y a juzgar por los
--    104 puntos reales (tiendas, casas, un puesto policial, una cancha de
--    tejo, taxis...) esto es una vereda/sector con comercio mixto, no un
--    conjunto residencial cerrado — la etiqueta de tipo no debía asumirse.
--    Se corrige el nombre para que sea solo el nombre real, sin prefijo de
--    tipo inventado, y el tipo a 'neighborhood' (Barrio), la categoría
--    válida más cercana a una vereda/sector, editable después desde el
--    panel de administración si el cliente prefiere otra.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2. Nombre y tipo del cliente real (sin prefijo de tipo asumido)
-- ---------------------------------------------------------------------------
update clients
  set name = 'Los Alpes — Vereda El Cairo'
  where name = 'Conjunto Residencial Los Alpes — Vereda El Cairo';

update services
  set service_type = 'neighborhood'
  where service_type = 'residencial';

-- ---------------------------------------------------------------------------
-- 1a. days_of_week correcto (0=domingo..6=sábado) para la ronda real
-- ---------------------------------------------------------------------------
update routes
  set days_of_week = array[0,1,2,3,4,5,6]
  where name = 'Ronda Los Alpes'
    and days_of_week = array[1,2,3,4,5,6,7]::smallint[];

-- ---------------------------------------------------------------------------
-- 1b. Vincular el vigilante ya creado a la ronda real
-- ---------------------------------------------------------------------------
insert into route_guards (route_id, guard_id, company_id)
select routes.id, guards.id, routes.company_id
from routes
join guards on guards.default_service_id = routes.service_id
where routes.name = 'Ronda Los Alpes'
on conflict (route_id, guard_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1c. Generador de sesiones diarias — la función que nunca existió
-- ---------------------------------------------------------------------------
create or replace function public.generate_daily_route_sessions()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_dow   smallint := extract(dow from (now() at time zone 'America/Bogota'))::smallint;
  v_created integer := 0;
  r record;
  g record;
  v_expected integer;
begin
  for r in
    select routes.id, routes.company_id, routes.service_id, routes.scheduled_time
    from routes
    where routes.is_active = true
      and v_dow = any(routes.days_of_week)
  loop
    select count(*) into v_expected
    from route_points
    where route_points.route_id = r.id and route_points.is_active = true;

    for g in
      select route_guards.guard_id
      from route_guards
      where route_guards.route_id = r.id
    loop
      if not exists (
        select 1 from route_sessions
        where route_id = r.id
          and guard_id = g.guard_id
          and (scheduled_at at time zone 'America/Bogota')::date = v_today
      ) then
        insert into route_sessions (
          company_id, route_id, service_id, guard_id, client_session_id,
          scheduled_at, status, expected_points
        ) values (
          r.company_id, r.id, r.service_id, g.guard_id, gen_random_uuid(),
          (v_today + r.scheduled_time) at time zone 'America/Bogota',
          'scheduled', v_expected
        );
        v_created := v_created + 1;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$function$;

revoke execute on function public.generate_daily_route_sessions() from public;
revoke execute on function public.generate_daily_route_sessions() from anon;
revoke execute on function public.generate_daily_route_sessions() from authenticated;

-- ---------------------------------------------------------------------------
-- 1d. Programar con pg_cron: 00:05 hora de Bogotá = 05:05 UTC, todos los días
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'generate-daily-route-sessions',
  '5 5 * * *',
  $$select public.generate_daily_route_sessions();$$
);

-- ---------------------------------------------------------------------------
-- 1e. Ejecutar una vez ahora mismo: la ronda de hoy debe quedar lista ya,
-- sin esperar al cron de la madrugada siguiente.
-- ---------------------------------------------------------------------------
select public.generate_daily_route_sessions();
