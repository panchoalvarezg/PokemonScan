# Despliegue dockerizado — Pokédex TCG

Cumple el requisito de evaluación *"Despliegue dockerizado en Docker Compose (al menos Base de Datos)"*.

El stack levanta las mismas tablas que el proyecto usa en Supabase hosted (profiles, card_catalog, user_cards, scan_uploads, price_snapshots, vistas `inventory_valuation_summary`, `user_cards_detailed`, `community_profiles`, `community_cards`) sobre un Postgres local, aplicando automáticamente las migraciones 001 → 008 al arrancar por primera vez.

## Qué incluye el `docker-compose.yml`

| Servicio | Imagen | Puerto host | Rol |
|----------|--------|-------------|-----|
| `db` | `postgres:16-alpine` | `5433` | Base de datos con las tablas del proyecto. Aplica las migraciones al primer boot. |
| `pgadmin` | `dpage/pgadmin4:8` | `5050` | UI web para explorar la BD (opcional, ideal para la demo de evaluación). |
| `app` | build local (Dockerfile) | `3000` | App Next.js. **NO arranca por defecto** — sólo con el perfil `fullstack`. |

Volumen nombrado `pokescan_pgdata` persiste los datos entre `up` / `down`.

## Requisitos

- Docker Desktop (Windows / macOS) o Docker Engine ≥ 24 + Docker Compose v2 (Linux).
- Puertos `5433` (Postgres) y `5050` (pgAdmin) libres en el host.

Verificá con `docker --version` y `docker compose version`.

## 1. Arrancar el stack

Desde la raíz del proyecto (`pokemon-card-pokedex/`):

```bash
docker compose up -d
```

La primera vez:
1. Descarga `postgres:16-alpine` y `dpage/pgadmin4:8`.
2. Crea el volumen `pokescan_pgdata`.
3. Ejecuta `docker/db/init/000_auth_stub.sql` → schema `auth`, roles `anon`, `authenticated`, `service_role` y funciones `auth.uid()`, `auth.role()`, `auth.jwt()`.
4. Ejecuta `docker/db/init/100_run_migrations.sh` → aplica en orden `supabase/migrations/001_*.sql` hasta `008_community.sql`.
5. Levanta el healthcheck con `pg_isready`.

Verificá que quedó verde:

```bash
docker compose ps
```

Deberías ver `pokescan-db` con `Up ... (healthy)` y `pokescan-pgadmin` con `Up ...`.

## 2. Ver que las tablas están

### Opción A — psql dentro del contenedor

```bash
docker compose exec db psql -U pokescan -d pokemoncardpokedex -c "\dt public.*"
```

Salida esperada:

```
          List of relations
 Schema |     Name         | Type  |  Owner
--------+------------------+-------+---------
 public | card_catalog     | table | pokescan
 public | price_snapshots  | table | pokescan
 public | profiles         | table | pokescan
 public | scan_uploads     | table | pokescan
 public | user_cards       | table | pokescan
```

También para ver las vistas de Comunidad:

```bash
docker compose exec db psql -U pokescan -d pokemoncardpokedex -c "\dv public.*"
```

Debe listar `community_cards`, `community_profiles`, `inventory_valuation_summary`, `user_cards_detailed`.

### Opción B — pgAdmin en el navegador

1. Abrí http://localhost:5050
2. Login: `admin@admin.com` / `admin`
3. Click derecho en *Servers* → *Register* → *Server*:
   - General → Name: `Pokédex Local`
   - Connection → Host: `db` · Port: `5432` · Database: `pokemoncardpokedex` · User: `pokescan` · Password: `pokescan_dev`
4. Explorá *Servers → Pokédex Local → Databases → pokemoncardpokedex → Schemas → public → Tables*.

Este es el screenshot ideal para tu informe de evaluación.

### Opción C — desde una herramienta externa

Las credenciales con el puerto mapeado en el host:

```
host:     localhost
port:     5433        # ← 5433 externo, no 5432
database: pokemoncardpokedex
user:     pokescan
password: pokescan_dev
```

## 3. Arrancar también la app en el compose (opcional)

Para correr la app Next.js dentro del mismo stack Docker, sin `npm run dev` en el host:

```bash
docker compose --profile fullstack up -d --build
```

Requisitos: un archivo `.env.local` en la raíz con las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (las del Supabase hosted). El contenedor `app` no los expone al host, sólo los lee en build y runtime.

La app quedará en http://localhost:3000.

## 4. Operaciones comunes

```bash
# Logs de la BD en tiempo real
docker compose logs -f db

# Reaplicar migraciones desde cero (BORRA todos los datos)
docker compose down -v
docker compose up -d

# Detener sin borrar datos
docker compose stop

# Reanudar
docker compose start

# Dump del esquema para backup o entrega
docker compose exec db pg_dump -U pokescan -d pokemoncardpokedex --schema-only > schema.sql

# Dump completo (estructura + datos)
docker compose exec db pg_dump -U pokescan -d pokemoncardpokedex > backup.sql
```

## 5. Seed de datos de prueba (opcional)

Para mostrar en la demo que las tablas funcionan con datos reales:

