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
El init sólo corre en el **primer boot**. Si añadís una migración nueva después, tenés dos opciones:

- **Recomendado (no pierde datos):** aplicarla contra el volumen vivo con el helper:

  ```bash
  ./docker/db/apply-migration.sh 009_otp_audit.sql
  ```

  El script hace `docker compose exec db psql …` con `ON_ERROR_STOP=1`. Todas nuestras migraciones usan `if not exists` / `create or replace`, así que re-aplicarlas es idempotente.

- **Si querés empezar limpio (borra todos los datos):** `docker compose down -v && docker compose up -d`. Vas a perder cualquier carta, perfil y registro OTP que tuvieras.

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

## 8. Dual-write — la app guarda en Docker automáticamente

A partir de `lib/pg-dual-write.ts`, cada vez que la app escribe en Supabase
también escribe **la misma fila** en el Postgres dockerizado. No es un
reemplazo de Supabase — es una replicación síncrona best-effort.

### Rutas afectadas

| Ruta | Qué hace | Qué replica al Docker |
|------|----------|-----------------------|
| `POST /api/inventory` | Añade una carta al inventario | `profiles`, `card_catalog`, `user_cards`, `price_snapshots` |
| `PATCH /api/inventory/[id]` | Edita condición / cantidad / for_trade | `user_cards` (update) |
| `DELETE /api/inventory/[id]` | Elimina carta del inventario | `user_cards` (delete) |
| `PATCH /api/inventory/bulk` | Marca varias como for_trade | `user_cards` (bulk update) |
| `GET /api/profile` | Visita al perfil | `profiles` (ensure) |
| `PATCH /api/profile` | Edita datos del perfil (handle, país, is_public…) | `profiles` (update) |
| `GET /api/prices/refresh` | Cron que actualiza precios | `card_catalog`, `price_snapshots`, `user_cards` |

### Garantías

- **Best-effort**: si `DATABASE_URL` no está definida o el contenedor está apagado, el dual-write se convierte en no-op. La request a Supabase NO falla.
- **Idempotente**: todo usa `on conflict do update`. Se puede replayar el mismo evento sin romper constraints.
- **Mismos UUIDs**: la fila en Docker tiene el mismo `id` que en Supabase, así que un PATCH/DELETE afecta la misma fila en ambas BDs.
- **Respeta FKs**: inserta automáticamente el stub en `auth.users` y el perfil en `profiles` antes de tocar `user_cards` o `price_snapshots`.
- **Sólo en dev local**: en Vercel no hay `DATABASE_URL`, así que en producción el dual-write es completamente inerte.

### Cómo demostrarlo

1. `docker compose up -d` y `npm run dev` (con `DATABASE_URL` en `.env.local`).
2. Abre `/docker-status` → los conteos empiezan en 0.
3. Abre `/inventory` en la app y añade una carta (o escanea una).
4. Refresca `/docker-status` → `profiles`, `card_catalog`, `user_cards` y `price_snapshots` ahora muestran 1.
5. Edita la carta (cambia cantidad / condición) y refresca → los valores cambian en Docker.
6. Elimínala → los conteos vuelven a bajar.
7. Abre pgAdmin y ejecutá `select * from public.user_cards_detailed;` → vas a ver la carta con TODOS los campos (nombre, set, rareza, tipo, valor), igual que en Supabase.

Esto prueba **inequívocamente** que el Docker está siendo usado por la app
web en tiempo real, no es un contenedor estático con schema vacío.

## 9. OTP cifrado en Docker (auditoría paralela con pgcrypto)

La migración `009_otp_audit.sql` añade la tabla `public.otp_audit`, que
registra cada vez que un usuario pide o verifica un OTP desde el formulario
de login. El código que guardamos aquí **no** es el de Supabase (Supabase
nunca nos lo expone). Es un código paralelo que genera la app y que queda
**cifrado con AES-256** (`pgp_sym_encrypt`) y con **hash bcrypt**
(`crypt(..., gen_salt('bf', 10))`) en Docker. Propósito:

- **Demostrar manejo de datos sensibles cifrados** en la BD dockerizada.
- **Auditar** intentos de login (email, IP, User-Agent, timestamps, attempts).
- **Documentar** el uso real de `pgcrypto` — extensión ya habilitada por `000_auth_stub.sql`.

El flujo de autenticación real (mail → código → JWT) lo sigue haciendo
Supabase. Si la auditoría falla (p.ej. Docker apagado), el login sigue
funcionando normalmente.

### Activación

1. En `.env.local` añade una clave simétrica de al menos 16 caracteres
   (idealmente 32 bytes hex aleatorios):

   ```bash
   OTP_ENCRYPTION_KEY=$(openssl rand -hex 32)
   echo "OTP_ENCRYPTION_KEY=$OTP_ENCRYPTION_KEY" >> .env.local
   ```

