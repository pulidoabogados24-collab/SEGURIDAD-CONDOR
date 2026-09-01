-- ============================================================================
-- 0016_qa_second_tenant_for_isolation_test.sql
-- Crea una SEGUNDA empresa mínima ("Empresa B") exclusivamente para poder
-- ejecutar el caso de QA obligatorio de aislamiento multi-tenant: verificar
-- que un usuario de la Empresa A jamás puede leer datos de la Empresa B
-- (ni al revés) a través de las políticas RLS reales, no solo por filtrado
-- de frontend. No es parte del seed de demo funcional (ese sigue siendo
-- "Seguridad Integral Demo"); es un tenant de control para el test.
--
-- NOTA: el primer intento de esta migración (versión anterior, ya
-- descartada) envolvía todo en un bloque con "exception when others" que
-- silenciosamente atrapó un error real (client_id de services es NOT NULL
-- y no existía un cliente todavía) y provocó un rollback completo del
-- bloque sin que la empresa ni el usuario quedaran creados. Corregido aquí
-- creando primero el cliente y sin capturar excepciones a ciegas: un fallo
-- real en una migración debe propagarse, nunca esconderse.
-- ============================================================================
do $$
declare
  v_company_b_id uuid := gen_random_uuid();
  v_admin_b_id uuid := gen_random_uuid();
  v_client_b_id uuid := gen_random_uuid();
  v_plan_id uuid;
  v_hashed_pw text := crypt('Demo2026!', gen_salt('bf'));
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

  insert into clients (id, company_id, name, contact_name, contact_email, contact_phone)
  values (v_client_b_id, v_company_b_id, 'Cliente Confidencial Tenant B', 'N/A', 'cliente@qatenantb.demo', '3000000000');

  insert into services (id, company_id, client_id, name, service_type, address, city)
  values (gen_random_uuid(), v_company_b_id, v_client_b_id, 'Servicio Secreto Tenant B', 'vigilancia_fija', 'Calle Oculta 123', 'Medellín');
end $$;
