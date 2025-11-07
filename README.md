# CronoCodex

Aplicación full stack para gestionar el control horario, los descansos y las solicitudes de vacaciones en organizaciones con jerarquías de RRHH. El sistema diferencia claramente entre los roles definidos:

- **Admin General**: crea jefes de área.
- **Jefes**: dan de alta a los administradores de RRHH de su área.
- **Admins RRHH**: crean trabajadores y validan ausencias.
- **Trabajadores**: fichan entradas, salidas y descansos, además de solicitar vacaciones o ausencias.

La solución se divide en una API Node.js y una interfaz React ligera lista para desplegar en Hostinger u otro proveedor.

## Estructura del repositorio

```
backend/   → API HTTP en Node.js + SQLite
frontend/  → SPA React servida con CDN (sin build step)
```

## Backend (Node.js + SQLite)

### Requisitos

- Node.js 20 o superior (incluye en Hostinger / VPS estándar).
- SQLite 3.33+ (se usa la CLI `sqlite3`, habitual en la mayoría de VPS Linux).

### Variables de entorno

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto HTTP para la API | `4000` |
| `JWT_SECRET` | Clave usada para firmar los tokens | `change-me-secret` |
| `DEFAULT_ADMIN_EMAIL` | Email inicial del Admin General | `admin@cronocodex.local` |
| `DEFAULT_ADMIN_PASSWORD` | Contraseña inicial del Admin General | `Admin123!` |
| `CRONOCODEX_DATA_DIR` | Carpeta donde se guarda la base de datos | `backend/data` |
| `DB_FILENAME` | Nombre del fichero SQLite | `cronocodex.sqlite` |

### Puesta en marcha local

```bash
cd backend
npm install # no instala paquetes externos, solo inicializa la carpeta node_modules
npm start
```

La API levantará el servicio en `http://localhost:4000` y creará automáticamente la base de datos junto con el usuario Admin General por defecto.

### Endpoints principales

- `POST /api/auth/login` — Devuelve token JWT y datos del usuario.
- `GET /api/auth/me` — Datos del usuario autenticado.
- `POST /api/users` — Crea usuarios siguiendo la jerarquía de roles.
- `GET /api/users` — Lista el equipo directo o completo según el rol.
- `POST /api/time-events` / `GET /api/time-events/me` — Registro y consulta de fichajes.
- `POST /api/vacations` / `GET /api/vacations/me` — Solicitudes de vacaciones del trabajador.
- `GET /api/vacations/pending` / `PATCH /api/vacations/:id` — Flujo de aprobación para jefes y RRHH.

### Inicialización manual del Admin General

Si quieres definir otras credenciales iniciales sin recompilar:

```bash
DEFAULT_ADMIN_EMAIL=rrhh@midominio.com \
DEFAULT_ADMIN_PASSWORD='TuPassword!' \
JWT_SECRET='cambia-esto' \
npm start
```

La primera ejecución generará el usuario y lo conservará en la base de datos.

## Frontend (React + CDN)

El frontal se sirve como archivos estáticos (`index.html`, `app.js`, `styles.css`) que cargan React 18 desde CDN. No requiere build ni herramientas adicionales.

### Ejecución local

Puedes abrir `frontend/index.html` directamente en el navegador (usa la API por defecto en `http://localhost:4000`). Para servirlo desde un servidor estático:

```bash
cd frontend
python -m http.server 5173
```

Accede a `http://localhost:5173` y tendrás la SPA lista. Si la API vive en otro dominio, define `window.API_BASE_URL` antes de cargar `app.js` (ver despliegue).

## Flujo de uso

1. Inicia sesión con el Admin General (`admin@cronocodex.local` / `Admin123!`).
2. Crea tus jefes desde el panel.
3. Cada jefe genera los administradores de RRHH.
4. Cada administrador de RRHH registra a los trabajadores.
5. Los trabajadores fichan y solicitan ausencias; RRHH y jefes las aprueban.

## Despliegue recomendado

### Backend en un VPS

1. **Clona el repositorio** en el VPS (Ubuntu/Debian por ejemplo).
2. Instala dependencias base:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm sqlite3
   ```
3. Configura un usuario para ejecutar la app y copia el código a `/var/www/cronocodex` (o ruta equivalente).
4. Dentro de `backend/` crea un archivo `.env` con tu configuración:
   ```bash
   JWT_SECRET="clave-muy-segura"
   DEFAULT_ADMIN_EMAIL="admin@midominio.com"
   DEFAULT_ADMIN_PASSWORD="PasswordRobusta"
   PORT=4000
   ```
5. Instala dependencias (vacío pero prepara `node_modules`):
   ```bash
   npm install
   ```
6. Lanza la API con un gestor de procesos como PM2 o systemd. Ejemplo con systemd (`/etc/systemd/system/cronocodex.service`):
   ```ini
   [Unit]
   Description=CronoCodex API
   After=network.target

   [Service]
   WorkingDirectory=/var/www/cronocodex/backend
   EnvironmentFile=/var/www/cronocodex/backend/.env
   ExecStart=/usr/bin/node src/server.js
   Restart=always
   User=www-data

   [Install]
   WantedBy=multi-user.target
   ```
   Luego:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now cronocodex.service
   ```
7. Expón el puerto 4000 a través de un proxy inverso (Nginx/Traefik) si deseas HTTPS:
   ```nginx
   server {
     listen 443 ssl;
     server_name api.midominio.com;

     ssl_certificate /etc/letsencrypt/live/api.midominio.com/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/api.midominio.com/privkey.pem;

     location / {
       proxy_pass http://127.0.0.1:4000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```

### Frontend en Hostinger (subdominio `app.midominio.com`)

1. En el panel de Hostinger crea el subdominio `app.midominio.com` y apunta el DNS.
2. Sube el contenido de la carpeta `frontend/` al directorio `public_html/app.midominio.com/` (puedes usar el gestor de archivos o FTP).
3. Edita `index.html` en el hosting para apuntar a la API desplegada:
   ```html
   <script>
     window.API_BASE_URL = 'https://api.midominio.com';
   </script>
   ```
4. (Opcional) Habilita HTTPS con el asistente de certificados SSL de Hostinger.

### Pruebas tras el despliegue

- Accede a `https://app.midominio.com` y entra con las credenciales del Admin General.
- Verifica que puedes crear jefes, RRHH y trabajadores, así como registrar fichajes y solicitudes.
- Comprueba desde el navegador (pestaña red) que las llamadas apuntan al dominio `api.midominio.com`.

## Seguridad y siguientes pasos

- Cambia `JWT_SECRET` y las credenciales iniciales antes de abrir la aplicación al público.
- Configura HTTPS tanto en Hostinger como en el VPS.
- Respáldate con copias del fichero SQLite (`backend/data/cronocodex.sqlite`). Puedes usar `sqlite3` con cron o rsync.
- Añade logs centralizados (por ejemplo, redirigiendo la salida de `systemd` a `journalctl` + `logrotate`).
- Si necesitas más escalabilidad, sustituye SQLite por PostgreSQL cambiando las llamadas del módulo `db.js` por un cliente SQL equivalente.

## Licencia

MIT — Puedes adaptarlo libremente a tus necesidades.
