-- ============================================================================
-- 0006_rls_policies.sql
-- Políticas RLS. Regla general:
--   - super_admin: acceso total (panel SaaS)
--   - admin/supervisor: acceso completo dentro de su company_id
--   - guard: acceso limitado a sus propios registros y a los de su empresa
--            en lectura de lo estrictamente necesario para operar
--   - client: solo lectura de sus propios servicios/reportes
-- Nunca hay una política que permita cruzar company_id.
-- ============================================================================

alter table plans enable row level security;
alter table companies enable row level security;
alter table subscriptions enable row level security;
alter table user_profiles enable row level security;
alter table clients enable row level security;
alter table client_users enable row level security;
alter table services enable row level security;
alter table posts enable row level security;
alter table guards enable row level security;
alter table supervisor_services enable row level security;
alter table shifts enable row level security;
alter table routes enable row level security;
alter table route_guards enable row level security;
alter table route_points enable row level security;
alter table qr_codes enable row level security;
alter table route_sessions enable row level security;
alter table checkpoint_scans enable row level security;
alter table incidents enable row level security;
alter table evidence enable row level security;
alter table daily_logs enable row level security;
alter table alerts enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table usage_daily enable row level security;

-- ---------------------------------------------------------------------------
-- PLANS: público de solo lectura (para pantalla de precios/upgrade);
-- escritura solo super_admin.
-- ---------------------------------------------------------------------------
create policy plans_select_all on plans for select using (true);
create policy plans_write_super_admin on plans for all using (is_super_admin()) with check (is_super_admin());

-- ---------------------------------------------------------------------------
-- COMPANIES
-- ---------------------------------------------------------------------------
create policy companies_select_own on companies for select
  using (is_super_admin() or id = current_company_id());
create policy companies_update_own_admin on companies for update
  using (is_super_admin() or (id = current_company_id() and is_company_admin()))
  with check (is_super_admin() or (id = current_company_id() and is_company_admin()));
create policy companies_insert_super_admin on companies for insert
  with check (is_super_admin());
create policy companies_delete_super_admin on companies for delete
  using (is_super_admin());

-- ---------------------------------------------------------------------------
-- SUBSCRIPTIONS: visible al admin de su empresa (solo lectura); gestión solo super_admin
-- ---------------------------------------------------------------------------
create policy subscriptions_select on subscriptions for select
  using (is_super_admin() or company_id = current_company_id());
create policy subscriptions_write_super_admin on subscriptions for all
  using (is_super_admin()) with check (is_super_admin());

-- ---------------------------------------------------------------------------
-- USER_PROFILES: el usuario ve su propio perfil; admin/supervisor ven los de
-- su empresa; super_admin ve todos. Nadie puede cambiar su propio rol o
-- company_id (eso solo lo hace un admin/super_admin vía política de update).
-- ---------------------------------------------------------------------------
create policy user_profiles_select on user_profiles for select
  using (
    is_super_admin()
    or id = auth.uid()
    or company_id = current_company_id()
  );

create policy user_profiles_insert on user_profiles for insert
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor() and role in ('guard','supervisor'))
  );

create policy user_profiles_update_self_limited on user_profiles for update
  using (id = auth.uid() or is_super_admin() or (company_id = current_company_id() and is_company_admin()))
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_company_admin())
    or (id = auth.uid()) -- el trigger de más abajo evita que se auto-cambie el rol/empresa
  );

create policy user_profiles_delete on user_profiles for delete
  using (is_super_admin() or (company_id = current_company_id() and is_company_admin()));

-- Un usuario normal no puede cambiar su propio rol ni su empresa, aunque la
-- política de UPDATE se lo permita a nivel de fila (solo lo bloquea si NO es admin).
create or replace function prevent_self_privilege_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not is_super_admin() and not is_company_admin() then
    if new.role <> old.role or new.company_id is distinct from old.company_id then
      raise exception 'No puedes cambiar tu propio rol o empresa.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_privilege_escalation
  before update on user_profiles
  for each row execute function prevent_self_privilege_escalation();

-- ---------------------------------------------------------------------------
-- CLIENTS
-- ---------------------------------------------------------------------------
create policy clients_select on clients for select
  using (is_super_admin() or company_id = current_company_id() or has_client_access(id));
create policy clients_write on clients for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

create policy client_users_select on client_users for select
  using (is_super_admin() or user_id = auth.uid() or client_id in (select id from clients where company_id = current_company_id()));
create policy client_users_write on client_users for all
  using (is_super_admin() or client_id in (select id from clients where company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or client_id in (select id from clients where company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- SERVICES
-- ---------------------------------------------------------------------------
create policy services_select on services for select
  using (is_super_admin() or company_id = current_company_id() or has_client_access(client_id));
create policy services_write on services for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

create policy posts_select on posts for select
  using (is_super_admin() or company_id = current_company_id());
create policy posts_write on posts for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- GUARDS / SUPERVISOR_SERVICES
-- ---------------------------------------------------------------------------
create policy guards_select on guards for select
  using (is_super_admin() or company_id = current_company_id());
create policy guards_write on guards for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

create policy supervisor_services_select on supervisor_services for select
  using (is_super_admin() or company_id = current_company_id());
create policy supervisor_services_write on supervisor_services for all
  using (is_super_admin() or (company_id = current_company_id() and is_company_admin()))
  with check (is_super_admin() or (company_id = current_company_id() and is_company_admin()));

-- ---------------------------------------------------------------------------
-- SHIFTS: guard ve/gestiona los suyos; admin/supervisor ven todos de su empresa
-- ---------------------------------------------------------------------------
create policy shifts_select on shifts for select
  using (is_super_admin() or company_id = current_company_id());
create policy shifts_write_admin on shifts for insert
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));
create policy shifts_update on shifts for update
  using (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (guard_id = auth.uid() and company_id = current_company_id()) -- el guardia puede marcar check-in/out
  )
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (guard_id = auth.uid() and company_id = current_company_id())
  );
