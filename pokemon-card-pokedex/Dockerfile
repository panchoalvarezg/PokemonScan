# syntax=docker/dockerfile:1.7
#
# Build multi-stage para la app Next.js 15. Aprovechamos el output
# "standalone" (activado en next.config.ts) para obtener una imagen final
# pequeña que no necesita node_modules en tiempo de ejecución — sólo el
# server.js generado por Next y los assets estáticos.

FROM node:20-alpine AS deps
WORKDIR /app

# Copiamos sólo los manifests primero para aprovechar el cache de capas:
# mientras no cambie package.json, npm ci se salta.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund


FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables públicas (NEXT_PUBLIC_*) se inline en el JS del cliente durante
# el build. Si las pasas via --build-arg aquí puedes bakearlas en la imagen;
# si las dejas en runtime via env_file, Next las leerá por proceso.
RUN npm run build


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario no-root para buenas prácticas de seguridad en el contenedor.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Assets estáticos y build standalone.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
