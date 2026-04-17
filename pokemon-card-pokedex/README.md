# Pokedex TCG — PokemonScan

Aplicación web que escanea cartas Pokémon, detecta su **nombre, expansión y tipo**, busca la carta en la API de **Pokemon Price Tracker** y la guarda en el **inventario** del usuario junto con su **valor de mercado actual**. El valor se refresca automáticamente con el tiempo.

- Framework: **Next.js 15 (App Router)** + **React 19** + **Tailwind CSS**
- Autenticación y base de datos: **Supabase** (Auth + Postgres + RLS)
- OCR: **Tesseract.js** (se ejecuta en el navegador)
- Precios: **Pokemon Price Tracker API**
- Hosting: **Vercel** (incluye Cron Job diario para refrescar precios)

## Flujo de la app

1. El usuario abre `/scanner`, apunta la carta con la cámara (o sube una imagen).
2. Tesseract.js lee el texto de la carta en el navegador.
3. El servidor (`/api/scan`) detecta nombre, número, expansión, tipo y hints de variante.
4. `/api/match` consulta **Pokemon Price Tracker** y devuelve candidatos con imagen y precio.
5. El usuario confirma la variante correcta y la guarda en `/api/inventory`.
6. `/inventory` y `/dashboard` muestran el inventario y el valor total, leyendo de Supabase.
7. El Cron Job (o el botón "Refrescar precios") llama a `/api/prices/refresh` para actualizar valores.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
POKEMON_PRICE_TRACKER_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=          # opcional: exige Authorization: Bearer <valor> al cron
```

## Desarrollo local

```bash
npm install
npm run dev
```

## Supabase

1. Crea un proyecto en Supabase.
2. En el SQL Editor ejecuta, **en orden**:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_policies.sql`
   - `supabase/migrations/003_indexes.sql`
   - `supabase/migrations/004_card_enrichment.sql`
   - `supabase/migrations/005_rarity_stats.sql`
3. Authentication → **Providers** → habilita **Email** (con o sin confirmación).
4. Authentication → **URL Configuration**:
   - **Site URL**: `http://localhost:3000` para desarrollo, o tu URL de Vercel en producción.
   - **Redirect URLs**: añade `http://localhost:3000/auth/callback` y `https://tu-dominio.vercel.app/auth/callback`.
5. Copia `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` a tu `.env.local`.

### Habilitar Google OAuth

1. En Google Cloud Console (<https://console.cloud.google.com>) crea un proyecto, ve a **APIs & Services → Credentials → Create Credentials → OAuth client ID**, tipo **Web application**.
2. En **Authorized redirect URIs** pega la URL que Supabase te muestra en el siguiente paso (tiene forma `https://<proyecto>.supabase.co/auth/v1/callback`).
3. Copia el **Client ID** y **Client Secret**.
4. En Supabase: Authentication → **Providers → Google**. Activa el proveedor y pega el Client ID y Secret.
5. En la misma pantalla confirma que la redirect URL de Supabase coincide con la que pusiste en Google Cloud.
6. Listo: el botón **Continuar con Google** en `/login` y `/register` ya funciona. Cada cuenta de Google queda como un usuario distinto en Supabase con su propio inventario.

La RLS (fila por usuario) ya está configurada en `002_policies.sql`, así que cada usuario —sea con email o con Google— sólo puede ver, modificar y borrar sus propias cartas.

## Pokémon TCG API (recomendada como principal)

La identificación de cartas usa primero <https://pokemontcg.io/>. La API es
gratuita y sin key funciona con rate limit bajo. Para producción regístrate
en el sitio y copia tu key a `POKEMON_TCG_API_KEY`.

## Pokemon Price Tracker (fallback)

Obtén un token desde <https://www.pokemonpricetracker.com/> y colócalo en
`POKEMON_PRICE_TRACKER_API_KEY`. Se usa si la Pokémon TCG API no encuentra la
carta.

## Despliegue en Vercel

1. Conecta el repositorio de GitHub a Vercel.
2. Agrega las variables de entorno en **Project → Settings → Environment Variables**.
3. Vercel detecta `vercel.json` y crea el **Cron Job** que refresca precios a diario (06:00 UTC).

## Despliegue dockerizado (Docker Compose)

El repo incluye una stack completa en `docker-compose.yml` que cumple el
requisito de "al menos Base de Datos dockerizada" y, opcionalmente, corre
también la app Next.js en contenedor.

### Sólo base de datos (recomendado para `npm run dev` local)

```bash
docker compose up -d        # levanta db (5433) + pgAdmin (5050)
docker compose logs -f db   # verifica que las migraciones se aplicaron
docker compose down         # para; añade -v para borrar el volumen
```

- Postgres queda expuesto en `localhost:5433`, usuario `pokescan`, password
  `pokescan_dev`, base `pokemoncardpokedex`.
- Las migraciones de `supabase/migrations/*.sql` se aplican automáticamente
  en el primer arranque (se montan como volumen de sólo lectura y las ejecuta
  `docker/db/init/100_run_migrations.sh`).
- Antes de las migraciones se aplica `docker/db/init/000_auth_stub.sql`, que
  crea un esquema `auth` mínimo para que las policies y FKs de Supabase
  (ej. `auth.users`, `auth.uid()`) resuelvan sobre Postgres plano.
- pgAdmin en <http://localhost:5050> (server mode off; conecta con host `db`,
  puerto `5432`, usuario `pokescan`, password `pokescan_dev`).

