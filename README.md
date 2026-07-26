# Cuentas × Cobrar

Aplicación web simple para llevar el control de las personas a quienes les prestas dinero (en efectivo, producto o servicio) y los abonos que te van haciendo.

No necesita servidor ni base de datos: es HTML + CSS + JavaScript puro, y guarda toda la información en el navegador (`localStorage`). Por eso se puede alojar gratis en **GitHub Pages**.

## ⚠️ Importante sobre los datos

Los datos quedan guardados **solo en el navegador y equipo donde los cargues** (no en un servidor). Si abres la app desde otro celular o computadora, o borras el historial/caché del navegador, no verás los mismos datos. Por eso la app trae un botón **"Exportar respaldo (.json)"** — úsalo seguido para tener una copia de seguridad, y "Importar respaldo" para restaurarla o pasarla a otro dispositivo.

---

## Cómo subirlo a GitHub Pages (paso a paso)

### 1. Crear el repositorio en GitHub

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Arriba a la derecha, clic en **+** → **New repository**.
3. Ponle de nombre, por ejemplo: `cuentas-x-cobrar`.
4. Déjalo en **Public** (necesario para GitHub Pages gratis).
5. No marques ninguna opción de "Add a README" (ya tenemos uno).
6. Clic en **Create repository**.

### 2. Subir los archivos

Tienes dos formas, elige la que te resulte más cómoda:

**Opción A — Subir desde el navegador (sin usar consola/terminal):**

1. En la página del repositorio recién creado, clic en **uploading an existing file** (o **Add file → Upload files**).
2. Arrastra los 4 archivos: `index.html`, `style.css`, `app.js` y `README.md`.
3. Abajo, en "Commit changes", deja el mensaje por defecto y clic en **Commit changes**.

**Opción B — Usando Git desde la terminal:**

```bash
cd cuentas-x-cobrar
git init
git add .
git commit -m "Primera versión de Cuentas x Cobrar"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/cuentas-x-cobrar.git
git push -u origin main
```

(Reemplaza `TU-USUARIO` por tu usuario de GitHub.)

### 3. Activar GitHub Pages

1. Dentro del repositorio, ve a la pestaña **Settings**.
2. En el menú izquierdo, clic en **Pages**.
3. En "Build and deployment" → **Source**, selecciona **Deploy from a branch**.
4. En **Branch**, selecciona `main` y la carpeta `/ (root)`.
5. Clic en **Save**.
6. Espera 1–2 minutos y recarga la página de Settings → Pages. Ahí te va a aparecer la URL pública, algo como:

```
https://TU-USUARIO.github.io/cuentas-x-cobrar/
```

Esa es la dirección donde vas a usar tu app desde cualquier navegador (aunque, como se explicó arriba, los datos son propios de cada navegador/dispositivo).

### 4. (Opcional) Instalarla como app en el celular

Desde Chrome (Android) o Safari (iPhone), abre la URL y usa la opción **"Agregar a pantalla de inicio"**. Va a funcionar como una app normal, con su propio ícono.

---

## Estructura de archivos

```
cuentas-x-cobrar/
├── index.html   → estructura de la app
├── style.css    → estilos (estética de libro contable)
├── app.js       → toda la lógica: agregar deudores, préstamos, abonos, respaldo
└── README.md    → este archivo
```

## Funcionalidades

- Agregar un deudor con nombre, teléfono y notas opcionales.
- Registrar la deuda inicial (puede quedar en $0.00) indicando si fue en **efectivo**, **producto** o **servicio**.
- Registrar nuevos préstamos y abonos en cualquier momento.
- Ver el historial completo de cada deudor con saldo acumulado.
- **Estado de cuenta detallado** por deudor, listo para imprimir o guardar como PDF (botón "Imprimir / Guardar PDF").
- **Exportar a Excel**: el estado de cuenta de un deudor individual, o todos los deudores de una vez (una hoja "Resumen" + una hoja por deudor con su historial completo).
- Eliminar movimientos o deudores individuales.
- Buscar por nombre/teléfono/nota y ordenar por mayor deuda, nombre o más reciente.
- Resumen general: total por cobrar, deudores activos y deudores al día.
- Exportar/importar un respaldo en formato `.json`.

> La exportación a Excel usa la librería [SheetJS](https://sheetjs.com), cargada desde un CDN público. Se necesita conexión a internet la primera vez que se use esa función en cada sesión.
