# Seguros CRM — MVP

CRM minimalista + alertas de vencimiento por WhatsApp para PAS.

## Paso 1 — Crear proyecto en Supabase

1. Andá a https://supabase.com y creá una cuenta (o iniciá sesión) con tu email.
2. Click en "New project".
3. Elegí un nombre (ej: `seguros-crm`), una contraseña de base de datos (guardala) y la región más cercana (ej: South America).
4. Esperá ~2 minutos a que se aprovisione el proyecto.

## Paso 2 — Cargar el schema

1. En el dashboard de Supabase, andá a **SQL Editor** > **New query**.
2. Pegá el contenido de [`db/schema.sql`](db/schema.sql) completo.
3. Click en **Run**. Deberías ver las tablas `clientes`, `polizas`, `cuotas`, `interacciones`, `alertas`, `ramos`, `aseguradoras`, `productores` en **Table Editor**. Esto ya incluye la generación automática de cuotas: si cargás una póliza con `cantidad_cuotas` mayor a 1, el sistema arma solo cada cuota (mismo día del mes que la fecha de inicio de vigencia).
4. (Opcional pero recomendado) Pegá y corré también [`db/vista_alertas.sql`](db/vista_alertas.sql) — crea una vista de lectura fácil (`vista_alertas`) que junta cliente, póliza y ramo en una sola tabla, para no tener que ir saltando entre pantallas al revisar qué avisar cada día.

## Paso 3 — Obtener credenciales

1. En el dashboard, andá a **Project Settings** > **API**.
2. Copiá:
   - **Project URL** → va en `SUPABASE_URL`
   - **service_role key** (no la `anon` key, porque el script corre server-side) → va en `SUPABASE_SERVICE_ROLE_KEY`
3. Copiá `.env.example` a `.env` y pegá los valores ahí.

## Paso 4 — Instalar dependencias y probar

```bash
npm install
```

Cargá 2-3 clientes y pólizas de prueba desde **Table Editor** en Supabase (con `fecha_vencimiento` a 15/5 días desde hoy para poder probar). Ojo: `fecha_inicio_vigencia` y `fecha_vencimiento` son fecha **y hora** (Supabase te muestra un selector de fecha+hora al cargar la fila) — la convención habitual es 12:00hs. También podés correr `node scripts/seed_test_data.mjs` para cargar 3 clientes/pólizas de prueba automáticamente (**acordate de borrarlos** antes de usar el sistema con datos reales).

```bash
npm run alertas
```

Deberías ver en consola las alertas generadas, y en la tabla `alertas` de Supabase los links de WhatsApp listos para usar.

## Paso 5 — Activar seguridad (RLS) antes de publicar la landing

1. En **SQL Editor**, pegá y corré el contenido de [`db/rls_policies.sql`](db/rls_policies.sql).
2. Esto bloquea el acceso público a todos los datos, salvo la posibilidad de insertar un lead nuevo en `clientes` (lo que necesita la landing). El backend sigue usando la `service_role key`, que nunca se ve afectada por RLS.

## Paso 6 — Completar la landing (`landing/index.html`)

1. En Supabase, andá a **Project Settings → API Keys → "Legacy anon, service_role API keys"** y copiá la key `anon` `public` (esta SÍ es segura para exponer en el navegador, a diferencia de la `service_role`).
2. Abrí `landing/index.html` y reemplazá:
   - `PEGAR_ACA_LA_ANON_KEY` por esa key.
   - `549XXXXXXXXXX` por el número de WhatsApp real que recibe a los clientes (con código de país, sin `+`).
3. Probala abriendo el archivo local en el navegador, completando el formulario y confirmando que redirige a WhatsApp con el mensaje precargado, y que el lead aparece en la tabla `clientes` en Supabase.
4. Cuando esté lista, se sube a un hosting gratuito (Vercel, Netlify o GitHub Pages) para tener una URL pública.

## Paso 7 — Automatizar la corrida diaria de alertas (GitHub Actions)

El workflow ya está armado en [`.github/workflows/alertas.yml`](.github/workflows/alertas.yml): corre todos los días a las 8am (hora Argentina) sin depender de que tengas la PC prendida.

1. Creá un repositorio en GitHub (público — GitHub Pages, para publicar la landing en el Paso 8, no funciona en repos privados con el plan gratuito) y subí este proyecto (`git init`, `git add`, `git commit`, `git remote add origin ...`, `git push`). **El archivo `.env` nunca se sube** (ya está en `.gitignore`). No hay ningún dato sensible en el código: la única key que queda visible es la `anon`, diseñada para ser pública.
2. En el repo de GitHub: **Settings → Secrets and variables → Actions → New repository secret**, y cargá dos secrets con los mismos valores que tenés en tu `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Listo — se ejecuta solo todos los días. También podés dispararlo a mano desde la pestaña **Actions** del repo (botón "Run workflow").

## Paso 8 — Publicar la landing (GitHub Pages)

El workflow [`.github/workflows/deploy-landing.yml`](.github/workflows/deploy-landing.yml) publica automáticamente la carpeta `landing/` cada vez que cambia.

1. En el repo de GitHub: **Settings → Pages → Build and deployment → Source**, elegí **"GitHub Actions"**.
2. Empujá cualquier cambio en `landing/` (o disparalo a mano desde **Actions** → "Publicar landing en GitHub Pages" → **Run workflow**).
3. Tu landing queda pública en `https://TU-USUARIO.github.io/TU-REPO/`.

## Paso 9 — Panel interno (`landing/panel/`)

Mini app con login para cargar clientes y pólizas sin usar Table Editor de Supabase directamente, y revisar/enviar las alertas del día con un click. Se publica junto con la landing (mismo workflow del Paso 8), en `https://TU-USUARIO.github.io/TU-REPO/panel/`.

1. Corré [`db/rls_panel_autenticado.sql`](db/rls_panel_autenticado.sql) en el SQL Editor — habilita que un usuario logueado pueda leer/cargar datos (nadie sin login puede tocar nada de esto).
2. Creá tu usuario para entrar al panel: Supabase → **Authentication → Users → Add user → Create new user** (email + contraseña, con "Auto Confirm User" activado). No tiene que ser el mismo email con el que administrás Supabase.
3. Entrá a `/panel/` y logueate con ese usuario.

El panel no permite borrar registros (a propósito, como medida de seguridad) — eso se sigue haciendo desde Table Editor.

## Próximos pasos

- Definir las secuencias de conversación por ramo.
- Reemplazar el envío manual de links por WhatsApp Business API si el volumen lo justifica.
- Importar cartera en bloque desde Excel, backups automáticos, estados automáticos (cuota/póliza vencida).
