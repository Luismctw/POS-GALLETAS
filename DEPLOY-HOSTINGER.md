# Cómo subir POS Galletas a Hostinger Business

## Antes de empezar necesitas
- Cuenta en Hostinger con plan Business contratado
- Cuenta en GitHub (gratis en github.com)
- El código de este proyecto listo

---

## PASO 1 — Subir el código a GitHub

1. Ve a **github.com** → New repository
2. Nombre: `pos-galletas` (privado ✅)
3. En tu computadora, abre Terminal y ejecuta:

```bash
cd /Users/albertomartinez/Desktop/pos-galletas
git add .
git commit -m "Deploy inicial a Hostinger"
git remote add origin https://github.com/TU_USUARIO/pos-galletas.git
git push -u origin main
```

---

## PASO 2 — Crear la base de datos en Hostinger

1. Entra a **hPanel** (panel.hostinger.com)
2. Ve a **Bases de datos → MySQL**
3. Crea una base de datos nueva → anota:
   - Nombre de la base de datos
   - Usuario
   - Contraseña
4. Abre **phpMyAdmin** desde hPanel
5. Selecciona tu base de datos
6. Ve a la pestaña **SQL** y pega todo el contenido del archivo `schema.sql`
7. Ejecuta → todas las tablas quedan creadas

---

## PASO 3 — Crear la app Node.js en Hostinger

1. En hPanel ve a **Sitios web → Agregar sitio web** (o Administrar el existente)
2. Busca la sección **Aplicaciones web** o **Node.js**
3. Haz clic en **Crear aplicación**
4. Configura:
   - **Versión de Node.js**: 18 o superior
   - **Modo de inicio**: npm
   - **Punto de entrada**: `backend/server.js`
   - **Directorio raíz**: `/` (raíz del repositorio)
5. En **Integración con GitHub**:
   - Conecta tu cuenta de GitHub
   - Selecciona el repositorio `pos-galletas`
   - Rama: `main`
   - Activa **Deploy automático** ✅

---

## PASO 4 — Configurar las variables de entorno

En la sección de tu app Node.js en hPanel, busca **Variables de entorno** y agrega:

| Variable | Valor |
|---|---|
| `DB_HOST` | El host de tu BD MySQL de Hostinger (ej: `localhost`) |
| `DB_USER` | El usuario que creaste en Paso 2 |
| `DB_PASSWORD` | La contraseña que pusiste en Paso 2 |
| `DB_NAME` | El nombre de la base de datos del Paso 2 |
| `ADMIN_PASSWORD` | La contraseña que quieras para el panel admin |

> ⚠️ NO subas el archivo `.env` a GitHub. Las variables van solo en hPanel.

---

## PASO 5 — Primer deploy

1. En hPanel, haz clic en **Deploy** (o el primer deploy es automático)
2. Espera 2-3 minutos
3. Hostinger te da una URL como `tudominio.com` o un subdominio temporal
4. Abre la URL en el navegador
5. Debería aparecer la pantalla de login del panel admin

---

## PASO 6 — Conectar tu dominio (opcional)

Si compraste un dominio en Hostinger:
1. hPanel → **Dominios → Apuntar dominio**
2. Selecciona tu app Node.js
3. En 24-48 horas propaga el DNS

---

## Actualizaciones futuras

Cuando hagas cambios en el código:
```bash
git add .
git commit -m "Descripción del cambio"
git push
```
Hostinger detecta el push y hace el deploy automáticamente.

---

## URLs de la app en producción

- **Panel Admin**: `https://tudominio.com/dashboard.html`
- **App Repartidores**: `https://tudominio.com/ruta_movil.html`

---

## Si algo falla

Revisa los logs en hPanel → tu app Node.js → **Registros** (Logs).
Los errores más comunes son variables de entorno mal escritas o la BD sin el schema.
