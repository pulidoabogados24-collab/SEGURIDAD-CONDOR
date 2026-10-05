/**
 * Verificación visual de las pantallas de gestión (puntos, vigilantes,
 * usuarios, mapa en vivo) con la API simulada. Valida maquetación, modales,
 * desborde horizontal y errores de consola; NO valida consultas reales.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node scripts/visual-check-gestion.cjs
 */
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const BASE = process.env.QA_BASE || 'http://localhost:4173'
const REF = 'vgmyryxelsayscxbjjoh'
const OUT = process.env.OUT_DIR || '/tmp'
const COMPANY = '1e811eea-834b-422b-a33f-15ea0808d5c0'
const USER = '4c057b75-ce32-4bdc-9a79-4d0169deaaad'

const PROFILE = { id: USER, company_id: COMPANY, role: 'admin', full_name: 'Administración Condor', phone: null, document_id: null, photo_url: null, is_active: true, last_seen_at: null, created_at: '2026-09-01T14:04:29Z', updated_at: '2026-09-01T14:04:29Z' }
const NOMBRES = ['Comidas rápidas birey', 'Tienda rancho David', 'Nilson', 'Casa escaleras', 'Don Fernando', 'Taxi']
const POINTS = NOMBRES.map((name, i) => ({
  id: `p-${i + 1}`, name, route_id: 'r1', sequence_order: i + 1, monthly_fee_cop: 40000, is_active: i !== 5,
  latitude: i < 4 ? 4.142 + i * 0.0008 : null, longitude: i < 4 ? -73.6266 - i * 0.0006 : null,
  services: { name: name, clients: { name } },
  qr_codes: [{ token: `0000000${i}-aaaa-4bbb-8ccc-00000000000${i}`, status: i === 5 ? 'invalidated' : 'active' }],
}))
const GUARDS = [
  { id: 'g1', badge_code: 'V-01', is_active: true, default_service_id: null, user_profiles: { full_name: 'Vigilante Los Alpes', phone: '3001234567', document_id: '1100' } },
  { id: 'g2', badge_code: null, is_active: false, default_service_id: null, user_profiles: { full_name: 'Guarda Antiguo', phone: null, document_id: null } },
]
const SUPERS = [
  { ...PROFILE, id: 's1', role: 'supervisor', full_name: 'Supervisor Uno', phone: '3010000000' },
  PROFILE,
]
const SESSION = { id: 'rs-1', status: 'in_progress', started_at: new Date(Date.now() - 50 * 60000).toISOString(), expected_points: 12, completed_points: 4, routes: { name: 'Ronda CONDOR' }, guards: { id: 'g1', user_profiles: { full_name: 'Vigilante Los Alpes' } } }
const LOCS = Array.from({ length: 12 }, (_, i) => ({ route_session_id: 'rs-1', latitude: 4.142 + i * 0.0002, longitude: -73.6266 - i * 0.0001, accuracy_meters: 12, recorded_at: new Date(Date.now() - (12 - i) * 15000).toISOString() }))

function json(route, body, count) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  if (count !== undefined) headers['Content-Range'] = `0-0/${count}`
  return route.fulfill({ status: 200, headers, body: JSON.stringify(body) })
}

async function mock(context) {
  await context.route(`**/${REF}.supabase.co/**`, async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/v1/')) return json(route, {})
    const table = (url.match(/\/rest\/v1\/([a-z_]+)/) || [])[1]
    const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object')
    switch (table) {
      case 'user_profiles':
        if (single) return json(route, PROFILE)
        return json(route, SUPERS, SUPERS.length)
      case 'route_points': return json(route, POINTS.filter((p) => !url.includes('is_active=eq.true') || p.is_active), POINTS.length)
      case 'routes': return json(route, [{ id: 'r1', name: 'Ronda CONDOR' }], 1)
      case 'guards': return json(route, GUARDS, GUARDS.length)
      case 'route_guards': return json(route, [{ route_id: 'r1', guard_id: 'g1' }], 1)
      case 'services': return json(route, [{ id: 'sv1', name: 'Servicio Condor' }], 1)
      case 'supervisor_services': return json(route, [], 0)
      case 'route_sessions': return json(route, [SESSION], 1)
      case 'guard_locations': return json(route, LOCS, LOCS.length)
      case 'checkpoint_scans': return json(route, [{ route_point_id: 'p-1', scanned_at: new Date().toISOString(), guards: null }], 1)
      default: return json(route, [], 0)
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
  const shots = [
    { name: 'puntos', url: '/admin/puntos', w: 1440, h: 1000, click: 'Añadir punto' },
    { name: 'puntos-movil', url: '/admin/puntos', w: 390, h: 844, click: 'Añadir punto' },
    { name: 'vigilantes', url: '/admin/vigilantes', w: 1440, h: 800, click: 'Editar' },
    { name: 'vigilantes-movil', url: '/admin/vigilantes', w: 390, h: 844 },
    { name: 'usuarios', url: '/admin/usuarios', w: 1440, h: 800, click: 'Nuevo supervisor' },
    { name: 'mapa', url: '/admin/mapa', w: 1440, h: 900 },
    { name: 'mapa-movil', url: '/admin/mapa', w: 390, h: 844 },
  ]
  let problems = 0
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } })
    await mock(ctx)
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|tile\.openstreetmap|net::ERR/i.test(m.text())) errors.push(m.text()) })
    await page.addInitScript(({ ref, user }) => {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'fake', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake', user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'a@b.co', app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' } }))
    }, { ref: REF, user: USER })
    await page.goto(BASE + s.url, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    if (s.click) {
      const btn = page.getByRole('button', { name: s.click }).first()
      if (await btn.count()) { await btn.click(); await page.waitForTimeout(500) }
      else { errors.push(`botón «${s.click}» no encontrado`) }
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    const file = path.join(OUT, `cg2-${s.name}.png`)
    await page.screenshot({ path: file })
    if (overflow > 0 || errors.length) problems++
    console.log(`${s.name.padEnd(18)} ${s.w}px desborde:${overflow}px errores:${errors.length} → ${file}`)
    errors.forEach((e) => console.log('   !', e.slice(0, 200)))
    await ctx.close()
  }
  await browser.close()
  process.exit(problems ? 1 : 0)
})()
