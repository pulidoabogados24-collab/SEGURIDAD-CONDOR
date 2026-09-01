-- ============================================================================
-- 0016_qa_second_tenant_for_isolation_test.sql
-- APLICADA PERO SIN EFECTO REAL — mantenida tal cual por integridad del
-- historial de migraciones (así quedó registrada en
-- supabase_migrations.schema_migrations en el proyecto real).
--
-- Bug: el bloque envolvía todo en "exception when others" para tolerar un
-- posible conflicto, pero el INSERT en services falló porque client_id es
-- NOT NULL y todavía no existía un cliente para la Empresa B. Postgres
-- deshace TODO el bloque "do $$ ... $$" hasta el punto de la excepción
-- capturada (compañía, suscripción y usuario incluidos), pero como la
-- excepción fue atrapada, la migración se reportó como exitosa. Resultado:
-- ninguna fila quedó creada, pero el número de versión sí quedó marcado
-- como aplicado.
--
-- Corregido en la migración 0017 (qa_second_tenant_for_isolation_test_fixed),
-- que crea primero el cliente y no atrapa excepciones a ciegas — un fallo
-- real en una migración debe propagarse, nunca esconderse en silencio.
-- Ver esa migración para la versión que realmente creó la Empresa B.
-- ============================================================================
do $$
declare
  v_company_b_id uuid := gen_random_uuid();
  v_admin_b_id uuid := gen_random_uuid();
  v_plan_id uuid;
  v_hashed_pw text := crypt('Demo2026!', gen_salt('bf'));
  v_service_b_id uuid := gen_random_uuid();
begin
  select id into v_plan_id from plans where code = 'basico';

  insert into companies (id, name, legal_name, nit, contact_email, contact_phone, city, is_demo)
  values (v_company_b_id, 'Vigilancia Test QA B', 'Vigilancia Test QA B S.A.S.', '900999999-1',
          'contacto@qatenantb.demo', '3009999999', 'Medellín', true);

  insert into subscriptions (company_id, plan_id, status)
  values (v_company_b_id, v_plan_id, 'active');

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, email_change_confirm_status
  ) values (
    v_admin_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@qatenantb.demo', v_hashed_pw, now(),
    jsonb_build_object('provisioned_role','admin','provisioned_company_id', v_company_b_id::text, 'full_name','Admin QA Tenant B'),
    '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0
  );

  insert into services (id, company_id, client_id, name, address, city)
  values (v_service_b_id, v_company_b_id,
    (select id from clients where company_id = v_company_b_id limit 1),
    'Servicio Secreto Tenant B', 'Calle Oculta 123', 'Medellín')
  on conflict do nothing;
exception when others then
  raise notice 'Ajustando: creando cliente para tenant B antes del servicio';
end $$;
