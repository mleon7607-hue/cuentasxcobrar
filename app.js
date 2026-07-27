/* ==========================================================
   Cuentas × Cobrar
   App de control de deudores — persistencia en la nube (Firebase)
   con sincronización automática entre dispositivos.
   ========================================================== */

/* ---------- Firebase ---------- */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn("Persistencia offline no disponible:", err.code);
});

const COLECCION = "cuentasXCobrarUsuarios";
let unsuscribirEstado = null;
let modoAuth = "login"; // 'login' | 'signup'
let modoActual = "deudores"; // 'deudores' | 'propiedades'

/* ---------- Estado ---------- */
let estado = { deudores: [], propiedades: [] };
let deudorActivoId = null;
let modoTx = null; // 'deuda' | 'abono'
let txDetalleActivoId = null;
let propiedadActivaId = null;
let modoTxProp = null; // 'cargo' | 'abono'
let estadoCuentaContexto = "deudor"; // 'deudor' | 'propiedad'

function guardarEstado(){
  const user = auth.currentUser;
  if(!user){ mostrarToast("Tu sesión expiró. Vuelve a iniciar sesión."); return Promise.resolve(); }
  return db.collection(COLECCION).doc(user.uid).set(estado).catch((e) => {
    console.error(e);
    mostrarToast("No se pudo guardar en la nube. Revisa tu conexión.");
  });
}

function suscribirEstado(uid){
  if(unsuscribirEstado) unsuscribirEstado();
  unsuscribirEstado = db.collection(COLECCION).doc(uid).onSnapshot(
    (snap) => {
      const data = snap.exists ? snap.data() : {};
      estado = {
        deudores: Array.isArray(data.deudores) ? data.deudores : [],
        propiedades: Array.isArray(data.propiedades) ? data.propiedades : []
      };
      render();
    },
    (err) => {
      console.error(err);
      mostrarToast("No se pudo sincronizar con la nube.");
    }
  );
}

function generarId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

/* ---------- Utilidades ---------- */
const fmtMoneda = new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" });
const fmtFecha = (iso) => {
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const hoyISO = () => new Date().toISOString().slice(0,10);

function calcularSaldo(deudor){
  return deudor.transacciones.reduce((acc,t) => acc + (t.tipo === "deuda" ? t.monto : -t.monto), 0);
}

function ultimoMovimiento(deudor){
  if(deudor.transacciones.length === 0) return null;
  return [...deudor.transacciones].sort((a,b) => b.fecha.localeCompare(a.fecha))[0];
}

function mostrarToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(mostrarToast._h);
  mostrarToast._h = setTimeout(() => { t.hidden = true; }, 2600);
}

const MODO_LABEL = {
  efectivo: "Efectivo",
  producto: "Producto",
  servicio: "Servicio"
};

/* ==========================================================
   Render: resumen + lista
   ========================================================== */
function render(){
  renderResumen();
  renderLista();
  if(deudorActivoId) renderDetalle();
  renderResumenPropiedades();
  renderListaPropiedades();
  if(propiedadActivaId) renderDetallePropiedad();
}

function renderResumen(){
  const totalPorCobrar = estado.deudores.reduce((acc,d) => {
    const s = calcularSaldo(d);
    return acc + (s > 0 ? s : 0);
  }, 0);
  const activos = estado.deudores.filter(d => calcularSaldo(d) > 0).length;
  const alDia = estado.deudores.filter(d => calcularSaldo(d) <= 0).length;

  document.getElementById("sumTotalPorCobrar").textContent = fmtMoneda.format(totalPorCobrar);
  document.getElementById("sumDeudoresActivos").textContent = activos;
  document.getElementById("sumAlDia").textContent = alDia;
}

function renderLista(){
  const contenedor = document.getElementById("listaDeudores");
  const vacio = document.getElementById("estadoVacio");
  const busqueda = document.getElementById("buscador").value.trim().toLowerCase();
  const orden = document.getElementById("ordenSelect").value;

  let lista = estado.deudores.filter(d => {
    if(!busqueda) return true;
    return (d.nombre || "").toLowerCase().includes(busqueda)
      || (d.telefono || "").toLowerCase().includes(busqueda)
      || (d.notas || "").toLowerCase().includes(busqueda);
  });

  lista = lista.map(d => ({ d, saldo: calcularSaldo(d) }));

  if(orden === "saldo-desc") lista.sort((a,b) => b.saldo - a.saldo);
  else if(orden === "nombre-asc") lista.sort((a,b) => a.d.nombre.localeCompare(b.d.nombre));
  else if(orden === "reciente") lista.sort((a,b) => b.d.fechaCreacion.localeCompare(a.d.fechaCreacion));

  if(estado.deudores.length === 0){
    contenedor.innerHTML = "";
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  contenedor.innerHTML = lista.map(({d, saldo}) => {
    const ultimo = ultimoMovimiento(d);
    let selloClase = "aldia", selloTexto = "AL DÍA";
    if(saldo > 0){ selloClase = "debe"; selloTexto = fmtMoneda.format(saldo); }
    else if(saldo < 0){ selloClase = "favor"; selloTexto = "A FAVOR " + fmtMoneda.format(Math.abs(saldo)); }

    return `
      <article class="tarjeta-deudor" data-id="${d.id}">
        <div class="tarjeta-top">
          <div>
            <p class="tarjeta-nombre">${escapeHTML(d.nombre)}</p>
            ${d.telefono ? `<p class="tarjeta-meta">${escapeHTML(d.telefono)}</p>` : ""}
          </div>
          <span class="sello ${selloClase}">${selloTexto}</span>
        </div>
        ${ultimo ? `<p class="tarjeta-ultimo">Último movimiento: ${fmtFecha(ultimo.fecha)} · ${ultimo.tipo === "deuda" ? "préstamo" : "abono"} de ${fmtMoneda.format(ultimo.monto)}</p>` : `<p class="tarjeta-ultimo">Sin movimientos todavía</p>`}
      </article>
    `;
  }).join("");

  contenedor.querySelectorAll(".tarjeta-deudor").forEach(el => {
    el.addEventListener("click", () => abrirDetalle(el.dataset.id));
  });
}

function escapeHTML(str){
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ==========================================================
   Panel de detalle
   ========================================================== */
function abrirDetalle(id){
  deudorActivoId = id;
  document.getElementById("formTransaccion").hidden = true;
  document.getElementById("detalleEditar").hidden = true;
  document.getElementById("overlayDetalle").hidden = false;
  renderDetalle();
}

function cerrarDetalle(){
  deudorActivoId = null;
  document.getElementById("overlayDetalle").hidden = true;
}

function getDeudorActivo(){
  return estado.deudores.find(d => d.id === deudorActivoId);
}

function renderDetalle(){
  const d = getDeudorActivo();
  if(!d) { cerrarDetalle(); return; }

  const saldo = calcularSaldo(d);
  const sello = document.getElementById("detalleSello");
  sello.className = "detalle-sello";
  if(saldo > 0){ sello.classList.add("debe"); sello.textContent = fmtMoneda.format(saldo) + " pendiente"; }
  else if(saldo < 0){ sello.classList.add("favor"); sello.textContent = "A favor " + fmtMoneda.format(Math.abs(saldo)); }
  else { sello.classList.add("aldia"); sello.textContent = "Al día"; }

  document.getElementById("detalleNombre").textContent = d.nombre;
  const metaPartes = [];
  if(d.telefono) metaPartes.push(d.telefono);
  if(d.notas) metaPartes.push(d.notas);
  document.getElementById("detalleMeta").textContent = metaPartes.join(" · ");

  // Historial con saldo acumulado
  const tbody = document.getElementById("tablaHistorialBody");
  const historialVacio = document.getElementById("historialVacio");
  const ordenadas = [...d.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  if(ordenadas.length === 0){
    tbody.innerHTML = "";
    historialVacio.hidden = false;
  } else {
    historialVacio.hidden = true;
    let acumulado = 0;
    const filas = ordenadas.map(t => {
      acumulado += (t.tipo === "deuda" ? t.monto : -t.monto);
      const signo = t.tipo === "deuda" ? "+" : "−";
      const claseMonto = t.tipo === "deuda" ? "monto-deuda" : "monto-abono";
      return `
        <tr data-txid="${t.id}">
          <td>${fmtFecha(t.fecha)}</td>
          <td>${escapeHTML(t.concepto || (t.tipo === "deuda" ? "Préstamo" : "Abono"))}
            <span class="tx-concepto-tipo">${t.tipo === "deuda" ? "Préstamo" + (t.metodo ? " · " + MODO_LABEL[t.metodo] : "") : "Abono"}</span>
          </td>
          <td class="col-monto ${claseMonto}">${signo} ${fmtMoneda.format(t.monto)}</td>
          <td class="col-monto">${fmtMoneda.format(acumulado)}</td>
          <td class="col-acciones-tx">
            <button class="btn-editar-tx" data-txid="${t.id}" title="Editar movimiento" aria-label="Editar movimiento">✎</button>
            <button class="btn-borrar-tx" data-txid="${t.id}" title="Eliminar movimiento" aria-label="Eliminar movimiento">✕</button>
          </td>
        </tr>
      `;
    }).reverse(); // mostrar más reciente arriba
    tbody.innerHTML = filas.join("");
    tbody.querySelectorAll(".btn-borrar-tx").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); eliminarTransaccion(btn.dataset.txid); });
    });
    tbody.querySelectorAll(".btn-editar-tx").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); editarTxDirecto(btn.dataset.txid); });
    });
    tbody.querySelectorAll("tr[data-txid]").forEach(tr => {
      tr.addEventListener("click", () => abrirTxDetalle(tr.dataset.txid));
    });
  }
}

