/**
 * Prueba de humo: ¿la pantalla de login se pinta sin ninguna variable de
 * entorno configurada?
 *
 * Es la regresión concreta que se estaba corrigiendo: cuando `createClient`
 * recibía undefined lanzaba "supabaseUrl is required" durante la carga del
 * módulo, React nunca montaba y el usuario veía una pantalla negra sin
 * ninguna explicación.
 *
 *   npm run build && npx vite preview --port 4181 &
 *   node scripts/smoke-login.cjs
 */

const { createRequire } = require('node:module')
const req = createRequire(__filename)
const { chromium } = req(process.env.PLAYWRIGHT_PATH || 'playwright')

const BASE = process.env.QA_BASE || 'http://localhost:4181'

;(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  })
  const page = await (await browser.newContext()).newPage()

  const fatales = []
  page.on('pageerror', (e) => fatales.push(String(e).slice(0, 140)))

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const texto = (await page.evaluate(() => document.body.innerText))
    .replace(/\n+/g, ' | ')
    .slice(0, 160)
  const campos = await page.locator('input').count()

  console.log('  texto visible :', texto || '(VACÍO — pantalla negra)')
  console.log('  campos de login:', campos)
  console.log('  errores fatales:', fatales.length ? fatales : 'ninguno')

  await browser.close()

  const ok = campos >= 2 && fatales.length === 0
  console.log(ok ? '\n  ✓ la pantalla de login carga sin configuración' : '\n  ✗ sigue rota')
  process.exit(ok ? 0 : 1)
})()
