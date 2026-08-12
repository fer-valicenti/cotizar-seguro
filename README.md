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
3. Click en **Run**. Deberías ver las tablas `clientes`, `polizas`, `cuotas`, `interacciones`, `alertas`, `ramos`, `aseguradoras` en **Table Editor**.

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

Cargá 2-3 clientes y pólizas de prueba desde **Table Editor** en Supabase (con fechas de vencimiento a 15/5 días desde hoy para poder probar).

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

1. Creá un repositorio en GitHub (puede ser privado) y subí este proyecto (`git init`, `git add`, `git commit`, `git remote add origin ...`, `git push`). **El archivo `.env` nunca se sube** (ya está en `.gitignore`).
2. En el repo de GitHub: **Settings → Secrets and variables → Actions → New repository secret**, y cargá dos secrets con los mismos valores que tenés en tu `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Listo — se ejecuta solo todos los días. También podés dispararlo a mano desde la pestaña **Actions** del repo (botón "Run workflow").

## Próximos pasos

- Definir las secuencias de conversación por ramo.
- Reemplazar el envío manual de links por WhatsApp Business API si el volumen lo justifica.