function eliminarTransaccion(txId){
  const d = getDeudorActivo();
  if(!d) return;
  if(!confirm("¿Eliminar este movimiento del historial? Esta acción no se puede deshacer.")) return;
  d.transacciones = d.transacciones.filter(t => t.id !== txId);
  guardarEstado();
  render();
}

/* ---------- Editar datos del deudor ---------- */
function abrirEdicion(){
  const d = getDeudorActivo();
  document.getElementById("editNombre").value = d.nombre;
  document.getElementById("editTelefono").value = d.telefono || "";
  document.getElementById("editNotas").value = d.notas || "";
  document.getElementById("detalleEditar").hidden = false;
}

function guardarEdicion(){
  const d = getDeudorActivo();
  const nombre = document.getElementById("editNombre").value.trim();
  if(!nombre){ mostrarToast("El nombre no puede quedar vacío."); return; }
  d.nombre = nombre;
  d.telefono = document.getElementById("editTelefono").value.trim();
  d.notas = document.getElementById("editNotas").value.trim();
  guardarEstado();
  document.getElementById("detalleEditar").hidden = true;
  render();
  mostrarToast("Datos actualizados.");
}

function eliminarDeudor(){
  const d = getDeudorActivo();
  if(!confirm(`¿Eliminar a ${d.nombre} y todo su historial? Esta acción no se puede deshacer.`)) return;
  estado.deudores = estado.deudores.filter(x => x.id !== d.id);
  guardarEstado();
  cerrarDetalle();
  render();
  mostrarToast("Deudor eliminado.");
}

/* ---------- Detalle de un movimiento individual (deudor o propiedad) ---------- */
let contextoTxActivo = "deudor"; // 'deudor' | 'propiedad'

function esMontoPositivo(tipo){
  return tipo === "deuda" || tipo === "cargo";
}

function getEntidadActivaParaTx(){
  return contextoTxActivo === "propiedad" ? getPropiedadActiva() : getDeudorActivo();
}

function buscarPorTxId(txId){
  for(const d of estado.deudores){
    const t = d.transacciones.find(x => x.id === txId);
    if(t) return { entidad: d, tx: t, contexto: "deudor" };
  }
  for(const p of estado.propiedades){
    const t = p.transacciones.find(x => x.id === txId);
    if(t) return { entidad: p, tx: t, contexto: "propiedad" };
  }
  return null;
}

function resolverTxActivo(){
  if(!txDetalleActivoId) return null;
  const entidadRapida = getEntidadActivaParaTx();
  if(entidadRapida){
    const tx = entidadRapida.transacciones.find(t => t.id === txDetalleActivoId);
    if(tx) return { entidad: entidadRapida, tx, contexto: contextoTxActivo };
  }
  // Camino de respaldo: si el contexto quedó desincronizado, busca en todos lados por ID
  const encontrado = buscarPorTxId(txDetalleActivoId);
  if(encontrado) contextoTxActivo = encontrado.contexto; // autocorregir
  return encontrado;
}

