# Cuentas × Cobrar

Aplicación web para llevar el control de las personas a quienes les prestas dinero (en efectivo, producto o servicio) y los abonos que te van haciendo.

Es HTML + CSS + JavaScript puro (sin frameworks), alojada gratis en **GitHub Pages**. Los datos se guardan en **Firebase** (Google), protegidos por una cuenta con correo y contraseña, y **se sincronizan automáticamente entre todos tus dispositivos** (celular, computadora, tablet…).

---

## Parte 1 — Crear tu proyecto de Firebase (una sola vez)

### 1. Crear el proyecto

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) con tu cuenta de Google.
2. Clic en **Crear un proyecto** (o "Add project").
3. Ponle de nombre, por ejemplo: `cuentas-x-cobrar`.
4. Puedes desactivar Google Analytics (no lo necesitas para esta app).
5. Clic en **Crear proyecto** y espera a que termine.

### 2. Activar Firestore (la base de datos)

1. En el menú izquierdo, ve a **Compilación → Firestore Database**.
2. Clic en **Crear base de datos**.
3. Elige la ubicación más cercana a ti (por ejemplo `us-east1` para Miami/Florida) — no se puede cambiar después.
4. Selecciona **Iniciar en modo de producción**.
5. Clic en **Habilitar**.

### 3. Configurar las reglas de seguridad

1. Dentro de Firestore Database, ve a la pestaña **Reglas**.
2. Borra lo que haya y pega exactamente esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cuentasXCobrarUsuarios/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

3. Clic en **Publicar**.

Esto asegura que **solo tú**, ya con la sesión iniciada, puedas leer o escribir tus propios datos. Nadie más puede acceder a ellos, aunque vean el código de tu página.

### 4. Activar el inicio de sesión con correo y contraseña

1. En el menú izquierdo, ve a **Compilación → Authentication**.
2. Clic en **Comenzar** (Get started).
3. En la pestaña **Sign-in method**, elige **Correo electrónico/contraseña**.
4. Actívalo (el primer interruptor) y clic en **Guardar**.

### 5. Registrar tu app web y obtener la configuración

1. Ve a **⚙️ (Configuración del proyecto)** junto a "Descripción general del proyecto", arriba a la izquierda.
2. Baja hasta **Tus apps** y clic en el ícono **</>** (Web).
3. Ponle un apodo, por ejemplo `cuentas-x-cobrar-web`. No necesitas marcar "Firebase Hosting".
4. Clic en **Registrar app**.
5. Te va a mostrar un bloque de código con un objeto `firebaseConfig` parecido a este:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "cuentas-x-cobrar.firebaseapp.com",
  projectId: "cuentas-x-cobrar",
  storageBucket: "cuentas-x-cobrar.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Copia esos 6 valores — los vas a necesitar en la Parte 2.

---

## Parte 2 — Configurar los archivos de la app

1. Abre el archivo **`firebase-config.js`** que te entregué.
2. Reemplaza los valores de ejemplo por los tuyos, copiados del paso anterior.
3. Guarda el archivo.

> Este archivo **no es secreto** — es normal que esta información quede pública en tu repositorio de GitHub. Lo que de verdad protege tus datos son las Reglas de Seguridad de Firestore que configuraste en el paso 3 de la Parte 1.

---

## Parte 3 — Subir todo a GitHub Pages

### 1. Crear el repositorio en GitHub

1. Entra a [github.com](https://github.com) e inicia sesión.
2. Arriba a la derecha, clic en **+** → **New repository**.
3. Nómbralo, por ejemplo: `cuentas-x-cobrar`.
4. Déjalo en **Public**.
5. No marques ninguna opción de "Add a README".
6. Clic en **Create repository**.

### 2. Subir los archivos

**Opción A — Desde el navegador (sin terminal):**

1. En la página del repositorio, clic en **uploading an existing file**.
2. Arrastra los 5 archivos: `index.html`, `style.css`, `app.js`, `firebase-config.js` (ya con tus datos) y `README.md`.
3. Clic en **Commit changes**.

**Opción B — Con Git desde la terminal:**

```bash
cd cuentas-x-cobrar
git init
git add .
git commit -m "Cuentas x Cobrar con sincronización en la nube"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/cuentas-x-cobrar.git
git push -u origin main
```

### 3. Activar GitHub Pages

1. En el repositorio, pestaña **Settings → Pages**.
2. En **Source**, elige **Deploy from a branch**.
3. En **Branch**, selecciona `main` y `/ (root)`.
4. Clic en **Save**.
5. Espera 1–2 minutos. Tu URL pública quedará como:

```
https://TU-USUARIO.github.io/cuentas-x-cobrar/
```

### 4. Crear tu cuenta dentro de la app

1. Abre esa URL.
2. En la pantalla de acceso, clic en **"Crear cuenta"**.
3. Pon tu correo y una contraseña (mínimo 6 caracteres) — **esta es la cuenta que vas a usar en todos tus dispositivos**, celular incluido.
4. Ya puedes empezar a agregar deudores. Desde cualquier otro dispositivo, entra a la misma URL e inicia sesión con el mismo correo y contraseña: vas a ver los mismos datos, actualizados en tiempo real.

### 5. (Opcional) Instalarla como app en el celular

Desde Chrome (Android) o Safari (iPhone), abre la URL y usa **"Agregar a pantalla de inicio"**.

---

## ¿Ya tenías datos guardados de la versión anterior (sin sincronización)?

Si ya habías agregado deudores en la versión vieja de la app (la que guardaba todo solo en el navegador), no se transfieren solos. Para recuperarlos:

1. Abre la app **vieja** en el navegador/dispositivo donde tengas esos datos.
2. Usa **"Exportar respaldo (.json)"** para descargar el archivo.
3. Entra a la app **nueva**, crea tu cuenta o inicia sesión.
4. Usa **"Importar respaldo"** y selecciona ese archivo `.json`.

A partir de ahí, todo queda en la nube y sincronizado.

---

## Estructura de archivos

```
cuentas-x-cobrar/
├── index.html          → estructura de la app (incluye la pantalla de acceso)
├── style.css           → estilos (estética de libro contable)
├── app.js              → toda la lógica: autenticación, deudores, préstamos, abonos, respaldo, Excel
├── firebase-config.js  → tu configuración de Firebase (la editas tú)
└── README.md           → este archivo
```

## Funcionalidades

- Cuenta propia con correo y contraseña; tus datos viajan contigo entre dispositivos.
- **Sincronización automática en tiempo real** vía Firebase Firestore — funciona incluso con conexión intermitente (se pone al día apenas hay internet).
- Agregar un deudor con nombre, teléfono y notas opcionales.
- Registrar la deuda inicial (puede quedar en $0.00) indicando si fue en **efectivo**, **producto** o **servicio**.
- Registrar nuevos préstamos y abonos en cualquier momento.
- Ver y **editar el detalle de cualquier movimiento** individual (fecha, monto, concepto, forma).
- **Estado de cuenta detallado** por deudor, listo para imprimir o guardar como PDF.
- **Exportar a Excel**: el estado de cuenta de un deudor, o todos los deudores de una vez.
- Eliminar movimientos o deudores individuales.
- Buscar y ordenar por mayor deuda, nombre o más reciente.
- Resumen general: total por cobrar, deudores activos y deudores al día.
- Exportar/importar un respaldo en formato `.json` (útil para migrar desde la versión anterior o como copia de seguridad extra).

> La exportación a Excel usa [SheetJS](https://sheetjs.com) y la sincronización usa el SDK de [Firebase](https://firebase.google.com), ambos cargados desde un CDN público.