### Stack completa (BD + app Next.js)

```bash
docker compose --profile fullstack up --build
```

Construye la imagen multi-stage definida en `Dockerfile` (aprovecha
`output: "standalone"` de Next 15 para que la imagen final pese poco) y
expone la app en `http://localhost:3000`. Carga `.env.local` vía `env_file`,
así que no hace falta duplicar variables.

### Resetear datos

```bash
docker compose down -v && docker compose up -d
```

El volumen `pokescan_pgdata` se borra y Postgres vuelve a correr todas las
migraciones desde cero.

## Endpoints de la API

| Ruta | Método | Descripción |
| ---- | ------ | ----------- |
| `/api/scan` | POST | Recibe `text` (OCR del cliente) y devuelve `detectedName`, `detectedNumber`, `detectedSet`, `detectedType`, `detectedVariantHints`. |
| `/api/match` | POST | Busca variantes en Pokemon Price Tracker y las ordena por confianza. |
| `/api/inventory` | GET | Devuelve el inventario del usuario autenticado. |
| `/api/inventory` | POST | Guarda una carta en el inventario y registra un `price_snapshot`. |
| `/api/inventory/[id]` | DELETE | Elimina una carta del inventario. |
| `/api/valuation` | GET | Devuelve el resumen (entradas, totales, promedio). |
| `/api/stats` | GET | Estadísticas del inventario: totales, tipo/rareza/condición/set predominante, top 5. |
| `/api/collections` | GET | Inventario agrupado por expansión con completitud y valor por set. |
| `/api/prices/refresh` | GET/POST | Refresca precios contra la API y crea snapshots. |

## Estructura principal

```text
app/
  api/
    scan/route.ts
    match/route.ts
    inventory/route.ts
    inventory/[id]/route.ts
    valuation/route.ts
    collections/route.ts
    prices/refresh/route.ts
  dashboard/page.tsx
  inventory/page.tsx
  collections/page.tsx
  scanner/page.tsx
  login/page.tsx
  register/page.tsx
  page.tsx
components/
  ScannerClient.tsx
  InventoryClient.tsx
  CollectionsClient.tsx
  DashboardClient.tsx
  Navbar.tsx
  AuthForm.tsx
lib/
  pokemon-price-tracker.ts
  supabase/{client,server}.ts
  utils.ts
services/
  scanner/parse-card-text.ts
supabase/migrations/
  001_init.sql
  002_policies.sql
  003_indexes.sql
  004_card_enrichment.sql
```

## Próximos pasos sugeridos

- Subida de imágenes a Supabase Storage (hoy sólo guardamos la URL de la API).
- Filtros por rareza / set / tipo en el inventario.
- Histórico visual de precios (`price_snapshots` ya se persiste).
- Intercambios entre usuarios (`for_trade` ya existe en el modelo).