function transaccionesOrdenadas(d){
  return [...d.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
}

function saldoHastaTx(d, txId){
  let acumulado = 0;
  for(const t of transaccionesOrdenadas(d)){
    acumulado += (esMontoPositivo(t.tipo) ? t.monto : -t.monto);
    if(t.id === txId) return acumulado;
  }
  return acumulado;
}

function abrirTxDetalle(txId, contexto = "deudor"){
  contextoTxActivo = contexto;
  const entidad = getEntidadActivaParaTx();
  if(!entidad) return;
  const tx = entidad.transacciones.find(t => t.id === txId);
  if(!tx) return;
  txDetalleActivoId = txId;
  document.getElementById("formEditarTx").hidden = true;
  document.getElementById("txDetalleAcciones").hidden = false;
  renderTxDetalleVista(entidad, tx);
  document.getElementById("overlayTxDetalle").hidden = false;
}

function editarTxDirecto(txId, contexto = "deudor"){
  abrirTxDetalle(txId, contexto);
  abrirEditarTx();
}

function renderTxDetalleVista(entidad, tx){
  const saldo = saldoHastaTx(entidad, tx.id);
  const esCargo = esMontoPositivo(tx.tipo);
  const esProp = contextoTxActivo === "propiedad";
  const etiquetaTipo = esCargo ? (esProp ? "Cargo" : "Préstamo") : "Abono";
  document.getElementById("txDetalleTitulo").textContent = esCargo ? (esProp ? "Detalle del cargo" : "Detalle del préstamo") : "Detalle del abono";
  document.getElementById("txDetalleDatos").innerHTML = `
    <dt>${esProp ? "Propiedad" : "Deudor"}</dt><dd class="no-mono dd-full">${escapeHTML(entidad.nombre)}</dd>
    <dt>Fecha</dt><dd>${fmtFecha(tx.fecha)}</dd>
    <dt>Tipo</dt><dd class="no-mono">${etiquetaTipo}${tx.automatico ? ' <span class="tx-automatica">automático</span>' : ""}</dd>
    ${tx.metodo ? `<dt>Forma</dt><dd class="no-mono">${MODO_LABEL[tx.metodo] || "—"}</dd>` : ""}
    <dt>Monto</dt><dd class="${esCargo ? "monto-deuda" : "monto-abono"}">${fmtMoneda.format(tx.monto)}</dd>
    <dt>Concepto</dt><dd class="no-mono dd-full">${tx.concepto ? escapeHTML(tx.concepto) : "—"}</dd>
    <dt>Saldo después de este movimiento</dt><dd class="dd-full">${fmtMoneda.format(saldo)}</dd>
  `;
}

function cerrarTxDetalle(){
  txDetalleActivoId = null;
  document.getElementById("overlayTxDetalle").hidden = true;
}

function getTxActivo(){
  const r = resolverTxActivo();
  return r ? r.tx : null;
}

function abrirEditarTx(){
  const tx = getTxActivo();
  if(!tx) return;
  document.getElementById("editTxMonto").value = tx.monto;
  document.getElementById("editTxConcepto").value = tx.concepto || "";
  document.getElementById("editTxFecha").value = tx.fecha;
  const tieneMetodo = contextoTxActivo === "deudor" && tx.tipo === "deuda";
  document.getElementById("labelEditMetodo").hidden = !tieneMetodo;
  if(tieneMetodo) document.getElementById("editTxMetodo").value = tx.metodo || "efectivo";
  document.getElementById("txDetalleAcciones").hidden = true;
  document.getElementById("formEditarTx").hidden = false;
}

function cancelarEditarTx(){
  document.getElementById("formEditarTx").hidden = true;
  document.getElementById("txDetalleAcciones").hidden = false;
}

function guardarEditarTx(ev){
  ev.preventDefault();
  try{
    const r = resolverTxActivo();
    if(!r){
      mostrarToast("No se pudo encontrar el movimiento. Cierra esta ventana y vuelve a intentarlo.");
      console.warn("guardarEditarTx: entidad o tx no encontrados", { contextoTxActivo, propiedadActivaId, deudorActivoId, txDetalleActivoId });
      return;
    }
    const { entidad, tx } = r;
    const monto = parseFloat(document.getElementById("editTxMonto").value);
    if(isNaN(monto) || monto <= 0){ mostrarToast("Ingresa un monto válido."); return; }
    tx.monto = Math.round(monto * 100) / 100;
    tx.concepto = document.getElementById("editTxConcepto").value.trim();
    tx.fecha = document.getElementById("editTxFecha").value || tx.fecha;
    if(contextoTxActivo === "deudor" && tx.tipo === "deuda") tx.metodo = document.getElementById("editTxMetodo").value;
    guardarEstado();
    document.getElementById("formEditarTx").hidden = true;
    document.getElementById("txDetalleAcciones").hidden = false;
    renderTxDetalleVista(entidad, tx);
    render();
    mostrarToast("Movimiento actualizado.");
  }catch(e){
    console.error("Error en guardarEditarTx:", e);
    mostrarToast("Ocurrió un error al guardar. Intenta de nuevo.");
  }
}

function eliminarTxDesdeDetalle(){
  const r = resolverTxActivo();
  if(!r){
    mostrarToast("No se pudo encontrar el movimiento. Cierra esta ventana y vuelve a intentarlo.");
    return;
  }
  const { entidad, tx } = r;
  if(!confirm("¿Eliminar este movimiento del historial? Esta acción no se puede deshacer.")) return;
  entidad.transacciones = entidad.transacciones.filter(t => t.id !== tx.id);
  guardarEstado();
  cerrarTxDetalle();
  render();
  mostrarToast("Movimiento eliminado.");
}

/* ---------- Formulario de transacción (préstamo / abono) ---------- */
function abrirFormTx(tipo){
  modoTx = tipo;
  const form = document.getElementById("formTransaccion");
  document.getElementById("formTransaccionTitulo").textContent = tipo === "deuda" ? "Registrar préstamo" : "Registrar abono";
  document.getElementById("labelMetodo").hidden = tipo !== "deuda";
  document.getElementById("txMonto").value = "";
  document.getElementById("txConcepto").value = "";
  document.getElementById("txConcepto").placeholder = tipo === "deuda" ? "Ej: repuesto de freno, préstamo en efectivo…" : "Ej: abono en efectivo, pago parcial…";
  document.getElementById("txFecha").value = hoyISO();
  form.hidden = false;
  document.getElementById("txMonto").focus();
}

function cancelarFormTx(){
  document.getElementById("formTransaccion").hidden = true;
  modoTx = null;
}

function guardarTx(ev){
  ev.preventDefault();
  const d = getDeudorActivo();
  const monto = parseFloat(document.getElementById("txMonto").value);
  if(isNaN(monto) || monto <= 0){ mostrarToast("Ingresa un monto válido."); return; }
  const fecha = document.getElementById("txFecha").value || hoyISO();
  const concepto = document.getElementById("txConcepto").value.trim();

  const tx = {
    id: generarId(),
    fecha,
    tipo: modoTx,
    concepto,
    monto: Math.round(monto * 100) / 100,
    metodo: modoTx === "deuda" ? document.getElementById("txMetodo").value : null
  };
  d.transacciones.push(tx);
  guardarEstado();
  cancelarFormTx();
  render();
  mostrarToast(modoTx === "deuda" ? "Préstamo registrado." : "Abono registrado.");
}

/* ==========================================================
   Nuevo deudor
   ========================================================== */
function abrirModalNuevo(){
  document.getElementById("formNuevoDeudor").reset();
  document.getElementById("nuevoMonto").value = "0";
  document.getElementById("overlayNuevo").hidden = false;
  document.getElementById("nuevoNombre").focus();
}
function cerrarModalNuevo(){
  document.getElementById("overlayNuevo").hidden = true;
}

function guardarNuevoDeudor(ev){
  ev.preventDefault();
  const nombre = document.getElementById("nuevoNombre").value.trim();
  if(!nombre){ mostrarToast("El nombre es obligatorio."); return; }

  const montoInicial = parseFloat(document.getElementById("nuevoMonto").value) || 0;
  const nuevo = {
    id: generarId(),
    nombre,
    telefono: document.getElementById("nuevoTelefono").value.trim(),
    notas: document.getElementById("nuevoNotas").value.trim(),
    fechaCreacion: hoyISO(),
    transacciones: []
  };

  if(montoInicial > 0){
    nuevo.transacciones.push({
      id: generarId(),
      fecha: hoyISO(),
      tipo: "deuda",
      concepto: document.getElementById("nuevoConcepto").value.trim() || "Deuda inicial",
      monto: Math.round(montoInicial * 100) / 100,
      metodo: document.getElementById("nuevoMetodo").value
    });
  }

  estado.deudores.push(nuevo);
  guardarEstado();
  cerrarModalNuevo();
  render();
  mostrarToast("Deudor agregado.");
}

/* ==========================================================
   Estado de cuenta detallado (imprimible / PDF)
   ========================================================== */
function construirEstadoCuentaHTML(d){
  const ordenadas = [...d.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  let acumulado = 0;
  const filas = ordenadas.map(t => {
    acumulado += (t.tipo === "deuda" ? t.monto : -t.monto);
    const signo = t.tipo === "deuda" ? "+" : "−";
    return `
      <tr>
        <td>${fmtFecha(t.fecha)}</td>
        <td>${escapeHTML(t.concepto || (t.tipo === "deuda" ? "Préstamo" : "Abono"))}</td>
        <td>${t.tipo === "deuda" ? "Préstamo" + (t.metodo ? " · " + MODO_LABEL[t.metodo] : "") : "Abono"}</td>
        <td class="col-monto">${signo} ${fmtMoneda.format(t.monto)}</td>
        <td class="col-monto">${fmtMoneda.format(acumulado)}</td>
      </tr>
    `;
  }).join("");

  const totalPrestado = d.transacciones.filter(t => t.tipo === "deuda").reduce((a,t) => a + t.monto, 0);
  const totalAbonado = d.transacciones.filter(t => t.tipo === "abono").reduce((a,t) => a + t.monto, 0);
  const saldoFinal = totalPrestado - totalAbonado;

  const filasVacias = ordenadas.length === 0
    ? `<tr><td colspan="5" style="text-align:center; color:var(--ink-soft); padding:16px 0;">Sin movimientos todavía.</td></tr>`
    : filas;

  return `
    <div class="estado-doc">
      <div class="estado-doc-header">
        <div>
          <p class="estado-doc-marca">Cuentas <span>×</span> Cobrar</p>
          <p class="estado-doc-titulo">Estado de Cuenta</p>
        </div>
        <div class="estado-doc-emision">
          Emitido: ${fmtFecha(hoyISO())}
        </div>
      </div>

      <dl class="estado-doc-datos">
        <div><dt>Deudor</dt><dd>${escapeHTML(d.nombre)}</dd></div>
        <div><dt>Cliente desde</dt><dd>${fmtFecha(d.fechaCreacion)}</dd></div>
        <div><dt>Teléfono</dt><dd>${d.telefono ? escapeHTML(d.telefono) : "—"}</dd></div>
        <div><dt>Notas</dt><dd>${d.notas ? escapeHTML(d.notas) : "—"}</dd></div>
      </dl>

      <table class="estado-doc-tabla">
        <thead>
          <tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th class="col-monto">Monto</th><th class="col-monto">Saldo</th></tr>
        </thead>
        <tbody>${filasVacias}</tbody>
      </table>

      <div class="estado-doc-resumen">
        <div><span>Total prestado</span><span class="valor">${fmtMoneda.format(totalPrestado)}</span></div>
        <div><span>Total abonado</span><span class="valor">${fmtMoneda.format(totalAbonado)}</span></div>
        <div><span>Saldo pendiente</span><span class="valor">${fmtMoneda.format(saldoFinal)}</span></div>
      </div>

      <p class="estado-doc-footer">Documento generado por Cuentas × Cobrar el ${fmtFecha(hoyISO())}.</p>
    </div>
  `;
}

function abrirEstadoCuenta(){
  const d = getDeudorActivo();
  if(!d) return;
  estadoCuentaContexto = "deudor";
  document.getElementById("estadoCuentaContenido").innerHTML = construirEstadoCuentaHTML(d);
  document.getElementById("overlayEstado").hidden = false;
}

function cerrarEstadoCuenta(){
  document.getElementById("overlayEstado").hidden = true;
}

/* ==========================================================
   Exportar a Excel (SheetJS)
   ========================================================== */
function nombreHojaValido(nombre, usados){
  // Excel: máx 31 caracteres, sin : \ / ? * [ ]
  let base = (nombre || "Deudor").replace(/[:\\/?*\[\]]/g, "").trim().slice(0, 28) || "Deudor";
  let final = base, i = 2;
  while(usados.has(final.toLowerCase())){
    final = `${base} (${i})`.slice(0, 31);
    i++;
  }
  usados.add(final.toLowerCase());
  return final;
}

function filasHistorialParaExcel(d){
  const ordenadas = [...d.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  let acumulado = 0;
  const filas = [["Fecha","Concepto","Tipo","Método","Monto","Saldo acumulado"]];
  ordenadas.forEach(t => {
    acumulado += (t.tipo === "deuda" ? t.monto : -t.monto);
    filas.push([
      fmtFecha(t.fecha),
      t.concepto || (t.tipo === "deuda" ? "Préstamo" : "Abono"),
      t.tipo === "deuda" ? "Préstamo" : "Abono",
      t.metodo ? MODO_LABEL[t.metodo] : "",
      t.tipo === "deuda" ? t.monto : -t.monto,
      acumulado
    ]);
  });
  return filas;
}

function exportarDeudorExcel(d){
  if(typeof XLSX === "undefined"){ mostrarToast("No se pudo cargar el módulo de Excel. Revisa tu conexión a internet."); return; }
  const totalPrestado = d.transacciones.filter(t => t.tipo === "deuda").reduce((a,t) => a + t.monto, 0);
  const totalAbonado = d.transacciones.filter(t => t.tipo === "abono").reduce((a,t) => a + t.monto, 0);

  const encabezado = [
    ["Cuentas x Cobrar — Estado de Cuenta"],
    ["Deudor", d.nombre],
    ["Teléfono", d.telefono || ""],
    ["Notas", d.notas || ""],
    ["Cliente desde", fmtFecha(d.fechaCreacion)],
    ["Emitido", fmtFecha(hoyISO())],
    []
  ];
  const filas = filasHistorialParaExcel(d);
  const cierre = [
    [],
    ["Total prestado", totalPrestado],
    ["Total abonado", totalAbonado],
    ["Saldo pendiente", totalPrestado - totalAbonado]
  ];

  const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filas, ...cierre]);
  ws["!cols"] = [{wch:14},{wch:32},{wch:12},{wch:12},{wch:14},{wch:16}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estado de cuenta");
  XLSX.writeFile(wb, `estado-de-cuenta-${d.nombre.replace(/[^\w\- ]/g,"").trim() || "deudor"}.xlsx`);
  mostrarToast("Excel exportado.");
}

function exportarTodoExcel(){
  if(typeof XLSX === "undefined"){ mostrarToast("No se pudo cargar el módulo de Excel. Revisa tu conexión a internet."); return; }
  if(estado.deudores.length === 0 && estado.propiedades.length === 0){
    mostrarToast("Todavía no hay datos para exportar.");
    return;
  }

  const wb = XLSX.utils.book_new();
  const usados = new Set();

  if(estado.deudores.length > 0){
    // Hoja resumen de deudores
    const resumenFilas = [["Nombre","Teléfono","Notas","Cliente desde","Total prestado","Total abonado","Saldo actual","Estado"]];
    estado.deudores.forEach(d => {
      const totalPrestado = d.transacciones.filter(t => t.tipo === "deuda").reduce((a,t) => a + t.monto, 0);
      const totalAbonado = d.transacciones.filter(t => t.tipo === "abono").reduce((a,t) => a + t.monto, 0);
      const saldo = totalPrestado - totalAbonado;
      resumenFilas.push([
        d.nombre, d.telefono || "", d.notas || "", fmtFecha(d.fechaCreacion),
        totalPrestado, totalAbonado, saldo,
        saldo > 0 ? "Debe" : (saldo < 0 ? "A favor" : "Al día")
      ]);
    });
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenFilas);
    wsResumen["!cols"] = [{wch:22},{wch:16},{wch:26},{wch:14},{wch:14},{wch:14},{wch:14},{wch:10}];
    const nombreResumen = nombreHojaValido("Resumen Deudores", usados);
    XLSX.utils.book_append_sheet(wb, wsResumen, nombreResumen);

    // Una hoja por deudor con su historial
    estado.deudores.forEach(d => {
      const nombreHoja = nombreHojaValido(d.nombre, usados);
      const ws = XLSX.utils.aoa_to_sheet(filasHistorialParaExcel(d));
      ws["!cols"] = [{wch:12},{wch:30},{wch:10},{wch:10},{wch:12},{wch:14}];
      XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    });
  }

  if(estado.propiedades.length > 0){
    // Hoja resumen de propiedades
    const resumenPropFilas = [["Propiedad","Arrendatario","Teléfono","Canon mensual","Total cargos","Total abonado","Saldo actual","Estado"]];
    estado.propiedades.forEach(p => {
      const totalCargos = p.transacciones.filter(t => t.tipo === "cargo").reduce((a,t) => a + t.monto, 0);
      const totalAbonado = p.transacciones.filter(t => t.tipo === "abono").reduce((a,t) => a + t.monto, 0);
      const saldo = totalCargos - totalAbonado;
      resumenPropFilas.push([
        p.nombre, p.arrendatario, p.telefono || "", p.canon,
        totalCargos, totalAbonado, saldo,
        saldo > 0 ? "Debe" : (saldo < 0 ? "A favor" : "Al día")
      ]);
    });
    const wsResumenProp = XLSX.utils.aoa_to_sheet(resumenPropFilas);
    wsResumenProp["!cols"] = [{wch:22},{wch:20},{wch:16},{wch:14},{wch:14},{wch:14},{wch:14},{wch:10}];
    const nombreResumenProp = nombreHojaValido("Resumen Alquileres", usados);
    XLSX.utils.book_append_sheet(wb, wsResumenProp, nombreResumenProp);

    // Una hoja por propiedad con su historial
    estado.propiedades.forEach(p => {
      const nombreHoja = nombreHojaValido(p.nombre, usados);
      const ws = XLSX.utils.aoa_to_sheet(filasHistorialParaExcelProp(p));
      ws["!cols"] = [{wch:12},{wch:30},{wch:16},{wch:12},{wch:14}];
      XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
    });
  }

  XLSX.writeFile(wb, `cuentas-x-cobrar-${hoyISO()}.xlsx`);
  mostrarToast("Excel exportado.");
}

/* ==========================================================
   Ingresos por Alquileres
   ========================================================== */

/* ---------- Cambio de modo (pestañas) ---------- */
function cambiarModo(modo){
  modoActual = modo;
  document.getElementById("vistaDeudores").hidden = modo !== "deudores";
  document.getElementById("vistaPropiedades").hidden = modo !== "propiedades";
  document.getElementById("tabDeudores").classList.toggle("activo", modo === "deudores");
  document.getElementById("tabPropiedades").classList.toggle("activo", modo === "propiedades");
}

/* ---------- Cálculos ---------- */
function calcularSaldoPropiedad(p){
  return p.transacciones.reduce((acc,t) => acc + (t.tipo === "cargo" ? t.monto : -t.monto), 0);
}

function ultimoMovimientoProp(p){
  if(p.transacciones.length === 0) return null;
  return [...p.transacciones].sort((a,b) => b.fecha.localeCompare(a.fecha))[0];
}

/* ---------- Vencimientos automáticos del canon ---------- */
function sumarUnMes(fechaISO){
  const [y,m,d] = fechaISO.split("-").map(Number);
  let ny = y, nm = m + 1;
  if(nm > 12){ nm = 1; ny += 1; }
  const ultimoDia = new Date(ny, nm, 0).getDate(); // día 0 del mes siguiente = último día de nm
  const nd = Math.min(d, ultimoDia);
  return `${ny}-${String(nm).padStart(2,"0")}-${String(nd).padStart(2,"0")}`;
}

async function procesarVencimientosAutomaticos(){
  const user = auth.currentUser;
  if(!user) return;
  const docRef = db.collection(COLECCION).doc(user.uid);
  try{
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if(!snap.exists) return;
      const data = snap.data();
      if(!Array.isArray(data.propiedades) || data.propiedades.length === 0) return;
      const hoy = hoyISO();
      let cambios = false;
      const propiedades = data.propiedades.map((p) => {
        if(!p.proximoVencimiento || !p.canon) return p;
        let prox = p.proximoVencimiento;
        const transacciones = [...(p.transacciones || [])];
        let iter = 0;
        while(prox <= hoy && iter < 60){
          transacciones.push({
            id: generarId(),
            fecha: prox,
            tipo: "cargo",
            concepto: "Pago",
            monto: p.canon,
            automatico: true
          });
          prox = sumarUnMes(prox);
          cambios = true;
          iter++;
        }
        return cambios ? { ...p, transacciones, proximoVencimiento: prox } : p;
      });
      if(cambios) tx.update(docRef, { propiedades });
    });
  }catch(e){
    console.error("Error procesando vencimientos automáticos:", e);
  }
}

