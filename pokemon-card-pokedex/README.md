# Pokedex TCG

Aplicación web para escanear cartas Pokémon, buscar coincidencias en PriceCharting, guardar cartas en un inventario por usuario y calcular el valor total estimado de la colección.

## Qué incluye

- Next.js con App Router
- Supabase Auth + Postgres
- SQL de migraciones con RLS
- OCR con Tesseract.js
- Búsqueda de candidatos en PriceCharting
- Inventario por usuario
- Dashboard contable con valor total estimado

## Requisitos

- Node.js 20+
- Proyecto de Supabase
- Token de API de PriceCharting

## Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PRICECHARTING_API_TOKEN=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Instalación

```bash
npm install
npm run dev
```

## Configuración de Supabase

1. Crea un proyecto en Supabase.
2. En el SQL Editor ejecuta, en orden:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_policies.sql`
   - `supabase/migrations/003_indexes.sql`
3. En Authentication habilita email/password.
4. Crea un bucket público si luego quieres subir imágenes desde la app.

## Cómo usar

### 1. Crear cuenta
- Ve a `/register`
- Crea un usuario con email y contraseña

### 2. Obtener el user id
- En Supabase ve a Authentication > Users
- Copia el UUID del usuario para probar las rutas del MVP

### 3. Escanear carta
- Ve a `/scanner`
- Pega una URL pública de una imagen de carta
- Pega el user id
- Ejecuta el escaneo y compara resultados
- Guarda la mejor coincidencia en inventario

### 4. Revisar inventario
- Ve a `/inventory`
- Ingresa el user id
- Carga el inventario y elimina registros si quieres

### 5. Ver valorización
- Ve a `/dashboard`
- Ingresa el user id
- Revisa el valor total estimado de la colección

## Estructura principal

```text
app/
  api/
    scan/
    match/
    inventory/
    valuation/
  dashboard/
  inventory/
  scanner/
  login/
  register/
components/
lib/
services/
supabase/migrations/
```

## Flujo de negocio

1. La app recibe una imagen.
2. OCR extrae texto de la carta.
3. Se intentan detectar nombre, número y set.
4. Se consulta PriceCharting con esos criterios.
5. Se muestran coincidencias ordenadas por score.
6. El usuario confirma una coincidencia.
7. Se guarda la carta en `user_cards` con su valor unitario estimado.
8. La vista `inventory_valuation_summary` calcula el valor total del inventario del usuario.

## Notas importantes

- Este MVP usa **URL pública de imagen** para simplificar el primer despliegue.
- Puedes reemplazarlo por subida directa a Supabase Storage en una segunda iteración.
- PriceCharting tiene límite de uso, así que conviene cachear y refrescar precios por lotes más adelante.
- El escaneo por OCR no será perfecto para todas las cartas; por eso el flujo incluye confirmación manual.

## Próximas mejoras recomendadas

- Subida de imágenes a Supabase Storage
- Obtener automáticamente el `userId` desde la sesión en vez de pedirlo en pantalla
- Historial de precios con `price_snapshots`
- Filtros avanzados por rareza, set, tipo y condición
- Módulo de intercambio entre usuarios
- Script programado para refrescar precios
