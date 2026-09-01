-- ============================================================================
-- 0022_condor_security_los_alpes.sql
-- Carga la operación REAL de Condor Security: empresa propia (separada del
-- tenant de demostración), el conjunto Los Alpes de la vereda El Cairo, su
-- ronda y los 104 puntos de control entregados por el cliente, cada uno con
-- su código QR activo.
--
-- Sobre las coordenadas: se dejan en NULL a propósito. Los nombres que
-- entregó el cliente ("Casa escaleras", "Camioneta gris", "Subiendo don
-- Fernando") son referencias locales, no direcciones geocodificables.
-- Inventar coordenadas produciría un mapa verosímil y falso. En su lugar,
-- cada punto queda anclado a su coordenada real la primera vez que un
-- vigilante lo escanea, porque register_checkpoint_scan ya guarda el GPS
-- del escaneo. El mapa se construye con datos verdaderos o no se construye.
-- ============================================================================

-- Tarifa mensual por punto. Es dato de negocio real del cliente y no existía
-- en el esquema: la cartera del sector se calcula sumando esta columna.
alter table route_points
  add column if not exists monthly_fee_cop integer;

comment on column route_points.monthly_fee_cop is
  'Tarifa mensual en pesos colombianos que paga este punto por el servicio de ronda. NULL = sin tarifa definida.';

do $$
declare
  v_company_id uuid := gen_random_uuid();
  v_admin_id   uuid := gen_random_uuid();
  v_client_id  uuid := gen_random_uuid();
  v_service_id uuid := gen_random_uuid();
  v_route_id   uuid := gen_random_uuid();
  v_hashed_pw  text := crypt('Condor2026!', gen_salt('bf'));
  v_point_id   uuid;
  r            record;
begin
  -- Empresa real, aislada del tenant de demostración por RLS.
  insert into companies (id, name) values (v_company_id, 'Condor Security');

  -- Administrador de la empresa.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    email_change_confirm_status
  ) values (
    v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@condorsecurity.co', v_hashed_pw, now(),
    jsonb_build_object('provisioned_role','admin','provisioned_company_id', v_company_id::text,
                       'full_name','Administración Condor Security'),
    '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0
  );

  insert into user_profiles (id, company_id, role, full_name)
  values (v_admin_id, v_company_id, 'admin', 'Administración Condor Security');

  -- Cliente y servicio.
  insert into clients (id, company_id, name, contact_name)
  values (v_client_id, v_company_id,
          'Conjunto Residencial Los Alpes — Vereda El Cairo', null);

  insert into services (id, company_id, client_id, name, service_type, city, address)
  values (v_service_id, v_company_id, v_client_id,
          'Los Alpes — Vereda El Cairo', 'residencial', 'Villavicencio',
          'Vereda El Cairo, Villavicencio, Meta');

  -- Ronda nocturna sobre el sector.
  insert into routes (id, company_id, service_id, name, scheduled_time,
                      expected_duration_minutes, tolerance_minutes, days_of_week)
  values (v_route_id, v_company_id, v_service_id, 'Ronda Los Alpes',
          '19:00', 180, 30, array[1,2,3,4,5,6,7]);

  -- Los 104 puntos, en el orden en que los entregó el cliente.
  for r in
    select * from (values
    (1, 'Comidas rápidas birey', 40000),
    (2, 'Tienda rancho David', 40000),
    (3, 'Nilson', 40000),
    (4, 'Casa escaleras', 30000),
    (5, 'Don Fernando', 60000),
    (6, 'Policías', 50000),
    (7, 'Subiendo don Fernando', 60000),
    (8, 'Taxi', 50000),
    (9, 'Consultorio Angélica', 50000),
    (10, 'Profesora Nora', 60000),
    (11, 'Profesora Eulalia', 60000),
    (12, 'Hija Alex', 30000),
    (13, 'Taxi', 30000),
    (14, 'Camioneta gris', 50000),
    (15, 'Suegro Alex', 30000),
    (16, 'Don Alex', 30000),
    (17, 'Luis Trujillo', 30000),
    (18, 'Casa Valentina', 50000),
    (19, 'Mama alcalde', 50000),
    (20, 'Maíz de arroz', 50000),
    (21, 'Osvaldo', 50000),
    (22, 'Teniente', 50000),
    (23, 'Droguería', 40000),
    (24, 'Cancha de tejo', 80000),
    (25, 'Félix', 40000),
    (26, 'Tienda', 80000),
    (27, 'Asadero', 50000),
    (28, 'Panaderia', 20000),
    (29, 'Peluches', 20000),
    (30, 'Peluquería', 50000),
    (31, 'Orlando Páez', 50000),
    (32, 'Llano químicos', 60000),
    (33, 'Casa blanca', 40000),
    (34, 'Bar monaliza', 30000),
    (35, 'Juan lujos', 50000),
    (36, 'Espa', 50000),
    (37, 'Asadero', 60000),
    (38, 'Rancho burguer', 50000),
    (39, 'Deditos de queso', 50000),
    (40, 'Asadero kikiki', 60000),
    (41, 'Carnicería', 50000),
    (42, 'Efecty', 60000),
    (43, 'Surtido', 60000),
    (44, 'Droguería', 40000),
    (45, 'Lujos David', 60000),
    (46, 'Fluer esmeralda', 60000),
    (47, 'Regata pizzería', 100000),
    (48, 'Cede sukurami', 80000),
    (49, 'Surtido MG', 100000),
    (50, 'Casa doña Blanca', 50000),
    (51, 'Ingeniero', 50000),
    (52, 'Aceites', 60000),
    (53, 'Doña Brenda', 60000),
    (54, 'Casa esquinera', 70000),
    (55, 'Txl', 50000),
    (56, 'Npr', 50000),
    (57, 'Julio', 50000),
    (58, 'Patricia', 60000),
    (59, 'Carro rojo', 50000),
    (60, 'Cheff', 30000),
    (61, 'Carro blanco', 30000),
    (62, 'Casa esquinera', 50000),
    (63, 'Casa carros', 50000),
    (64, 'Minoconjuntos San Felipe', 150000),
    (65, 'Camioneta blanca', 40000),
    (66, 'Rosario', 20000),
    (67, 'Gladis', 30000),
    (68, 'Edid', 30000),
    (69, 'Casa Giovana', 50000),
    (70, 'Hotel Niza', 70000),
    (71, 'Sergio', 50000),
    (72, 'Yasmin', 45000),
    (73, 'Julieta', 30000),
    (74, 'Cancha baqueros', 50000),
    (75, 'Patricia', 30000),
    (76, 'Margarita', 40000),
    (77, 'Rocio', 60000),
    (78, 'Rómulo tienda', 50000),
    (79, 'Eduim casa', 50000),
    (80, 'Restaurante suchi', 50000),
    (81, 'Campiña', 50000),
    (82, 'Ardilla Libardo', 50000),
    (83, 'Comidas rápidas', 50000),
    (84, 'Peluches chapinero', 50000),
    (85, 'Lucero', 45000),
    (86, 'Mc', 50000),
    (87, 'Ingenierosss', 50000),
    (88, 'Ingeniero', 50000),
    (89, 'Espa alcaceres', 50000),
    (90, 'Consultorio', 50000),
    (91, 'Pedro Gómez', 50000),
    (92, 'Lotería del meta', 100000),
    (93, 'Anita', 50000),
    (94, 'Casa negra', 50000),
    (95, 'Droguería Yanet', 60000),
    (96, 'Camioneta', 20000),
    (97, 'Mama Calvo', 40000),
    (98, 'Cristian', 50000),
    (99, 'Al lado Cristian', 60000),
    (100, 'Casa César', 60000),
    (101, 'Casa blanca', 50000),
    (102, 'Sargento casa', 50000),
    (103, 'Karol carro', 50000),
    (104, 'Estudios', 50000)
    ) as t(orden, nombre, tarifa)
  loop
    v_point_id := gen_random_uuid();

    insert into route_points (id, company_id, route_id, service_id, name,
                              sequence_order, monthly_fee_cop)
    values (v_point_id, v_company_id, v_route_id, v_service_id,
            r.nombre, r.orden, r.tarifa);

    insert into qr_codes (company_id, route_point_id, token, status)
    values (v_company_id, v_point_id, gen_random_uuid(), 'active');
  end loop;
end $$;