/* ---------- Resumen + lista ---------- */
function renderResumenPropiedades(){
  const totalPorCobrar = estado.propiedades.reduce((acc,p) => {
    const s = calcularSaldoPropiedad(p);
    return acc + (s > 0 ? s : 0);
  }, 0);
  const canonTotal = estado.propiedades.reduce((acc,p) => acc + (p.canon || 0), 0);
  const activas = estado.propiedades.filter(p => calcularSaldoPropiedad(p) > 0).length;
  const alDia = estado.propiedades.filter(p => calcularSaldoPropiedad(p) <= 0).length;

  document.getElementById("sumPropPorCobrar").textContent = fmtMoneda.format(totalPorCobrar);
  document.getElementById("sumPropCanonTotal").textContent = fmtMoneda.format(canonTotal);
  document.getElementById("sumPropActivas").textContent = estado.propiedades.length;
  document.getElementById("sumPropAlDia").textContent = alDia;
}

function renderListaPropiedades(){
  const contenedor = document.getElementById("listaPropiedades");
  const vacio = document.getElementById("estadoVacioProp");
  const busqueda = document.getElementById("buscadorProp").value.trim().toLowerCase();
  const orden = document.getElementById("ordenSelectProp").value;

  let lista = estado.propiedades.filter(p => {
    if(!busqueda) return true;
    return (p.nombre || "").toLowerCase().includes(busqueda)
      || (p.arrendatario || "").toLowerCase().includes(busqueda)
      || (p.telefono || "").toLowerCase().includes(busqueda);
  });

  lista = lista.map(p => ({ p, saldo: calcularSaldoPropiedad(p) }));

  if(orden === "saldo-desc") lista.sort((a,b) => b.saldo - a.saldo);
  else if(orden === "nombre-asc") lista.sort((a,b) => a.p.nombre.localeCompare(b.p.nombre));
  else if(orden === "reciente") lista.sort((a,b) => b.p.fechaCreacion.localeCompare(a.p.fechaCreacion));

  if(estado.propiedades.length === 0){
    contenedor.innerHTML = "";
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  contenedor.innerHTML = lista.map(({p, saldo}) => {
    const ultimo = ultimoMovimientoProp(p);
    let selloClase = "aldia", selloTexto = "AL DÍA";
    if(saldo > 0){ selloClase = "debe"; selloTexto = fmtMoneda.format(saldo); }
    else if(saldo < 0){ selloClase = "favor"; selloTexto = "A FAVOR " + fmtMoneda.format(Math.abs(saldo)); }

    return `
      <article class="tarjeta-deudor" data-id="${p.id}">
        <div class="tarjeta-top">
          <div>
            <p class="tarjeta-nombre">${escapeHTML(p.nombre)}</p>
            <p class="tarjeta-meta">${escapeHTML(p.arrendatario)} · Canon ${fmtMoneda.format(p.canon)}/mes</p>
          </div>
          <span class="sello ${selloClase}">${selloTexto}</span>
        </div>
        <p class="tarjeta-vencimiento">Próximo cobro automático: <strong>${fmtFecha(p.proximoVencimiento)}</strong></p>
        ${ultimo ? `<p class="tarjeta-ultimo">Último movimiento: ${fmtFecha(ultimo.fecha)} · ${ultimo.tipo === "cargo" ? "cargo" : "abono"} de ${fmtMoneda.format(ultimo.monto)}</p>` : `<p class="tarjeta-ultimo">Sin movimientos todavía</p>`}
      </article>
    `;
  }).join("");

  contenedor.querySelectorAll(".tarjeta-deudor").forEach(el => {
    el.addEventListener("click", () => abrirDetallePropiedad(el.dataset.id));
  });
}

/* ---------- Panel de detalle de propiedad ---------- */
function abrirDetallePropiedad(id){
  propiedadActivaId = id;
  document.getElementById("formTransaccionProp").hidden = true;
  document.getElementById("detallePropEditar").hidden = true;
  document.getElementById("overlayDetallePropiedad").hidden = false;
  renderDetallePropiedad();
}

function cerrarDetallePropiedad(){
  propiedadActivaId = null;
  document.getElementById("overlayDetallePropiedad").hidden = true;
}

function getPropiedadActiva(){
  return estado.propiedades.find(p => p.id === propiedadActivaId);
}

function renderDetallePropiedad(){
  const p = getPropiedadActiva();
  if(!p){ cerrarDetallePropiedad(); return; }

  const saldo = calcularSaldoPropiedad(p);
  const sello = document.getElementById("detallePropSello");
  sello.className = "detalle-sello";
  if(saldo > 0){ sello.classList.add("debe"); sello.textContent = fmtMoneda.format(saldo) + " pendiente"; }
  else if(saldo < 0){ sello.classList.add("favor"); sello.textContent = "A favor " + fmtMoneda.format(Math.abs(saldo)); }
  else { sello.classList.add("aldia"); sello.textContent = "Al día"; }

  document.getElementById("detallePropNombre").textContent = p.nombre;
  const metaPartes = [p.arrendatario];
  if(p.telefono) metaPartes.push(p.telefono);
  if(p.notas) metaPartes.push(p.notas);
  document.getElementById("detallePropMeta").textContent = metaPartes.join(" · ");
  document.getElementById("detallePropCanonInfo").textContent =
    `Canon: ${fmtMoneda.format(p.canon)}/mes · Próximo cobro automático: ${fmtFecha(p.proximoVencimiento)}`;

  const tbody = document.getElementById("tablaHistorialPropBody");
  const historialVacio = document.getElementById("historialPropVacio");
  const ordenadas = [...p.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  if(ordenadas.length === 0){
    tbody.innerHTML = "";
    historialVacio.hidden = false;
  } else {
    historialVacio.hidden = true;
    let acumulado = 0;
    const filas = ordenadas.map(t => {
      acumulado += (t.tipo === "cargo" ? t.monto : -t.monto);
      const signo = t.tipo === "cargo" ? "+" : "−";
      const claseMonto = t.tipo === "cargo" ? "monto-deuda" : "monto-abono";
      return `
        <tr data-txid="${t.id}">
          <td>${fmtFecha(t.fecha)}</td>
          <td>${escapeHTML(t.concepto || (t.tipo === "cargo" ? "Cargo" : "Abono"))}
            <span class="tx-concepto-tipo">${t.tipo === "cargo" ? "Cargo" : "Abono"}${t.automatico ? '<span class="tx-automatica">automático</span>' : ""}</span>
          </td>
          <td class="col-monto ${claseMonto}">${signo} ${fmtMoneda.format(t.monto)}</td>
          <td class="col-monto">${fmtMoneda.format(acumulado)}</td>
          <td class="col-acciones-tx">
            <button class="btn-editar-tx" data-txid="${t.id}" title="Editar movimiento" aria-label="Editar movimiento">✎</button>
            <button class="btn-borrar-tx" data-txid="${t.id}" title="Eliminar movimiento" aria-label="Eliminar movimiento">✕</button>
          </td>
        </tr>
      `;
    }).reverse();
    tbody.innerHTML = filas.join("");
    tbody.querySelectorAll(".btn-borrar-tx").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); eliminarTransaccionProp(btn.dataset.txid); });
    });
    tbody.querySelectorAll(".btn-editar-tx").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); editarTxDirecto(btn.dataset.txid, "propiedad"); });
    });
    tbody.querySelectorAll("tr[data-txid]").forEach(tr => {
      tr.addEventListener("click", () => abrirTxDetalle(tr.dataset.txid, "propiedad"));
    });
  }
}