create policy shifts_delete on shifts for delete
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- ROUTES / ROUTE_GUARDS / ROUTE_POINTS
-- ---------------------------------------------------------------------------
create policy routes_select on routes for select
  using (is_super_admin() or company_id = current_company_id());
create policy routes_write on routes for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

create policy route_guards_select on route_guards for select
  using (is_super_admin() or company_id = current_company_id());
create policy route_guards_write on route_guards for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

create policy route_points_select on route_points for select
  using (is_super_admin() or company_id = current_company_id());
create policy route_points_write on route_points for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- QR_CODES: el vigilante puede LEER (para validar un escaneo) pero nunca
-- crear/invalidar/regenerar códigos — eso es exclusivo de admin/supervisor.
-- ---------------------------------------------------------------------------
create policy qr_codes_select on qr_codes for select
  using (is_super_admin() or company_id = current_company_id());
create policy qr_codes_write on qr_codes for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- ROUTE_SESSIONS: el guardia gestiona las suyas; admin/supervisor ven todas
-- ---------------------------------------------------------------------------
create policy route_sessions_select on route_sessions for select
  using (is_super_admin() or company_id = current_company_id());
create policy route_sessions_insert on route_sessions for insert
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (company_id = current_company_id() and guard_id = auth.uid())
  );
create policy route_sessions_update on route_sessions for update
  using (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (company_id = current_company_id() and guard_id = auth.uid())
  )
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (company_id = current_company_id() and guard_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- CHECKPOINT_SCANS: el guardia solo inserta los suyos (nunca actualiza ni
-- borra un registro histórico -> trazabilidad). Admin/supervisor solo lectura.
-- ---------------------------------------------------------------------------
create policy checkpoint_scans_select on checkpoint_scans for select
  using (is_super_admin() or company_id = current_company_id());
create policy checkpoint_scans_insert on checkpoint_scans for insert
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (company_id = current_company_id() and guard_id = auth.uid())
  );
-- Sin política de UPDATE/DELETE para nadie excepto super_admin (integridad histórica)
create policy checkpoint_scans_no_update on checkpoint_scans for update using (is_super_admin());
create policy checkpoint_scans_no_delete on checkpoint_scans for delete using (is_super_admin());

-- ---------------------------------------------------------------------------
-- INCIDENTS
-- ---------------------------------------------------------------------------
create policy incidents_select on incidents for select
  using (is_super_admin() or company_id = current_company_id());
create policy incidents_insert on incidents for insert
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (company_id = current_company_id() and guard_id = auth.uid())
  );
create policy incidents_update on incidents for update
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- EVIDENCE: append-only. Nadie actualiza o borra salvo super_admin.
-- ---------------------------------------------------------------------------
create policy evidence_select on evidence for select
  using (is_super_admin() or company_id = current_company_id());
create policy evidence_insert on evidence for insert
  with check (company_id = current_company_id() or is_super_admin());
create policy evidence_no_update on evidence for update using (is_super_admin());
create policy evidence_no_delete on evidence for delete using (is_super_admin());

-- ---------------------------------------------------------------------------
-- DAILY_LOGS (minuta digital)
-- ---------------------------------------------------------------------------
create policy daily_logs_select on daily_logs for select
  using (is_super_admin() or company_id = current_company_id());
create policy daily_logs_insert on daily_logs for insert
  with check (
    is_super_admin()
    or (company_id = current_company_id() and is_admin_or_supervisor())
    or (company_id = current_company_id() and guard_id = auth.uid())
  );
create policy daily_logs_no_update on daily_logs for update using (is_super_admin());
create policy daily_logs_no_delete on daily_logs for delete using (is_super_admin());

-- ---------------------------------------------------------------------------
-- ALERTS: guard NO ve alertas (son para supervisión); admin/supervisor sí
-- ---------------------------------------------------------------------------
create policy alerts_select on alerts for select
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));
create policy alerts_write on alerts for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
create policy notifications_select on notifications for select
  using (is_super_admin() or company_id = current_company_id());
create policy notifications_write on notifications for all
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()))
  with check (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));

-- ---------------------------------------------------------------------------
-- AUDIT_LOGS: solo lectura para admin de su empresa; nadie modifica/borra
-- excepto super_admin (append-only real).
-- ---------------------------------------------------------------------------
create policy audit_logs_select on audit_logs for select
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));
create policy audit_logs_insert on audit_logs for insert
  with check (true); -- se inserta vía función SECURITY DEFINER (ver 0007), nunca directo desde frontend
create policy audit_logs_no_update on audit_logs for update using (is_super_admin());
create policy audit_logs_no_delete on audit_logs for delete using (is_super_admin());

-- ---------------------------------------------------------------------------
-- USAGE_DAILY: solo lectura para admin de su empresa y super_admin
-- ---------------------------------------------------------------------------
create policy usage_daily_select on usage_daily for select
  using (is_super_admin() or (company_id = current_company_id() and is_admin_or_supervisor()));
create policy usage_daily_write_super_admin on usage_daily for all
  using (is_super_admin()) with check (is_super_admin());
