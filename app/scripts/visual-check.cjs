/**
 * Verificación visual de las pantallas de administración.
 *
 * Por qué existe: el navegador headless de este entorno no tiene salida a
 * internet, así que no puede hablar con Supabase. En vez de renunciar a
 * revisar el diseño, se interceptan las llamadas a la API y se devuelven
 * datos con la MISMA forma que devuelve PostgREST. Eso valida maquetación,
 * responsive, generación de QR y estados vacíos.
 *
 * Lo que esto NO valida: que las consultas reales devuelvan lo esperado.
 * Eso se comprueba contra la base de datos de verdad, por separado.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/visual-check.cjs
 */

const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const BASE = process.env.QA_BASE || 'http://localhost:4173'
const REF = 'vgmyryxelsayscxbjjoh'
const OUT = process.env.OUT_DIR || '/tmp'

const COMPANY = '1e811eea-834b-422b-a33f-15ea0808d5c0'
const USER = '4c057b75-ce32-4bdc-9a79-4d0169deaaad'

const PROFILE = {
  id: USER,
  company_id: COMPANY,
  role: 'admin',
  full_name: 'Administración Condor Security',
  phone: null,
  document_id: null,
  photo_url: null,
  is_active: true,
  last_seen_at: null,
  created_at: '2026-09-01T14:04:29Z',
  updated_at: '2026-09-01T14:04:29Z',
}

const NOMBRES = [
  'Comidas rápidas birey', 'Tienda rancho David', 'Nilson', 'Casa escaleras',
  'Don Fernando', 'Policías', 'Subiendo don Fernando', 'Taxi',
  'Consultorio Angélica', 'Profesora Nora', 'Profesora Eulalia', 'Hija Alex',
]
const TARIFAS = [40000, 40000, 40000, 30000, 60000, 50000, 60000, 50000, 50000, 60000, 60000, 30000]

const POINTS = NOMBRES.map((name, i) => ({
  id: `p-${i + 1}`,
  name,
  sequence_order: i + 1,
  monthly_fee_cop: TARIFAS[i],
  latitude: i < 3 ? 4.1420 + i * 0.0008 : null,
  longitude: i < 3 ? -73.6266 - i * 0.0006 : null,
  services: { name: 'Los Alpes — Vereda El Cairo', clients: { name: 'Conjunto Residencial Los Alpes — Vereda El Cairo' } },
  qr_codes: [{ token: `0000000${i}-aaaa-4bbb-8ccc-00000000000${(i % 10)}`, status: 'active' }],
}))

const SCANS = POINTS.slice(0, 6).map((p, i) => ({
  id: `s-${i}`,
  route_point_id: p.id,
  scanned_at: new Date(Date.now() - (i + 1) * 11 * 60000).toISOString(),
  result: i === 4 ? 'location_mismatch' : 'ok',
  sequence_expected: p.sequence_order,
  latitude: 4.142,
  longitude: -73.6266,
  distance_to_point_meters: i === 4 ? 812 : 9 + i,
  route_points: { name: p.name },
  guards: { user_profiles: { full_name: 'Vigilante Los Alpes' } },
}))

const SESSIONS = [
  {
    id: 'rs-1', status: 'in_progress', scheduled_at: new Date(Date.now() - 55 * 60000).toISOString(),
    started_at: new Date(Date.now() - 50 * 60000).toISOString(), finished_at: null,
    expected_points: 104, completed_points: 38, compliance_pct: null,
    routes: { name: 'Ronda Los Alpes' }, services: { name: 'Los Alpes — Vereda El Cairo' },
    guards: { user_profiles: { full_name: 'Vigilante Los Alpes' } },
  },
  {
    id: 'rs-2', status: 'completed', scheduled_at: new Date(Date.now() - 26 * 3600e3).toISOString(),
    started_at: new Date(Date.now() - 26 * 3600e3).toISOString(),
    finished_at: new Date(Date.now() - 23 * 3600e3).toISOString(),
    expected_points: 104, completed_points: 104, compliance_pct: 100,
    routes: { name: 'Ronda Los Alpes' }, services: { name: 'Los Alpes — Vereda El Cairo' },
    guards: { user_profiles: { full_name: 'Vigilante Los Alpes' } },
  },
  {
    id: 'rs-3', status: 'incomplete', scheduled_at: new Date(Date.now() - 50 * 3600e3).toISOString(),
    started_at: new Date(Date.now() - 50 * 3600e3).toISOString(),
    finished_at: new Date(Date.now() - 48 * 3600e3).toISOString(),
    expected_points: 104, completed_points: 71, compliance_pct: 68.3,
    routes: { name: 'Ronda Los Alpes' }, services: { name: 'Los Alpes — Vereda El Cairo' },
    guards: { user_profiles: { full_name: 'Vigilante Los Alpes' } },
  },
]