function eliminarTransaccionProp(txId){
  const p = getPropiedadActiva();
  if(!p) return;
  if(!confirm("¿Eliminar este movimiento del historial? Esta acción no se puede deshacer.")) return;
  p.transacciones = p.transacciones.filter(t => t.id !== txId);
  guardarEstado();
  render();
}

/* ---------- Editar datos de la propiedad ---------- */
function abrirEdicionProp(){
  const p = getPropiedadActiva();
  document.getElementById("editPropNombre").value = p.nombre;
  document.getElementById("editPropArrendatario").value = p.arrendatario;
  document.getElementById("editPropTelefono").value = p.telefono || "";
  document.getElementById("editPropCanon").value = p.canon;
  document.getElementById("editPropVencimiento").value = p.proximoVencimiento;
  document.getElementById("editPropNotas").value = p.notas || "";
  document.getElementById("detallePropEditar").hidden = false;
}

function guardarEdicionProp(){
  const p = getPropiedadActiva();
  const nombre = document.getElementById("editPropNombre").value.trim();
  const arrendatario = document.getElementById("editPropArrendatario").value.trim();
  const canon = parseFloat(document.getElementById("editPropCanon").value);
  const vencimiento = document.getElementById("editPropVencimiento").value;
  if(!nombre || !arrendatario){ mostrarToast("El nombre y el arrendatario no pueden quedar vacíos."); return; }
  if(isNaN(canon) || canon <= 0){ mostrarToast("Ingresa un canon de arrendamiento válido."); return; }
  if(!vencimiento){ mostrarToast("Ingresa la fecha de próximo vencimiento."); return; }
  p.nombre = nombre;
  p.arrendatario = arrendatario;
  p.telefono = document.getElementById("editPropTelefono").value.trim();
  p.canon = Math.round(canon * 100) / 100;
  p.proximoVencimiento = vencimiento;
  p.notas = document.getElementById("editPropNotas").value.trim();
  guardarEstado();
  document.getElementById("detallePropEditar").hidden = true;
  render();
  mostrarToast("Datos actualizados.");
}