2. Reaplica las migraciones si tu volumen es antiguo:

   ```bash
   docker compose down -v
   docker compose up -d
   ```

3. Reinicia el dev server para que Next cargue `OTP_ENCRYPTION_KEY`:

   ```bash
   npm run dev
   ```

### Cómo funciona

| Paso | En la app | En Docker |
|------|-----------|-----------|
| El usuario escribe su email en `/login` y pulsa "Enviarme un código". | `supabase.auth.signInWithOtp(...)` envía el mail. En paralelo, `fetch("/api/auth/otp/audit", {action:"send"})`. | `insert into otp_audit (code_encrypted = pgp_sym_encrypt(...), code_hash = crypt(..., gen_salt('bf',10)), expires_at = now() + interval '10 minutes')`. |
| Usuario escribe el código de 6 dígitos recibido por email. | `supabase.auth.verifyOtp(...)` valida con Supabase. Ademas `fetch(..., {action:"verify"})` para registrar el intento. | `update attempts = attempts + 1`. Si `crypt(code, code_hash) = code_hash` → `succeeded_at = now()`. |
| Supabase rechaza el código (caducado, mal escrito). | `fetch(..., {action:"failed"})`. | `update attempts = attempts + 1` sobre el registro activo. |

### Inspeccionar en pgAdmin

Abre pgAdmin (http://localhost:5050) → conecta al server local → query
tool sobre `pokemoncardpokedex`:

```sql
-- Ver registros en bruto: el código es bytea ilegible
select id, email, purpose, attempts, max_attempts,
       created_at, expires_at, used_at, succeeded_at,
       encode(code_encrypted, 'hex') as cifrado,
       code_hash
  from public.otp_audit
 order by created_at desc
 limit 20;

-- Descifrar con la clave (úsalo sólo en demo; NO expongas la key en queries
-- de producción — deja huella en los logs de Postgres):
select email,
       pgp_sym_decrypt(code_encrypted, 'REEMPLAZA_POR_TU_OTP_ENCRYPTION_KEY') as codigo_plano,
       created_at, expires_at, attempts, succeeded_at
  from public.otp_audit
 order by created_at desc
 limit 5;
```

El hash bcrypt se ve así: `$2a$10$Zn...` (prefijo `$2a$10$` = algoritmo
blowfish, cost 10).

### Limitaciones honestas

- El código cifrado **no es** el que el usuario recibe por email
  (eso lo guarda Supabase en su propia BD gestionada).
- `OTP_ENCRYPTION_KEY` debe gestionarse como cualquier secreto: no se
  commitea al repo, va en `.env.local` y, en producción, en las variables
  de entorno del hosting (Vercel → Settings → Environment Variables).
- Si quieres rotar la clave sin perder los registros, tendrías que re-cifrar
  (`update set code_encrypted = pgp_sym_encrypt(pgp_sym_decrypt(code_encrypted, 'vieja'), 'nueva')`).
- La tabla usa RLS habilitada sin policies → desde `anon`/`authenticated`
  no es visible. Sólo el owner de la BD (service_role o `pokescan`) lee.

### Demo en vivo

1. Login con email (OTP). El banner "🔐 Auditoría cifrada guardada en Docker"
   confirma que el audit corrió. En dev aparece el `previewCode` interno.
2. pgAdmin → `select * from public.otp_audit order by created_at desc limit 1;`
   → ves el email, el `code_encrypted` en bytea y el `code_hash` bcrypt.
3. Ejecuta `pgp_sym_decrypt(code_encrypted, 'TU_CLAVE')` → obtienes el
   mismo `previewCode` que mostró la UI.
4. Confirma que `crypt(codigo_plano, code_hash) = code_hash` → prueba que
   el bcrypt también validó correctamente.

## 10. Evidencia para la rúbrica

Al profesor/evaluador le mostrás:
1. El archivo `docker-compose.yml` (arriba del repo).
2. `docker compose up -d` corriendo con `docker compose ps` en verde.
3. Screenshot de pgAdmin o del `\dt` listando las 5 tablas + 4 vistas.
4. **Demo en vivo de dual-write**: añades una carta desde `/inventory`, luego
   muestras `/docker-status` con conteos en `1`, luego pgAdmin con la fila
   real. Esto es la evidencia más fuerte (los datos los puso la app, no
   un seed manual).
5. **Screenshot de `/docker-status`** con badge `Conectado`, versión de
   Postgres y los conteos de filas con datos reales. Esto prueba que la app
   web usa la BD dockerizada.
6. Este `DOCKER.md` como documentación del despliegue.