const ALERTS = [
  { id: 'a1', company_id: COMPANY, alert_type: 'route_incomplete', severity: 'high', status: 'open',
    message: 'Ronda Los Alpes finalizada con 71 de 104 puntos (68%).', created_at: new Date(Date.now() - 3.2e6).toISOString() },
  { id: 'a2', company_id: COMPANY, alert_type: 'suspicious_location', severity: 'high', status: 'open',
    message: 'Escaneo a 812 m del punto "Don Fernando".', created_at: new Date(Date.now() - 9e5).toISOString() },
]

function json(route, body, count) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (count !== undefined) headers['Content-Range'] = `0-0/${count}`
  return route.fulfill({ status: 200, headers, body: JSON.stringify(body) })
}

async function mock(context) {
  await context.route(`**/${REF}.supabase.co/**`, async (route) => {
    const url = route.request().url()
    const isHead = route.request().method() === 'HEAD'

    if (url.includes('/auth/v1/')) return json(route, {})

    // Emparejar por la TABLA de la ruta, no por cualquier aparición del
    // nombre en la URL: un select anidado como guards(user_profiles(...))
    // incluye "user_profiles" en la consulta de checkpoint_scans y hacía
    // que el simulador devolviera el perfil en lugar de los escaneos.
    const table = (url.match(/\/rest\/v1\/([a-z_]+)/) || [])[1]

    switch (table) {
      case 'user_profiles':
        return json(route, PROFILE)
      case 'route_points':
        return isHead ? json(route, [], POINTS.length) : json(route, POINTS, POINTS.length)
      case 'checkpoint_scans':
        return isHead ? json(route, [], SCANS.length) : json(route, SCANS, SCANS.length)
      case 'route_sessions': {
        const soloEnCurso = url.includes('status=eq.in_progress')
        const rows = soloEnCurso ? SESSIONS.filter((s) => s.status === 'in_progress') : SESSIONS
        return json(route, rows, rows.length)
      }
      case 'alerts':
        return isHead ? json(route, [], ALERTS.length) : json(route, ALERTS, ALERTS.length)
      case 'incidents':
        return json(route, [], 3)
      case 'clients':
        return json(route, [{ id: 'c1', company_id: COMPANY,
          name: 'Conjunto Residencial Los Alpes — Vereda El Cairo',
          contact_name: null, contact_phone: null, is_active: true }], 1)
      case 'services':
        return json(route, [{ id: 'sv1', client_id: 'c1', name: 'Los Alpes — Vereda El Cairo' }], 1)
      default:
        return json(route, [], 0)
    }
  })
}

async function seedSession(page) {
  await page.addInitScript(
    ({ ref, user }) => {
      const session = {
        access_token: 'fake', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake',
        user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'admin@condorsecurity.co',
          app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' },
      }
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session))
    },
    { ref: REF, user: USER },
  )
}

;(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  })

  const shots = [
    { name: 'panel', url: '/admin', w: 1440, h: 950 },
    { name: 'puntos', url: '/admin/puntos', w: 1440, h: 1000 },
    { name: 'clientes', url: '/admin/clientes', w: 1440, h: 800 },
    { name: 'rondas', url: '/admin/rondas', w: 1440, h: 800 },
    { name: 'movil-panel', url: '/admin', w: 390, h: 844 },
    { name: 'movil-puntos', url: '/admin/puntos', w: 390, h: 844 },
  ]

  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } })
    await mock(ctx)
    const page = await ctx.newPage()
    await seedSession(page)
    await page.goto(BASE + s.url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    const qrs = await page.locator('img[alt^="Código QR"]').count()
    const file = path.join(OUT, `cg-${s.name}.png`)
    await page.screenshot({ path: file })
    console.log(
      `${s.name.padEnd(14)} ${String(s.w).padStart(4)}px  desborde:${overflow}px  QR:${qrs}  → ${file}`,
    )
    await ctx.close()
  }

  await browser.close()
})()