```bash
docker compose exec db psql -U pokescan -d pokemoncardpokedex <<'SQL'
-- Usuario de ejemplo en auth.users (normalmente lo crea Supabase Auth)
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'demo@pokescan.test')
on conflict do nothing;

-- Perfil público
insert into public.profiles (id, email, username, display_name, country, city, is_public)
values (
  '00000000-0000-0000-0000-000000000001',
  'demo@pokescan.test',
  'demo_trainer',
  'Entrenador Demo',
  'Chile',
  'Santiago',
  true
)
on conflict (id) do update
  set is_public = true,
      username = excluded.username;

-- Una carta en el catálogo
insert into public.card_catalog (pricecharting_product_id, product_name, set_name, card_number, rarity, card_type)
values ('demo-charizard-base-4', 'Charizard', 'Base Set', '4/102', 'Holo Rare', 'Fire')
on conflict (pricecharting_product_id) do nothing;

-- La carta en el inventario del usuario demo, marcada para intercambio
insert into public.user_cards (
  user_id, card_catalog_id, condition, quantity,
  estimated_unit_value, for_trade, set_name, card_number, card_type, rarity
)
select
  '00000000-0000-0000-0000-000000000001',
  cc.id,
  'near_mint', 1, 350.00, true,
  'Base Set', '4/102', 'Fire', 'Holo Rare'
from public.card_catalog cc
where cc.pricecharting_product_id = 'demo-charizard-base-4';

-- Verificar que aparece en la vista de Comunidad
select owner_handle, owner_country, product_name, estimated_unit_value
from public.community_cards;
SQL
```

## 6. Troubleshooting

**El contenedor `db` queda en `unhealthy`**
Mirá los logs: `docker compose logs db`. Si ves `role "authenticated" does not exist`, significa que el stub no se ejecutó. Reseteá: `docker compose down -v && docker compose up -d`.

**Error `Cannot start service db: driver failed programming external connectivity`**
El puerto 5433 ya está ocupado. O apagás lo que lo usa (`lsof -i :5433` en macOS/Linux) o cambiás el mapeo en `docker-compose.yml` a `"5434:5432"`.

**Las migraciones no se aplicaron (faltan tablas)**
El init sólo corre en el **primer boot**. Si añadís una migración nueva después, ejecutá `docker compose down -v && docker compose up -d` (borra el volumen y re-bootstrappea).

**pgAdmin dice "server disconnected"**
Estás usando `localhost` o `127.0.0.1` dentro del contenedor de pgAdmin. El host correcto desde ese contenedor es `db` (el nombre del servicio en el compose).

**Quiero que la app REAL use este Postgres en vez de Supabase**
No es recomendable para esta evaluación (perdés Auth/Google/OTP). Pero si querés probarlo, cambiá `NEXT_PUBLIC_SUPABASE_URL` a `http://localhost:54321` montando PostgREST aparte, o migrá a Supabase self-hosted completo (stack de 12 contenedores). Este requisito sólo pide "al menos Base de Datos", así que lo actual es suficiente.

## 7. Verificación desde la app web (`/docker-status`)

Hay un endpoint + página específicos para demostrar **desde el navegador**
que la app Next.js efectivamente habla con el Postgres dockerizado:

1. Instala el driver `pg` (ya está declarado en `package.json`):
   ```bash
   npm install
   ```
2. Añade `DATABASE_URL` a tu `.env.local` (no lo pongas en `.env` versionado):
   ```bash
   DATABASE_URL=postgres://pokescan:pokescan_dev@localhost:5433/pokemoncardpokedex
   ```
3. Levanta el stack Docker (`docker compose up -d`) y el dev server
   (`npm run dev`).
4. Abre en el navegador: **http://localhost:3000/docker-status**.

La página usa `lib/pg-docker.ts` (driver `pg`, no SDK de Supabase) para
conectarse directo al contenedor y mostrar:
- Badge verde `Conectado` con la latencia en ms.
- Versión de Postgres.
- Número de tablas/vistas en `public`.
- Conteo de filas para `profiles`, `card_catalog`, `user_cards`,
  `scan_uploads`, `price_snapshots` y las 4 vistas.
- Botón refrescar para consultar de nuevo sin recargar la página.

Si insertás datos con el seed del punto 5, refrescás y los conteos suben,
tenés prueba visual de que la app está leyendo del Docker.

El endpoint JSON subyacente es `GET /api/docker-health` — útil también
para screenshot de herramientas tipo Postman o `curl`:

```bash
curl http://localhost:3000/api/docker-health | jq
```

**Errores típicos**:

| Badge | Causa | Solución |
|-------|-------|----------|
| `No configurado` | Falta `DATABASE_URL` en `.env.local` | Añadirla y reiniciar `npm run dev` |
| `BD apagada` | ECONNREFUSED — contenedor no corre | `docker compose up -d` |
| `Error` | Password mala / base inexistente | Revisar valores del compose |

## 8. Evidencia para la rúbrica

Al profesor/evaluador le mostrás:
1. El archivo `docker-compose.yml` (arriba del repo).
2. `docker compose up -d` corriendo con `docker compose ps` en verde.
3. Screenshot de pgAdmin o del `\dt` listando las 5 tablas + 4 vistas.
4. Ejecución del seed del punto 5 y verificación de que aparece en
   `community_cards`.
5. **Screenshot de `/docker-status`** con badge `Conectado`, versión de
   Postgres y los conteos de filas. Esto prueba que la app web usa la BD
   dockerizada.
6. Este `DOCKER.md` como documentación del despliegue.