function eliminarPropiedad(){
  const p = getPropiedadActiva();
  if(!confirm(`¿Eliminar la propiedad "${p.nombre}" y todo su historial? Esta acción no se puede deshacer.`)) return;
  estado.propiedades = estado.propiedades.filter(x => x.id !== p.id);
  guardarEstado();
  cerrarDetallePropiedad();
  render();
  mostrarToast("Propiedad eliminada.");
}

/* ---------- Formulario de transacción (cargo / abono) ---------- */
function abrirFormTxProp(tipo){
  modoTxProp = tipo;
  const form = document.getElementById("formTransaccionProp");
  document.getElementById("formTransaccionPropTitulo").textContent = tipo === "cargo" ? "Registrar cargo" : "Registrar abono";
  document.getElementById("txPropMonto").value = "";
  document.getElementById("txPropConcepto").value = "";
  document.getElementById("txPropConcepto").placeholder = tipo === "cargo" ? "Ej: préstamo, reparación, otro cargo…" : "Ej: abono en efectivo, pago parcial…";
  document.getElementById("txPropFecha").value = hoyISO();
  form.hidden = false;
  document.getElementById("txPropMonto").focus();
}

function cancelarFormTxProp(){
  document.getElementById("formTransaccionProp").hidden = true;
  modoTxProp = null;
}

function guardarTxProp(ev){
  ev.preventDefault();
  const p = getPropiedadActiva();
  const monto = parseFloat(document.getElementById("txPropMonto").value);
  if(isNaN(monto) || monto <= 0){ mostrarToast("Ingresa un monto válido."); return; }
  const fecha = document.getElementById("txPropFecha").value || hoyISO();
  const concepto = document.getElementById("txPropConcepto").value.trim();

  p.transacciones.push({
    id: generarId(),
    fecha,
    tipo: modoTxProp,
    concepto,
    monto: Math.round(monto * 100) / 100,
    automatico: false
  });
  guardarEstado();
  cancelarFormTxProp();
  render();
  mostrarToast(modoTxProp === "cargo" ? "Cargo registrado." : "Abono registrado.");
}

/* ---------- Nueva propiedad ---------- */
function abrirModalNuevaPropiedad(){
  document.getElementById("formNuevaPropiedad").reset();
  document.getElementById("nuevoPropMontoInicial").value = "0";
  document.getElementById("nuevoPropVencimiento").value = hoyISO();
  document.getElementById("overlayNuevaPropiedad").hidden = false;
  document.getElementById("nuevoPropNombre").focus();
}
function cerrarModalNuevaPropiedad(){
  document.getElementById("overlayNuevaPropiedad").hidden = true;
}

function guardarNuevaPropiedad(ev){
  ev.preventDefault();
  const nombre = document.getElementById("nuevoPropNombre").value.trim();
  const arrendatario = document.getElementById("nuevoPropArrendatario").value.trim();
  const canon = parseFloat(document.getElementById("nuevoPropCanon").value);
  const vencimiento = document.getElementById("nuevoPropVencimiento").value;
  if(!nombre || !arrendatario){ mostrarToast("El nombre y el arrendatario son obligatorios."); return; }
  if(isNaN(canon) || canon <= 0){ mostrarToast("Ingresa un canon de arrendamiento válido."); return; }
  if(!vencimiento){ mostrarToast("Ingresa la fecha de vencimiento."); return; }

  const montoInicial = parseFloat(document.getElementById("nuevoPropMontoInicial").value) || 0;
  const nueva = {
    id: generarId(),
    nombre,
    arrendatario,
    telefono: document.getElementById("nuevoPropTelefono").value.trim(),
    notas: document.getElementById("nuevoPropNotas").value.trim(),
    canon: Math.round(canon * 100) / 100,
    fechaCreacion: hoyISO(),
    proximoVencimiento: vencimiento,
    transacciones: []
  };

  if(montoInicial > 0){
    nueva.transacciones.push({
      id: generarId(),
      fecha: hoyISO(),
      tipo: "cargo",
      concepto: document.getElementById("nuevoPropConceptoInicial").value.trim() || "Deuda inicial",
      monto: Math.round(montoInicial * 100) / 100,
      automatico: false
    });
  }

  estado.propiedades.push(nueva);
  guardarEstado().then(() => procesarVencimientosAutomaticos());
  cerrarModalNuevaPropiedad();
  render();
  mostrarToast("Propiedad agregada.");
}

