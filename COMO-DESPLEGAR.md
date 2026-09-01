# Cómo desplegar ControlGuard

El backend (Supabase) ya está en producción y funcionando — no requiere
ninguna acción tuya. Lo único pendiente es publicar el frontend (la app web)
en Vercel. Esto toma unos minutos.

**Nota:** se intentó automatizar este despliegue desde aquí, pero la
herramienta disponible en este entorno para desplegar directamente a Vercel
no es confiable para un proyecto de este tamaño (exige adjuntar todos los
archivos del proyecto, imágenes incluidas, en una sola operación con límite
de tamaño). Por eso se entrega este método manual, que es además el método
estándar y recomendado por Vercel — más confiable y con más control.

## Opción A — Con la CLI de Vercel (más rápido, ~2 minutos)

Requiere tener Node.js instalado en tu computador.

```bash
cd app
npm install -g vercel   # solo la primera vez
vercel login            # te pedirá tu correo, revisa tu bandeja de entrada
vercel --prod
```

Durante el proceso te preguntará:
- **Set up and deploy?** → sí (Enter)
- **Which scope?** → tu cuenta
- **Link to existing project?** → no (crea uno nuevo la primera vez)
- **Project name?** → controlguard (o el que prefieras)
- **Directory?** → `./` (ya estás dentro de `app/`)
- Vercel detecta automáticamente que es un proyecto Vite — no cambies nada más.

Cuando termine te da una URL pública (`https://controlguard-xxxx.vercel.app`).

**Después del primer despliegue**, entra a
[vercel.com](https://vercel.com) → tu proyecto → **Settings → Environment
Variables** y agrega estas dos (cópialas exactas):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://vgmyryxelsayscxbjjoh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_0aXpG7oIq_qPQFTU7XXAcA_ZqQBOSYq` |

(Estas dos claves son públicas por diseño — es normal y seguro que viajen al
navegador del usuario; la seguridad real de los datos la garantiza Row Level
Security en la base de datos, no el secreto de esta clave.)

Luego vuelve a desplegar para que tome las variables:

```bash
vercel --prod
```

## Opción B — Conectando GitHub (recomendado si vas a seguir actualizando la app)

1. Crea un repositorio nuevo y vacío en [github.com/new](https://github.com/new)
   (por ejemplo `controlguard`, puede ser privado).
2. En tu computador, dentro de la carpeta del proyecto (donde está esta
   carpeta `app/`):
   ```bash
   git remote add origin https://github.com/TU-USUARIO/controlguard.git
   git push -u origin main
   ```
   (El repositorio local con todo el historial de commits ya viene incluido
   en esta entrega — no necesitas volver a hacer `git init`.)
3. Entra a [vercel.com/new](https://vercel.com/new), conecta tu cuenta de
   GitHub y selecciona el repositorio recién creado.
4. En la pantalla de configuración del proyecto:
   - **Root Directory** → `app` (importante, el proyecto vive en esa subcarpeta)
   - **Framework Preset** → Vite (debería detectarlo solo)
   - **Environment Variables** → agrega las mismas dos de la tabla de arriba.
5. Click **Deploy**.

Con esta opción, cada vez que subas cambios a la rama `main` de GitHub,
Vercel vuelve a publicar automáticamente — no tienes que repetir el proceso.

## Verificación después de desplegar

Entra a la URL que te dio Vercel e inicia sesión con las credenciales de
demo (ver `README.md` en la raíz del proyecto, sección "Modo demo"). Deberías
ver el panel correspondiente al rol con datos reales de la empresa demo.

Si algo falla, lo más probable es que falten las dos variables de entorno de
la tabla de arriba, o que el **Root Directory** en Vercel no esté configurado
como `app`.
