# syntax=docker/dockerfile:1
# Imagen única para Render/Railway: compila el frontend (Node) y lo sirve con la API PHP (Apache).

# --- 1. Compilación del frontend -------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Mismo origen que la API: no hace falta VITE_API_URL.
RUN npm run build

# --- 2. PHP 8.2 + Apache ----------------------------------------------------
FROM php:8.2-apache

ENV PORT=8080 \
    HALLAZGOS_ARCHIVO=/var/www/data/hallazgos.json

RUN a2enmod headers \
    && rm /etc/apache2/sites-enabled/000-default.conf \
    && : > /etc/apache2/ports.conf \
    && mkdir -p /var/www/data \
    && chown www-data:www-data /var/www/data

COPY docker/apache.conf /etc/apache2/sites-enabled/planeta-x.conf
COPY --from=frontend /app/dist/ /var/www/html/
COPY backend/api/ /var/www/html/api/

# Los datos quedan fuera de DocumentRoot. Para conservarlos entre despliegues, monta un volumen
# en /var/www/data desde el panel de Render/Railway (Railway no admite la instrucción VOLUME).
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD php -r 'exit(@file_get_contents("http://127.0.0.1:" . getenv("PORT") . "/api/hallazgos.php") === false ? 1 : 0);'