/* ---------- Estado de cuenta detallado (propiedad) ---------- */
function construirEstadoCuentaHTMLProp(p){
  const ordenadas = [...p.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  let acumulado = 0;
  const filas = ordenadas.map(t => {
    acumulado += (t.tipo === "cargo" ? t.monto : -t.monto);
    const signo = t.tipo === "cargo" ? "+" : "−";
    return `
      <tr>
        <td>${fmtFecha(t.fecha)}</td>
        <td>${escapeHTML(t.concepto || (t.tipo === "cargo" ? "Cargo" : "Abono"))}</td>
        <td>${t.tipo === "cargo" ? "Cargo" : "Abono"}${t.automatico ? " (automático)" : ""}</td>
        <td class="col-monto">${signo} ${fmtMoneda.format(t.monto)}</td>
        <td class="col-monto">${fmtMoneda.format(acumulado)}</td>
      </tr>
    `;
  }).join("");

  const totalCargos = p.transacciones.filter(t => t.tipo === "cargo").reduce((a,t) => a + t.monto, 0);
  const totalAbonado = p.transacciones.filter(t => t.tipo === "abono").reduce((a,t) => a + t.monto, 0);
  const saldoFinal = totalCargos - totalAbonado;

  const filasVacias = ordenadas.length === 0
    ? `<tr><td colspan="5" style="text-align:center; color:var(--ink-soft); padding:16px 0;">Sin movimientos todavía.</td></tr>`
    : filas;

  return `
    <div class="estado-doc">
      <div class="estado-doc-header">
        <div>
          <p class="estado-doc-marca">Cuentas <span>×</span> Cobrar</p>
          <p class="estado-doc-titulo">Estado de Cuenta — Alquiler</p>
        </div>
        <div class="estado-doc-emision">
          Emitido: ${fmtFecha(hoyISO())}
        </div>
      </div>

      <dl class="estado-doc-datos">
        <div><dt>Propiedad</dt><dd>${escapeHTML(p.nombre)}</dd></div>
        <div><dt>Arrendatario</dt><dd>${escapeHTML(p.arrendatario)}</dd></div>
        <div><dt>Teléfono</dt><dd>${p.telefono ? escapeHTML(p.telefono) : "—"}</dd></div>
        <div><dt>Canon mensual</dt><dd>${fmtMoneda.format(p.canon)}</dd></div>
      </dl>

      <table class="estado-doc-tabla">
        <thead>
          <tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th class="col-monto">Monto</th><th class="col-monto">Saldo</th></tr>
        </thead>
        <tbody>${filasVacias}</tbody>
      </table>

      <div class="estado-doc-resumen">
        <div><span>Total cargos</span><span class="valor">${fmtMoneda.format(totalCargos)}</span></div>
        <div><span>Total abonado</span><span class="valor">${fmtMoneda.format(totalAbonado)}</span></div>
        <div><span>Saldo pendiente</span><span class="valor">${fmtMoneda.format(saldoFinal)}</span></div>
      </div>

      <p class="estado-doc-footer">Documento generado por Cuentas × Cobrar el ${fmtFecha(hoyISO())}.</p>
    </div>
  `;
}

function abrirEstadoCuentaProp(){
  const p = getPropiedadActiva();
  if(!p) return;
  estadoCuentaContexto = "propiedad";
  document.getElementById("estadoCuentaContenido").innerHTML = construirEstadoCuentaHTMLProp(p);
  document.getElementById("overlayEstado").hidden = false;
}

/* ---------- Exportar a Excel (propiedad) ---------- */
function filasHistorialParaExcelProp(p){
  const ordenadas = [...p.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  let acumulado = 0;
  const filas = [["Fecha","Concepto","Tipo","Monto","Saldo acumulado"]];
  ordenadas.forEach(t => {
    acumulado += (t.tipo === "cargo" ? t.monto : -t.monto);
    filas.push([
      fmtFecha(t.fecha),
      t.concepto || (t.tipo === "cargo" ? "Cargo" : "Abono"),
      (t.tipo === "cargo" ? "Cargo" : "Abono") + (t.automatico ? " (automático)" : ""),
      t.tipo === "cargo" ? t.monto : -t.monto,
      acumulado
    ]);
  });
  return filas;
}

function exportarPropiedadExcel(p){
  if(typeof XLSX === "undefined"){ mostrarToast("No se pudo cargar el módulo de Excel. Revisa tu conexión a internet."); return; }
  const totalCargos = p.transacciones.filter(t => t.tipo === "cargo").reduce((a,t) => a + t.monto, 0);
  const totalAbonado = p.transacciones.filter(t => t.tipo === "abono").reduce((a,t) => a + t.monto, 0);

  const encabezado = [
    ["Cuentas x Cobrar — Estado de Cuenta de Alquiler"],
    ["Propiedad", p.nombre],
    ["Arrendatario", p.arrendatario],
    ["Teléfono", p.telefono || ""],
    ["Canon mensual", p.canon],
    ["Emitido", fmtFecha(hoyISO())],
    []
  ];
  const filas = filasHistorialParaExcelProp(p);
  const cierre = [
    [],
    ["Total cargos", totalCargos],
    ["Total abonado", totalAbonado],
    ["Saldo pendiente", totalCargos - totalAbonado]
  ];

  const ws = XLSX.utils.aoa_to_sheet([...encabezado, ...filas, ...cierre]);
  ws["!cols"] = [{wch:14},{wch:32},{wch:16},{wch:14},{wch:16}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estado de cuenta");
  XLSX.writeFile(wb, `estado-de-cuenta-${p.nombre.replace(/[^\w\- ]/g,"").trim() || "propiedad"}.xlsx`);
  mostrarToast("Excel exportado.");
}

/* ==========================================================
   Exportar / importar respaldo
   ========================================================== */
function exportarRespaldo(){
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fecha = hoyISO();
  a.href = url;
  a.download = `cuentas-x-cobrar-respaldo-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  mostrarToast("Respaldo descargado.");
}

function importarRespaldo(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!Array.isArray(data.deudores)) throw new Error("Formato inválido");
      if(!Array.isArray(data.propiedades)) data.propiedades = [];
      if(!confirm("Esto reemplazará todos los datos actuales por los del archivo. ¿Continuar?")) return;
      estado = data;
      guardarEstado();
      render();
      mostrarToast("Respaldo importado correctamente.");
    }catch(e){
      mostrarToast("El archivo no tiene un formato válido.");
      console.error(e);
    }
  };
  reader.readAsText(file);
  ev.target.value = "";
}

/* ==========================================================
   Eventos
   ========================================================== */
document.getElementById("btnNuevoDeudor").addEventListener("click", abrirModalNuevo);
document.getElementById("btnNuevoDeudorVacio").addEventListener("click", abrirModalNuevo);
document.getElementById("btnCerrarNuevo").addEventListener("click", cerrarModalNuevo);
document.getElementById("btnCancelarNuevo").addEventListener("click", cerrarModalNuevo);
document.getElementById("overlayNuevo").addEventListener("click", (e) => { if(e.target.id === "overlayNuevo") cerrarModalNuevo(); });
document.getElementById("formNuevoDeudor").addEventListener("submit", guardarNuevoDeudor);

document.getElementById("btnCerrarDetalle").addEventListener("click", cerrarDetalle);
document.getElementById("overlayDetalle").addEventListener("click", (e) => { if(e.target.id === "overlayDetalle") cerrarDetalle(); });

document.getElementById("btnEditarDeudor").addEventListener("click", abrirEdicion);
document.getElementById("btnGuardarEdicion").addEventListener("click", guardarEdicion);
document.getElementById("btnCancelarEdicion").addEventListener("click", () => { document.getElementById("detalleEditar").hidden = true; });
document.getElementById("btnEliminarDeudor").addEventListener("click", eliminarDeudor);

document.getElementById("btnVerEstadoCuenta").addEventListener("click", abrirEstadoCuenta);
document.getElementById("btnCerrarEstado").addEventListener("click", cerrarEstadoCuenta);
document.getElementById("overlayEstado").addEventListener("click", (e) => { if(e.target.id === "overlayEstado") cerrarEstadoCuenta(); });
document.getElementById("btnImprimirEstado").addEventListener("click", () => window.print());
document.getElementById("btnExportarEstadoExcel").addEventListener("click", () => {
  if(estadoCuentaContexto === "propiedad"){
    const p = getPropiedadActiva();
    if(p) exportarPropiedadExcel(p);
  } else {
    const d = getDeudorActivo();
    if(d) exportarDeudorExcel(d);
  }
});
document.getElementById("btnExportarExcelTodo").addEventListener("click", exportarTodoExcel);

document.getElementById("btnCerrarTxDetalle").addEventListener("click", cerrarTxDetalle);
document.getElementById("overlayTxDetalle").addEventListener("click", (e) => { if(e.target.id === "overlayTxDetalle") cerrarTxDetalle(); });
document.getElementById("btnEditarTx").addEventListener("click", abrirEditarTx);
document.getElementById("btnCancelarEditTx").addEventListener("click", cancelarEditarTx);
document.getElementById("formEditarTx").addEventListener("submit", guardarEditarTx);
document.getElementById("btnEliminarTxDetalle").addEventListener("click", eliminarTxDesdeDetalle);

document.getElementById("btnRegistrarDeuda").addEventListener("click", () => abrirFormTx("deuda"));
document.getElementById("btnRegistrarAbono").addEventListener("click", () => abrirFormTx("abono"));
document.getElementById("btnCancelarTx").addEventListener("click", cancelarFormTx);
document.getElementById("formTransaccion").addEventListener("submit", guardarTx);

document.getElementById("buscador").addEventListener("input", renderLista);
document.getElementById("ordenSelect").addEventListener("change", renderLista);

document.getElementById("btnExportar").addEventListener("click", exportarRespaldo);
document.getElementById("inputImportar").addEventListener("change", importarRespaldo);

document.getElementById("tabDeudores").addEventListener("click", () => cambiarModo("deudores"));
document.getElementById("tabPropiedades").addEventListener("click", () => cambiarModo("propiedades"));

document.getElementById("btnNuevaPropiedad").addEventListener("click", abrirModalNuevaPropiedad);
document.getElementById("btnNuevaPropiedadVacio").addEventListener("click", abrirModalNuevaPropiedad);
document.getElementById("btnCerrarNuevaPropiedad").addEventListener("click", cerrarModalNuevaPropiedad);
document.getElementById("btnCancelarNuevaPropiedad").addEventListener("click", cerrarModalNuevaPropiedad);
document.getElementById("overlayNuevaPropiedad").addEventListener("click", (e) => { if(e.target.id === "overlayNuevaPropiedad") cerrarModalNuevaPropiedad(); });
document.getElementById("formNuevaPropiedad").addEventListener("submit", guardarNuevaPropiedad);

document.getElementById("btnCerrarDetallePropiedad").addEventListener("click", cerrarDetallePropiedad);
document.getElementById("overlayDetallePropiedad").addEventListener("click", (e) => { if(e.target.id === "overlayDetallePropiedad") cerrarDetallePropiedad(); });
document.getElementById("btnEditarPropiedad").addEventListener("click", abrirEdicionProp);
document.getElementById("btnGuardarEdicionProp").addEventListener("click", guardarEdicionProp);
document.getElementById("btnCancelarEdicionProp").addEventListener("click", () => { document.getElementById("detallePropEditar").hidden = true; });
document.getElementById("btnVerEstadoCuentaProp").addEventListener("click", abrirEstadoCuentaProp);
document.getElementById("btnEliminarPropiedad").addEventListener("click", eliminarPropiedad);

document.getElementById("btnRegistrarCargo").addEventListener("click", () => abrirFormTxProp("cargo"));
document.getElementById("btnRegistrarAbonoProp").addEventListener("click", () => abrirFormTxProp("abono"));
document.getElementById("btnCancelarTxProp").addEventListener("click", cancelarFormTxProp);
document.getElementById("formTransaccionProp").addEventListener("submit", guardarTxProp);

document.getElementById("buscadorProp").addEventListener("input", renderListaPropiedades);
document.getElementById("ordenSelectProp").addEventListener("change", renderListaPropiedades);

document.addEventListener("keydown", (e) => {
  if(e.key === "Escape"){
    if(!document.getElementById("overlayDetalle").hidden) cerrarDetalle();
    if(!document.getElementById("overlayNuevo").hidden) cerrarModalNuevo();
    if(!document.getElementById("overlayEstado").hidden) cerrarEstadoCuenta();
    if(!document.getElementById("overlayTxDetalle").hidden) cerrarTxDetalle();
    if(!document.getElementById("overlayDetallePropiedad").hidden) cerrarDetallePropiedad();
    if(!document.getElementById("overlayNuevaPropiedad").hidden) cerrarModalNuevaPropiedad();
  }
});

/* ==========================================================
   Autenticación
   ========================================================== */
const MENSAJES_ERROR_AUTH = {
  "auth/invalid-email": "El correo no parece válido.",
  "auth/user-not-found": "No existe una cuenta con ese correo.",
  "auth/wrong-password": "La contraseña es incorrecta.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Intenta iniciar sesión.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento y vuelve a intentar.",
  "auth/network-request-failed": "No hay conexión a internet."
};

function mostrarErrorAuth(err){
  const el = document.getElementById("authError");
  el.style.background = "";
  el.style.color = "";
  el.textContent = MENSAJES_ERROR_AUTH[err.code] || "No se pudo completar la acción. Intenta de nuevo.";
  el.hidden = false;
}

function limpiarErrorAuth(){
  document.getElementById("authError").hidden = true;
}

function actualizarUIAuthModo(){
  const submit = document.getElementById("btnAuthSubmit");
  const toggleTexto = document.getElementById("authToggleTexto");
  const toggleBtn = document.getElementById("btnAuthToggle");
  if(modoAuth === "login"){
    submit.textContent = "Iniciar sesión";
    toggleTexto.textContent = "¿Primera vez aquí?";
    toggleBtn.textContent = "Crear cuenta";
  } else {
    submit.textContent = "Crear cuenta";
    toggleTexto.textContent = "¿Ya tienes una cuenta?";
    toggleBtn.textContent = "Iniciar sesión";
  }
}

function alternarModoAuth(){
  modoAuth = modoAuth === "login" ? "signup" : "login";
  limpiarErrorAuth();
  actualizarUIAuthModo();
}

function enviarFormAuth(ev){
  ev.preventDefault();
  limpiarErrorAuth();
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const boton = document.getElementById("btnAuthSubmit");
  boton.disabled = true;

  const accion = modoAuth === "signup"
    ? auth.createUserWithEmailAndPassword(email, password)
    : auth.signInWithEmailAndPassword(email, password);

  accion
    .catch((err) => mostrarErrorAuth(err))
    .finally(() => { boton.disabled = false; });
}

function cerrarSesion(){
  if(!confirm("¿Cerrar sesión en este dispositivo?")) return;
  auth.signOut();
}

function enviarRecuperacionContrasena(){
  limpiarErrorAuth();
  const email = document.getElementById("authEmail").value.trim();
  if(!email){
    const el = document.getElementById("authError");
    el.textContent = "Escribe tu correo arriba primero, y luego toca este enlace.";
    el.hidden = false;
    return;
  }
  auth.sendPasswordResetEmail(email)
    .then(() => {
      const el = document.getElementById("authError");
      el.style.background = "var(--paid-green-bg)";
      el.style.color = "var(--paid-green)";
      el.textContent = "Te enviamos un correo con instrucciones para restablecer tu contraseña.";
      el.hidden = false;
    })
    .catch((err) => mostrarErrorAuth(err));
}

document.getElementById("formAuth").addEventListener("submit", enviarFormAuth);
document.getElementById("btnAuthToggle").addEventListener("click", alternarModoAuth);
document.getElementById("btnOlvideContrasena").addEventListener("click", enviarRecuperacionContrasena);
document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);

auth.onAuthStateChanged((user) => {
  if(user){
    document.getElementById("authGate").hidden = true;
    document.getElementById("appContent").hidden = false;
    document.getElementById("authUsuario").textContent = user.email;
    document.getElementById("formAuth").reset();
    limpiarErrorAuth();
    suscribirEstado(user.uid);
    procesarVencimientosAutomaticos();
  } else {
    if(unsuscribirEstado){ unsuscribirEstado(); unsuscribirEstado = null; }
    estado = { deudores: [], propiedades: [] };
    deudorActivoId = null;
    propiedadActivaId = null;
    document.getElementById("appContent").hidden = true;
    document.getElementById("authGate").hidden = false;
  }
});

document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && auth.currentUser){
    procesarVencimientosAutomaticos();
  }
});
