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

/* ---------- Estado ---------- */
let estado = { deudores: [] };
let deudorActivoId = null;
let modoTx = null; // 'deuda' | 'abono'
let txDetalleActivoId = null;

function guardarEstado(){
  const user = auth.currentUser;
  if(!user){ mostrarToast("Tu sesión expiró. Vuelve a iniciar sesión."); return; }
  db.collection(COLECCION).doc(user.uid).set(estado).catch((e) => {
    console.error(e);
    mostrarToast("No se pudo guardar en la nube. Revisa tu conexión.");
  });
}

function suscribirEstado(uid){
  if(unsuscribirEstado) unsuscribirEstado();
  unsuscribirEstado = db.collection(COLECCION).doc(uid).onSnapshot(
    (snap) => {
      estado = (snap.exists && Array.isArray(snap.data().deudores)) ? snap.data() : { deudores: [] };
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

/* ---------- Detalle de un movimiento individual ---------- */
function transaccionesOrdenadas(d){
  return [...d.transacciones].sort((a,b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
}

function saldoHastaTx(d, txId){
  let acumulado = 0;
  for(const t of transaccionesOrdenadas(d)){
    acumulado += (t.tipo === "deuda" ? t.monto : -t.monto);
    if(t.id === txId) return acumulado;
  }
  return acumulado;
}

function abrirTxDetalle(txId){
  const d = getDeudorActivo();
  if(!d) return;
  const tx = d.transacciones.find(t => t.id === txId);
  if(!tx) return;
  txDetalleActivoId = txId;
  document.getElementById("formEditarTx").hidden = true;
  document.getElementById("txDetalleAcciones").hidden = false;
  renderTxDetalleVista(d, tx);
  document.getElementById("overlayTxDetalle").hidden = false;
}

function editarTxDirecto(txId){
  abrirTxDetalle(txId);
  abrirEditarTx();
}

function renderTxDetalleVista(d, tx){
  const saldo = saldoHastaTx(d, tx.id);
  document.getElementById("txDetalleTitulo").textContent = tx.tipo === "deuda" ? "Detalle del préstamo" : "Detalle del abono";
  document.getElementById("txDetalleDatos").innerHTML = `
    <dt>Deudor</dt><dd class="no-mono dd-full">${escapeHTML(d.nombre)}</dd>
    <dt>Fecha</dt><dd>${fmtFecha(tx.fecha)}</dd>
    <dt>Tipo</dt><dd class="no-mono">${tx.tipo === "deuda" ? "Préstamo" : "Abono"}</dd>
    ${tx.tipo === "deuda" ? `<dt>Forma</dt><dd class="no-mono">${MODO_LABEL[tx.metodo] || "—"}</dd>` : ""}
    <dt>Monto</dt><dd class="${tx.tipo === "deuda" ? "monto-deuda" : "monto-abono"}">${fmtMoneda.format(tx.monto)}</dd>
    <dt>Concepto</dt><dd class="no-mono dd-full">${tx.concepto ? escapeHTML(tx.concepto) : "—"}</dd>
    <dt>Saldo después de este movimiento</dt><dd class="dd-full">${fmtMoneda.format(saldo)}</dd>
  `;
}

function cerrarTxDetalle(){
  txDetalleActivoId = null;
  document.getElementById("overlayTxDetalle").hidden = true;
}

function getTxActivo(){
  const d = getDeudorActivo();
  if(!d) return null;
  return d.transacciones.find(t => t.id === txDetalleActivoId) || null;
}

function abrirEditarTx(){
  const tx = getTxActivo();
  if(!tx) return;
  document.getElementById("editTxMonto").value = tx.monto;
  document.getElementById("editTxConcepto").value = tx.concepto || "";
  document.getElementById("editTxFecha").value = tx.fecha;
  document.getElementById("labelEditMetodo").hidden = tx.tipo !== "deuda";
  if(tx.tipo === "deuda") document.getElementById("editTxMetodo").value = tx.metodo || "efectivo";
  document.getElementById("txDetalleAcciones").hidden = true;
  document.getElementById("formEditarTx").hidden = false;
}

function cancelarEditarTx(){
  document.getElementById("formEditarTx").hidden = true;
  document.getElementById("txDetalleAcciones").hidden = false;
}

function guardarEditarTx(ev){
  ev.preventDefault();
  const d = getDeudorActivo();
  const tx = getTxActivo();
  if(!d || !tx) return;
  const monto = parseFloat(document.getElementById("editTxMonto").value);
  if(isNaN(monto) || monto <= 0){ mostrarToast("Ingresa un monto válido."); return; }
  tx.monto = Math.round(monto * 100) / 100;
  tx.concepto = document.getElementById("editTxConcepto").value.trim();
  tx.fecha = document.getElementById("editTxFecha").value || tx.fecha;
  if(tx.tipo === "deuda") tx.metodo = document.getElementById("editTxMetodo").value;
  guardarEstado();
  document.getElementById("formEditarTx").hidden = true;
  document.getElementById("txDetalleAcciones").hidden = false;
  renderTxDetalleVista(d, tx);
  render();
  mostrarToast("Movimiento actualizado.");
}

function eliminarTxDesdeDetalle(){
  const d = getDeudorActivo();
  const tx = getTxActivo();
  if(!d || !tx) return;
  if(!confirm("¿Eliminar este movimiento del historial? Esta acción no se puede deshacer.")) return;
  d.transacciones = d.transacciones.filter(t => t.id !== tx.id);
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
  if(estado.deudores.length === 0){ mostrarToast("Todavía no hay deudores para exportar."); return; }

  const wb = XLSX.utils.book_new();

  // Hoja resumen
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
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

  // Una hoja por deudor con su historial
  const usados = new Set(["resumen"]);
  estado.deudores.forEach(d => {
    const nombreHoja = nombreHojaValido(d.nombre, usados);
    const ws = XLSX.utils.aoa_to_sheet(filasHistorialParaExcel(d));
    ws["!cols"] = [{wch:12},{wch:30},{wch:10},{wch:10},{wch:12},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  });

  XLSX.writeFile(wb, `cuentas-x-cobrar-${hoyISO()}.xlsx`);
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
  const d = getDeudorActivo();
  if(d) exportarDeudorExcel(d);
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

document.addEventListener("keydown", (e) => {
  if(e.key === "Escape"){
    if(!document.getElementById("overlayDetalle").hidden) cerrarDetalle();
    if(!document.getElementById("overlayNuevo").hidden) cerrarModalNuevo();
    if(!document.getElementById("overlayEstado").hidden) cerrarEstadoCuenta();
    if(!document.getElementById("overlayTxDetalle").hidden) cerrarTxDetalle();
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

document.getElementById("formAuth").addEventListener("submit", enviarFormAuth);
document.getElementById("btnAuthToggle").addEventListener("click", alternarModoAuth);
document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);

auth.onAuthStateChanged((user) => {
  if(user){
    document.getElementById("authGate").hidden = true;
    document.getElementById("appContent").hidden = false;
    document.getElementById("authUsuario").textContent = user.email;
    document.getElementById("formAuth").reset();
    limpiarErrorAuth();
    suscribirEstado(user.uid);
  } else {
    if(unsuscribirEstado){ unsuscribirEstado(); unsuscribirEstado = null; }
    estado = { deudores: [] };
    deudorActivoId = null;
    document.getElementById("appContent").hidden = true;
    document.getElementById("authGate").hidden = false;
  }
});
