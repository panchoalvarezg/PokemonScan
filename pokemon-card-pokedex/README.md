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
3. Authentication → habilita Email/Password.
4. Copia `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`.

## Pokemon Price Tracker

Obtén un token desde <https://www.pokemonpricetracker.com/> y colócalo en `POKEMON_PRICE_TRACKER_API_KEY`.

## Despliegue en Vercel

1. Conecta el repositorio de GitHub a Vercel.
2. Agrega las variables de entorno en **Project → Settings → Environment Variables**.
3. Vercel detecta `vercel.json` y crea el **Cron Job** que refresca precios a diario (06:00 UTC).

## Endpoints de la API

| Ruta | Método | Descripción |
| ---- | ------ | ----------- |
| `/api/scan` | POST | Recibe `text` (OCR del cliente) y devuelve `detectedName`, `detectedNumber`, `detectedSet`, `detectedType`, `detectedVariantHints`. |
| `/api/match` | POST | Busca variantes en Pokemon Price Tracker y las ordena por confianza. |
| `/api/inventory` | GET | Devuelve el inventario del usuario autenticado. |
| `/api/inventory` | POST | Guarda una carta en el inventario y registra un `price_snapshot`. |
| `/api/inventory/[id]` | DELETE | Elimina una carta del inventario. |
| `/api/valuation` | GET | Devuelve el resumen (entradas, totales, promedio). |
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
    prices/refresh/route.ts
  dashboard/page.tsx
  inventory/page.tsx
  scanner/page.tsx
  login/page.tsx
  register/page.tsx
  page.tsx
components/
  ScannerClient.tsx
  InventoryClient.tsx
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
