const API = location.protocol.startsWith('http') ? '/api' : 'http://localhost:3001/api';

// ====================== AUTH ADMIN ======================
const _origFetch = window.fetch.bind(window);
window.fetch = (url, opts = {}) => {
    if (typeof url === 'string' && url.includes('/api/')) {
        const token = localStorage.getItem('admin_token');
        if (token) opts.headers = { ...opts.headers, 'Authorization': `Bearer ${token}` };
    }
    return _origFetch(url, opts);
};

async function hacerLogin() {
    const pass = document.getElementById('login-password').value;
    const err  = document.getElementById('login-error');
    if (!pass) { err.textContent = 'Escribe la contraseña'; return; }
    try {
        const res = await _origFetch(`${API}/admin/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass })
        });
        const data = await res.json();
        if (!res.ok) { err.textContent = data.mensaje || 'Contraseña incorrecta'; return; }
        localStorage.setItem('admin_token', data.token);
        document.getElementById('login-overlay').style.display = 'none';
        iniciarApp();
    } catch { err.textContent = 'No se pudo conectar al servidor'; }
}

function cerrarSesion() {
    localStorage.removeItem('admin_token');
    location.reload();
}

function cerrarModal(id) {
    document.getElementById(id).style.display = 'none';
}

function abrirModal(id) {
    document.getElementById(id).style.display = 'flex';
}

// Utilidad para mostrar mensajes
function msg(el, ok, texto) {
    el.className = 'mensaje ' + (ok ? 'exito' : 'error');
    el.textContent = texto;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4500);
}

// --- NAVEGACIÓN ---
function cambiarVista(vista) {
    document.querySelectorAll('.vista').forEach(el => el.classList.remove('activa'));
    document.querySelectorAll('.sidebar a').forEach(el => el.classList.remove('active'));
    document.getElementById(`vista-${vista}`).classList.add('activa');
    document.getElementById(`nav-${vista}`).classList.add('active');

    const cargadores = {
        crear: () => { cargarClientesSelect(); cargarCreadosResumen(); },
        asignar: () => { cargarPedidosPorAsignar(); cargarPedidosMonitor(); },
        prioridad: cargarPrioridad,
        materia: cargarInsumos,
        terminado: cargarProductoTerminado,
        produccion: () => { cargarInsumosReceta(); cargarRecetasProducir(); },
        compras: () => { cargarInsumosCompra(); cargarTicketsCompra(); cargarAnalisisCompras(); },
        contabilidad: () => { cargarBalance('dia'); cargarDeudas(); cargarContabProduccion(); cargarTicketsBalance('dia'); },
        clientes: cargarClientes,
        repartidores: cargarRepartidores,
        frecuencia: cargarFrecuencia,
        'control-carga': cargarControlCarga,
        'deudas-negocio': cargarDeudasNegocio
    };
    if (cargadores[vista]) cargadores[vista]();
}

// ====================== CREAR PEDIDO ======================
async function cargarClientesSelect() {
    try {
        const clientes = await (await fetch(`${API}/clientes`)).json();
        const sel = document.getElementById('cliente_id');
        sel.innerHTML = '<option value="">Selecciona un cliente...</option>';
        clientes.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
    } catch (e) { console.error(e); }
}

async function cargarCreadosResumen() {
    const tbody = document.getElementById('tabla-creados-resumen');
    try {
        const creados = await (await fetch(`${API}/pedidos/creados`)).json();
        tbody.innerHTML = creados.length ? '' : '<tr><td colspan="5">No hay pedidos por asignar.</td></tr>';
        creados.forEach(p => {
            tbody.innerHTML += `<tr><td>#${p.id}</td><td><strong>${p.cliente}</strong></td><td>${p.contenido}</td><td>${p.piezas}</td><td>$${p.total}</td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5">Error al cargar</td></tr>'; }
}

document.getElementById('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        cliente_id: document.getElementById('cliente_id').value,
        contenido: document.getElementById('contenido').value,
        piezas: document.getElementById('piezas').value || 0,
        total: document.getElementById('total').value
    };
    const el = document.getElementById('mensaje-pedido');
    try {
        const res = await fetch(`${API}/pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); cargarCreadosResumen(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

// ====================== ASIGNAR Y MONITOR ======================
let repartidoresCache = [];
async function obtenerRepartidoresCache() {
    if (repartidoresCache.length) return repartidoresCache;
    repartidoresCache = await (await fetch(`${API}/repartidores`)).json();
    return repartidoresCache;
}

async function cargarPedidosPorAsignar() {
    const tbody = document.getElementById('tabla-asignar');
    try {
        const [creados, reps] = await Promise.all([
            (await fetch(`${API}/pedidos/creados`)).json(),
            obtenerRepartidoresCache()
        ]);
        tbody.innerHTML = creados.length ? '' : '<tr><td colspan="7">No hay pedidos por asignar.</td></tr>';
        creados.forEach(p => {
            const opciones = reps.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('');
            tbody.innerHTML += `<tr>
                <td>#${p.id}</td><td><strong>${p.cliente}</strong></td><td>${p.direccion || '-'}</td>
                <td>${p.contenido}</td><td>$${p.total}</td>
                <td><select id="rep-asig-${p.id}" style="padding:6px;"><option value="">Elegir...</option>${opciones}</select></td>
                <td><button style="width:auto; padding:6px 12px; font-size:12px;" onclick="asignarPedido(${p.id})">Asignar</button></td>
            </tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="7">Error al cargar</td></tr>'; }
}

async function asignarPedido(id) {
    const repId = document.getElementById(`rep-asig-${id}`).value;
    const el = document.getElementById('mensaje-asignar');
    if (!repId) return msg(el, false, 'Selecciona un repartidor');
    try {
        const res = await fetch(`${API}/pedidos/${id}/asignar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repartidor_id: repId }) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { cargarPedidosPorAsignar(); cargarPedidosMonitor(); }
    } catch (e) { msg(el, false, 'Error de conexión'); }
}

async function cargarPedidosMonitor() {
    const tbody = document.getElementById('tabla-pedidos-monitor');
    try {
        const pedidos = await (await fetch(`${API}/pedidos`)).json();
        tbody.innerHTML = '';
        pedidos.forEach(p => {
            const color = p.estatus === 'entregado' ? 'green' : (p.estatus === 'reagendado' ? 'orange' : (p.estatus === 'creado' ? 'gray' : (p.estatus === 'cancelado' ? '#dc2626' : 'blue')));
            const accion = p.estatus === 'pendiente'
                ? `<button onclick="entregarAdmin(${p.id})" style="padding:5px 10px; background:#16a34a; font-size:12px; width:auto;">✔️ Entregar</button>` : '-';
            const cancelBtn = !['entregado','cancelado'].includes(p.estatus)
                ? `<button onclick="cancelarPedido(${p.id})" style="padding:4px 8px; background:#dc2626; font-size:11px; width:auto;">✕ Cancelar</button>` : '-';
            const antig = p.dias_antiguedad > 0 ? `${p.dias_antiguedad} días${p.veces_reagendado ? ' · ' + p.veces_reagendado + 'x' : ''}` : 'Hoy';
            tbody.innerHTML += `<tr style="${p.estatus === 'cancelado' ? 'opacity:0.55;' : ''}">
                <td>#${p.id}</td><td><strong>${p.cliente}</strong></td><td>${p.repartidor}</td>
                <td>${p.contenido || '-'}</td><td>$${p.total}</td>
                <td style="color:${color}; font-weight:bold; text-transform:uppercase;">${p.estatus}</td>
                <td>${antig}</td><td>${accion}</td><td>${cancelBtn}</td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="9">Error al cargar el monitor</td></tr>'; }
}

async function entregarAdmin(id) {
    if (!confirm('¿Marcar este pedido como entregado?')) return;
    try {
        const res = await fetch(`${API}/pedidos/${id}/entregar`, { method: 'PATCH' });
        if (res.ok) cargarPedidosMonitor();
    } catch (e) { alert('Error de conexión'); }
}

async function cerrarDia() {
    if (!confirm('¿Cerrar el día?\nTodos los pedidos pendientes se reagendarán automáticamente para hoy.')) return;
    try {
        const res  = await fetch(`${API}/admin/cerrar-dia`, { method: 'POST' });
        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) { cargarPedidosMonitor(); cargarPedidosPorAsignar(); }
    } catch { alert('Error de conexión'); }
}

async function imprimirRuta() {
    try {
        const [pedidos, reps] = await Promise.all([
            fetch(`${API}/pedidos`).then(r => r.json()),
            fetch(`${API}/repartidores`).then(r => r.json())
        ]);
        const hoy = new Date().toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
        const pendientes = pedidos.filter(p => p.estatus === 'pendiente' || p.estatus === 'creado');

        const filas = pendientes.map(p => `
            <tr>
                <td>#${p.id}</td>
                <td><strong>${p.cliente}</strong></td>
                <td>${p.repartidor}</td>
                <td>${p.contenido || '—'}</td>
                <td>${p.piezas || 0}</td>
                <td>$${Number(p.total).toFixed(2)}</td>
                <td style="width:80px; border-bottom:1px solid #ccc;">&nbsp;</td>
            </tr>`).join('');

        const ventana = window.open('', '_blank');
        ventana.document.write(`<!DOCTYPE html><html><head>
            <meta charset="UTF-8">
            <title>Ruta del día — ${hoy}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; }
                h1 { font-size: 1.2rem; margin-bottom: 4px; }
                p  { color: #555; margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #1e293b; color: #fff; padding: 8px; text-align: left; font-size: 12px; }
                td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
                tr:nth-child(even) td { background: #f8fafc; }
                @media print { button { display: none; } }
            </style>
        </head><body>
            <h1>🍪 Ruta del día — POS Galletas</h1>
            <p>${hoy} &nbsp;·&nbsp; ${pendientes.length} pedidos pendientes</p>
            <table>
                <thead><tr><th>Folio</th><th>Cliente</th><th>Repartidor</th><th>Contenido</th><th>Piezas</th><th>Total</th><th>Firma</th></tr></thead>
                <tbody>${filas || '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Sin pedidos pendientes hoy</td></tr>'}</tbody>
            </table>
            <br>
            <button onclick="window.print()" style="padding:10px 24px; background:#1e293b; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px;">🖨️ Imprimir / Guardar PDF</button>
        </body></html>`);
        ventana.document.close();
    } catch { alert('Error al generar la ruta'); }
}

async function cancelarPedido(id) {
    if (!confirm(`¿Cancelar pedido #${id}? Se revertirá el cargo en la cuenta del cliente.`)) return;
    try {
        const res  = await fetch(`${API}/pedidos/${id}/cancelar`, { method: 'PATCH' });
        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) { cargarPedidosMonitor(); cargarPedidosPorAsignar(); }
    } catch { alert('Error de conexión'); }
}

// ====================== PRIORIDAD ======================
async function cargarPrioridad() {
    const tbody = document.getElementById('tabla-prioridad');
    try {
        const pedidos = await (await fetch(`${API}/pedidos/prioritarios`)).json();
        tbody.innerHTML = pedidos.length ? '' : '<tr><td colspan="8">Sin pedidos atrasados. ¡Todo al día! 🎉</td></tr>';
        pedidos.forEach(p => {
            const colorP = p.dias_atraso >= 30 ? '#dc2626' : (p.dias_atraso >= 7 ? '#d97706' : '#2563eb');
            tbody.innerHTML += `<tr>
                <td>#${p.id}</td>
                <td><span style="background:${colorP}; color:white; padding:3px 8px; border-radius:10px; font-size:11px; font-weight:bold;">${p.prioridad}</span></td>
                <td><strong>${p.dias_atraso}</strong></td><td>${p.veces_reagendado}x</td>
                <td>${p.cliente}</td><td>${p.telefono || '-'}</td><td>${p.contenido || '-'}</td><td>${p.repartidor}</td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="8">Error al cargar</td></tr>'; }
}

// ====================== MATERIA PRIMA ======================
async function cargarInsumos() {
    const tbody = document.getElementById('tabla-insumos');
    try {
        const insumos = await (await fetch(`${API}/produccion/insumos`)).json();
        tbody.innerHTML = '';
        let contadorBajo = 0;
        insumos.forEach(i => {
            const stock = parseFloat(i.stock_actual);
            const minimo = parseFloat(i.stock_minimo);
            const bajo = stock < minimo;
            if (bajo) contadorBajo++;
            const estado = bajo
                ? '<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:10px; font-weight:bold;">⚠️ STOCK BAJO</span>'
                : '<span style="background:#dcfce7; color:#166534; padding:4px 10px; border-radius:10px; font-weight:bold;">OK</span>';
            const fmt = n => Number.isInteger(n) ? n : parseFloat(n.toFixed(2));
            tbody.innerHTML += `<tr style="${bajo ? 'background:#fff5f5;' : ''}">
                <td>${i.id}</td><td><strong>${i.nombre}</strong></td><td><small>${i.ubicacion || '-'}</small></td>
                <td>${fmt(stock)} ${i.unidad_medida}</td><td>${fmt(minimo)} ${i.unidad_medida}</td><td>${estado}</td></tr>`;
        });
        const badge = document.getElementById('stock-bajo-badge');
        if (badge) {
            badge.style.display = contadorBajo > 0 ? 'block' : 'none';
            document.getElementById('stock-bajo-count').textContent = contadorBajo;
        }
    } catch (e) { tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>'; }
}

document.getElementById('form-insumo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        nombre: document.getElementById('insumo_nombre').value,
        unidad_medida: document.getElementById('insumo_unidad').value,
        stock_minimo: document.getElementById('insumo_minimo').value || 0,
        ubicacion: document.getElementById('insumo_ubicacion').value
    };
    const el = document.getElementById('mensaje-insumo');
    try {
        const res = await fetch(`${API}/produccion/insumos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); document.getElementById('insumo_unidad').value = 'kg'; document.getElementById('insumo_ubicacion').value = 'Bodega Materia Prima'; cargarInsumos(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

// ====================== PRODUCTO TERMINADO ======================
async function cargarProductoTerminado() {
    const cont = document.getElementById('bodegas-container');
    try {
        const productos = await (await fetch(`${API}/produccion/productos`)).json();
        cont.innerHTML = '';
        [1, 2, 3].forEach(b => {
            const items = productos.filter(p => Number(p.bodega_asignada) === b);
            const filas = items.length
                ? items.map(p => `<tr><td><strong>${p.nombre}</strong><br><small style="color:${p.tipo === 'propio' ? '#8b5cf6' : '#0ea5e9'};">${p.tipo}</small></td><td>$${p.precio_caja}</td><td><strong>${p.stock_actual}</strong> cajas</td></tr>`).join('')
                : '<tr><td colspan="3" style="color:#94a3b8;">Sin productos</td></tr>';
            cont.innerHTML += `<div class="table-container">
                <h3 style="margin-bottom:10px; color:var(--primary);">🏬 Bodega ${b}</h3>
                <table><thead><tr><th>Producto</th><th>Precio</th><th>Stock</th></tr></thead><tbody>${filas}</tbody></table></div>`;
        });

        // Llenar el select de productos de terceros
        const terceros = productos.filter(p => p.tipo === 'tercero');
        const sel = document.getElementById('tercero_producto_id');
        if (sel) {
            sel.innerHTML = terceros.length
                ? '<option value="">Selecciona producto...</option>' + terceros.map(p => `<option value="${p.id}">${p.nombre} (Bodega ${p.bodega_asignada})</option>`).join('')
                : '<option value="">Sin productos de terceros registrados</option>';
        }
    } catch (e) { cont.innerHTML = '<p>Error al cargar el almacén</p>'; }
}

document.getElementById('form-entrada-terceros').addEventListener('submit', async (e) => {
    e.preventDefault();
    const producto_id = document.getElementById('tercero_producto_id').value;
    const cantidad = parseInt(document.getElementById('tercero_cantidad').value);
    const msg = document.getElementById('mensaje-entrada-terceros');
    if (!producto_id || !cantidad) return;
    try {
        const res = await fetch(`${API}/produccion/terceros/entrada`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ producto_id, cantidad })
        });
        const data = await res.json();
        msg.textContent = data.mensaje;
        msg.className = `mensaje ${res.ok ? 'exito' : 'error'}`;
        if (res.ok) {
            e.target.reset();
            cargarProductoTerminado();
        }
    } catch { msg.textContent = 'Error de conexión'; msg.className = 'mensaje error'; }
});

// ====================== PRODUCCIÓN / RECETAS ======================
let recetaTemporal = [];

async function cargarInsumosReceta() {
    try {
        const insumos = await (await fetch(`${API}/produccion/insumos`)).json();
        const sel = document.getElementById('nuevo_prod_insumo');
        sel.innerHTML = '<option value="">Selecciona materia prima...</option>';
        insumos.forEach(i => sel.innerHTML += `<option value="${i.id}">${i.nombre} (${i.unidad_medida})</option>`);
    } catch (e) { console.error(e); }
}

document.getElementById('nuevo_prod_tipo').addEventListener('change', (e) => {
    const esTercero = e.target.value === 'tercero';
    document.getElementById('bloque-receta').style.display = esTercero ? 'none' : 'block';
    document.getElementById('bloque-stock-inicial').style.display = esTercero ? 'block' : 'none';
});

function agregarIngredienteAReceta() {
    const sel = document.getElementById('nuevo_prod_insumo');
    const id = sel.value, nombre = sel.options[sel.selectedIndex].text;
    const cant = document.getElementById('nuevo_prod_cantidad').value;
    if (!id || !cant) return alert('Selecciona materia prima y cantidad.');
    recetaTemporal.push({ insumo_id: parseInt(id), nombre, cantidad_necesaria: parseFloat(cant) });
    sel.value = ''; document.getElementById('nuevo_prod_cantidad').value = '';
    dibujarReceta();
}
function dibujarReceta() {
    document.getElementById('lista-ingredientes-receta').innerHTML =
        recetaTemporal.map((ing, i) => `<li>${ing.cantidad_necesaria} de ${ing.nombre} <button type="button" onclick="quitarIng(${i})" style="background:none; color:red; border:none; cursor:pointer;">[quitar]</button></li>`).join('');
}
function quitarIng(i) { recetaTemporal.splice(i, 1); dibujarReceta(); }

document.getElementById('form-nuevo-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-nuevo-producto');
    const tipo = document.getElementById('nuevo_prod_tipo').value;
    if (tipo === 'propio' && recetaTemporal.length === 0) return msg(el, false, 'Un producto propio necesita al menos un ingrediente.');
    const payload = {
        nombre: document.getElementById('nuevo_prod_nombre').value,
        precio_caja: document.getElementById('nuevo_prod_precio').value,
        tipo,
        bodega_asignada: parseInt(document.getElementById('nuevo_prod_bodega').value),
        receta: tipo === 'propio' ? recetaTemporal : [],
        stock_inicial: document.getElementById('nuevo_prod_stock').value || 0
    };
    try {
        const res = await fetch(`${API}/produccion/nuevo-producto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); recetaTemporal = []; dibujarReceta(); cargarRecetasProducir(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

let recetasCache = [];
async function cargarRecetasProducir() {
    try {
        recetasCache = await (await fetch(`${API}/produccion/recetas`)).json();
        const sel = document.getElementById('producir_producto');
        sel.innerHTML = '<option value="">Selecciona una receta...</option>';
        recetasCache.forEach(p => sel.innerHTML += `<option value="${p.id}">${p.nombre} (stock: ${p.stock_actual})</option>`);
    } catch (e) { console.error(e); }
}

document.getElementById('producir_producto').addEventListener('change', actualizarPreviewReceta);
document.getElementById('producir_cantidad').addEventListener('input', actualizarPreviewReceta);
function actualizarPreviewReceta() {
    const id = parseInt(document.getElementById('producir_producto').value);
    const cant = parseInt(document.getElementById('producir_cantidad').value) || 0;
    const prev = document.getElementById('preview-receta');
    const prod = recetasCache.find(p => p.id === id);
    if (!prod || !cant) { prev.style.display = 'none'; return; }
    prev.style.display = 'block';
    prev.innerHTML = '<strong>Materia prima a descontar:</strong><br>' +
        prod.receta.map(r => {
            const req = parseFloat((r.cantidad_necesaria * cant).toFixed(2));
            const falta = parseFloat(r.stock_actual) < req;
            return `${req} ${r.unidad_medida} de ${r.nombre} ${falta ? '<span style="color:#dc2626;">(¡falta! hay ' + parseFloat(r.stock_actual) + ')</span>' : ''}`;
        }).join('<br>');
}

document.getElementById('form-producir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-producir');
    const payload = {
        producto_id: document.getElementById('producir_producto').value,
        cantidad: document.getElementById('producir_cantidad').value
    };
    try {
        const res = await fetch(`${API}/produccion/producir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); document.getElementById('preview-receta').style.display = 'none'; cargarRecetasProducir(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

// ====================== COMPRAS ======================
async function cargarInsumosCompra() {
    try {
        const insumos = await (await fetch(`${API}/produccion/insumos`)).json();
        const sel = document.getElementById('compra_insumo');
        sel.innerHTML = '<option value="">Selecciona materia prima...</option>';
        insumos.forEach(i => sel.innerHTML += `<option value="${i.id}">${i.nombre} (${i.unidad_medida})</option>`);
    } catch (e) { console.error(e); }
}

document.getElementById('form-compra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-compra');
    const payload = {
        insumo_id: document.getElementById('compra_insumo').value,
        proveedor: document.getElementById('compra_proveedor').value,
        cantidad: document.getElementById('compra_cantidad').value,
        costo_unitario: document.getElementById('compra_costo').value
    };
    try {
        const res = await fetch(`${API}/compras`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); cargarTicketsCompra(); cargarAnalisisCompras(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

async function cargarTicketsCompra() {
    const tbody = document.getElementById('tabla-tickets-compra');
    try {
        const compras = await (await fetch(`${API}/compras`)).json();
        tbody.innerHTML = compras.length ? '' : '<tr><td colspan="6">Sin compras registradas.</td></tr>';
        compras.forEach(c => {
            tbody.innerHTML += `<tr><td>${c.fecha}</td><td><strong>${c.insumo}</strong></td><td>${c.proveedor}</td><td>${c.cantidad} ${c.unidad_medida}</td><td>$${Number(c.costo_unitario).toFixed(2)}</td><td><strong>$${Number(c.costo_total).toFixed(2)}</strong></td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>'; }
}

async function cargarAnalisisCompras() {
    try {
        const data = await (await fetch(`${API}/compras/analisis`)).json();
        const prov = document.getElementById('tabla-proveedores');
        prov.innerHTML = data.porProveedor.length ? '' : '<tr><td colspan="3">Sin datos</td></tr>';
        data.porProveedor.forEach(p => prov.innerHTML += `<tr><td><strong>${p.proveedor}</strong></td><td>${p.num_compras}</td><td>$${Number(p.total_gastado).toFixed(2)}</td></tr>`);
        const ins = document.getElementById('tabla-insumos-comprados');
        ins.innerHTML = data.porInsumo.length ? '' : '<tr><td colspan="3">Sin datos</td></tr>';
        data.porInsumo.forEach(i => ins.innerHTML += `<tr><td><strong>${i.insumo}</strong></td><td>${Number(i.cantidad_total).toFixed(2)} ${i.unidad_medida}</td><td>$${Number(i.total_gastado).toFixed(2)}</td></tr>`);
    } catch (e) { console.error(e); }
}

// ====================== CONTABILIDAD ======================
async function cargarBalance(periodo, btn) {
    if (btn) { document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
    const i = document.getElementById('balance-ingresos'), eg = document.getElementById('balance-egresos'), u = document.getElementById('balance-utilidad');
    i.textContent = eg.textContent = u.textContent = '...';
    try {
        const d = await (await fetch(`${API}/balance?periodo=${periodo}`)).json();
        i.textContent = `$${d.ingresos}`; eg.textContent = `$${d.egresos}`; u.textContent = `$${d.utilidad}`;
        u.className = parseFloat(d.utilidad) >= 0 ? 'monto utilidad-positiva' : 'monto utilidad-negativa';
        document.getElementById('balance-detalle').textContent =
            `Compras de materia prima: $${d.gastos_compras} · Gastos de repartidores: $${d.gastos_repartidores}`;
        cargarTicketsBalance(periodo);
    } catch (e) { u.textContent = 'Error'; }
}

async function cargarTicketsBalance(periodo) {
    const tbody = document.getElementById('tabla-tickets-balance');
    try {
        const tickets = await (await fetch(`${API}/balance/tickets?periodo=${periodo}`)).json();
        tbody.innerHTML = tickets.length ? '' : '<tr><td colspan="5">Sin movimientos en el periodo.</td></tr>';
        tickets.forEach(t => {
            tbody.innerHTML += `<tr><td>${t.fecha}</td><td>${t.tipo}</td><td>${t.concepto || '-'}</td><td>${t.detalle || '-'}</td><td><strong>$${Number(t.monto).toFixed(2)}</strong></td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5">Error al cargar</td></tr>'; }
}

async function cargarDeudas() {
    const tbody = document.getElementById('tabla-deudas');
    try {
        const data = await (await fetch(`${API}/clientes/deudas`)).json();
        document.getElementById('total-deudas').textContent = `$${data.total_por_cobrar}`;
        tbody.innerHTML = data.deudas.length ? '' : '<tr><td colspan="4">Nadie debe dinero. 🎉</td></tr>';
        data.deudas.forEach(c => {
            tbody.innerHTML += `<tr><td><strong>${c.nombre}</strong></td><td>${c.telefono || '-'}</td>
                <td style="color:#dc2626; font-weight:bold;">$${Number(c.saldo_deudor).toFixed(2)}</td>
                <td><button style="width:auto; padding:5px 10px; font-size:12px;" onclick="abonar(${c.id}, ${c.saldo_deudor})">Abonar</button></td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="4">Error al cargar</td></tr>'; }
}

async function abonar(id, deuda) {
    const monto = prompt(`Deuda actual: $${deuda}. ¿Cuánto abona el cliente?`);
    if (monto === null) return;
    try {
        const res = await fetch(`${API}/clientes/${id}/cobro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto_abono: parseFloat(monto) }) });
        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) cargarDeudas();
    } catch (e) { alert('Error de conexión'); }
}

async function cargarContabProduccion() {
    const tbody = document.getElementById('tabla-prod-contab');
    try {
        const d = await (await fetch(`${API}/balance/produccion?periodo=mes`)).json();
        document.getElementById('resumen-produccion').innerHTML =
            `Lotes: <strong>${d.resumen.lotes}</strong> · Cajas: <strong>${d.resumen.cajas_producidas}</strong> · Costo total: <strong>$${Number(d.resumen.costo_total).toFixed(2)}</strong>`;
        tbody.innerHTML = d.porProducto.length ? '' : '<tr><td colspan="3">Sin producción este mes.</td></tr>';
        d.porProducto.forEach(p => tbody.innerHTML += `<tr><td><strong>${p.producto}</strong></td><td>${p.cajas}</td><td>$${Number(p.costo).toFixed(2)}</td></tr>`);
    } catch (e) { tbody.innerHTML = '<tr><td colspan="3">Error al cargar</td></tr>'; }
}

// ====================== CLIENTES ======================
async function cargarClientes() {
    const tbody = document.getElementById('tabla-clientes');
    try {
        const clientes = await (await fetch(`${API}/clientes`)).json();
        tbody.innerHTML = '';
        clientes.forEach(c => {
            const bloqueado = c.estatus === 'bloqueado';
            const deuda = parseFloat(c.saldo_deudor);
            tbody.innerHTML += `<tr style="${bloqueado ? 'opacity:0.6; background:#fff5f5;' : ''}">
                <td>${c.id}</td>
                <td><strong>${c.nombre}</strong><br><small style="color:#64748b;">${c.telefono || ''}</small></td>
                <td><small>${c.direccion || '-'}</small></td>
                <td>$${Number(c.limite_credito).toFixed(2)}</td>
                <td style="font-weight:bold; color:${deuda > 0 ? '#dc2626' : '#16a34a'};">$${deuda.toFixed(2)}</td>
                <td><span style="background:${bloqueado ? '#fee2e2' : '#dcfce7'}; color:${bloqueado ? '#dc2626' : '#16a34a'}; padding:2px 8px; border-radius:10px; font-size:0.8rem; font-weight:bold;">${c.estatus}</span></td>
                <td style="white-space:nowrap;">
                    <button onclick="abrirEditarCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}','${(c.direccion||'').replace(/'/g,"\\'")}','${(c.telefono||'').replace(/'/g,"\\'")}',${c.limite_credito})" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px;">✏️ Editar</button>
                    <button onclick="toggleBloqueoCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}')" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:${bloqueado ? '#16a34a' : '#dc2626'};">${bloqueado ? '🔓 Desbloquear' : '🔒 Bloquear'}</button>
                    ${deuda > 0 ? `<button onclick="cobrarCliente(${c.id},'${c.nombre.replace(/'/g,"\\'")}')" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:#2563eb;">💰 Cobrar</button>` : ''}
                    <button onclick="verHistorial(${c.id},'${c.nombre.replace(/'/g,"\\'")}')" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:#64748b;">📋 Historial</button>
                </td>
            </tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="7">Error al cargar</td></tr>'; }
}

function abrirEditarCliente(id, nombre, direccion, telefono, limite) {
    document.getElementById('edit-cli-id').value      = id;
    document.getElementById('edit-cli-nombre').value  = nombre;
    document.getElementById('edit-cli-direccion').value = direccion;
    document.getElementById('edit-cli-telefono').value = telefono;
    document.getElementById('edit-cli-limite').value  = limite;
    document.getElementById('msg-edit-cliente').style.display = 'none';
    abrirModal('modal-editar-cliente');
}

async function guardarEdicionCliente() {
    const id = document.getElementById('edit-cli-id').value;
    const el = document.getElementById('msg-edit-cliente');
    const payload = {
        nombre:         document.getElementById('edit-cli-nombre').value,
        direccion:      document.getElementById('edit-cli-direccion').value,
        telefono:       document.getElementById('edit-cli-telefono').value,
        limite_credito: document.getElementById('edit-cli-limite').value
    };
    try {
        const res = await fetch(`${API}/clientes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { setTimeout(() => cerrarModal('modal-editar-cliente'), 1000); cargarClientes(); }
    } catch { msg(el, false, 'Error de conexión'); }
}

async function toggleBloqueoCliente(id, nombre) {
    if (!confirm(`¿${nombre}?`)) return;
    try {
        const res = await fetch(`${API}/clientes/${id}/bloqueo`, { method: 'PATCH' });
        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) cargarClientes();
    } catch { alert('Error de conexión'); }
}

async function cobrarCliente(id, nombre) {
    const monto = prompt(`Registrar cobro / abono para ${nombre}\n¿Cuánto pagó? ($)`);
    if (!monto || isNaN(monto) || Number(monto) <= 0) return;
    const notas = prompt('Notas del cobro (opcional):') || '';
    try {
        const res = await fetch(`${API}/clientes/${id}/cobro`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto_abono: parseFloat(monto), notas })
        });
        const data = await res.json();
        alert(data.mensaje + (data.saldo_nuevo !== undefined ? `\nNuevo saldo: $${Number(data.saldo_nuevo).toFixed(2)}` : ''));
        if (res.ok) cargarClientes();
    } catch { alert('Error de conexión'); }
}

async function verHistorial(id, nombre) {
    document.getElementById('historial-cliente-nombre').textContent = `Cliente: ${nombre}`;
    const tbody = document.getElementById('tabla-historial-cobros');
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    abrirModal('modal-historial');
    try {
        const rows = await (await fetch(`${API}/clientes/${id}/historial`)).json();
        if (!rows.length) { tbody.innerHTML = '<tr><td colspan="4" style="color:#94a3b8;">Sin historial de cobros</td></tr>'; return; }
        tbody.innerHTML = rows.map(r => `<tr>
            <td>${r.fecha}</td>
            <td><span style="background:${r.tipo === 'cobro_repartidor' ? '#dbeafe' : '#dcfce7'}; padding:2px 8px; border-radius:8px; font-size:0.8rem;">${r.tipo === 'cobro_repartidor' ? 'Repartidor' : 'Admin'}</span></td>
            <td style="font-weight:bold; color:#16a34a;">$${Number(r.monto).toFixed(2)}</td>
            <td>${r.notas || '—'}</td>
        </tr>`).join('');
    } catch { tbody.innerHTML = '<tr><td colspan="4">Error al cargar</td></tr>'; }
}

document.getElementById('form-nuevo-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-nuevo-cliente');
    const payload = { nombre: document.getElementById('nuevo_nombre').value, direccion: document.getElementById('nueva_direccion').value, telefono: document.getElementById('nuevo_telefono').value, limite_credito: document.getElementById('nuevo_limite').value };
    try {
        const res = await fetch(`${API}/clientes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); cargarClientes(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

// ====================== REPARTIDORES ======================
async function cargarRepartidores() {
    const tbody = document.getElementById('tabla-repartidores');
    try {
        repartidoresCache = await (await fetch(`${API}/repartidores`)).json();
        tbody.innerHTML = '';
        repartidoresCache.forEach(r => {
            const activo = r.estatus === 'activo';
            tbody.innerHTML += `<tr style="${!activo ? 'opacity:0.55;' : ''}">
                <td>${r.id}</td>
                <td><strong>${r.nombre}</strong></td>
                <td><span style="background:${activo ? '#dcfce7' : '#f1f5f9'}; color:${activo ? '#16a34a' : '#64748b'}; padding:2px 8px; border-radius:10px; font-size:0.8rem; font-weight:bold;">${r.estatus}</span></td>
                <td style="white-space:nowrap;">
                    <button onclick="abrirEditarRep(${r.id},'${r.nombre.replace(/'/g,"\\'")}')" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px;">✏️ Editar</button>
                    <button onclick="toggleRepartidor(${r.id},'${r.nombre.replace(/'/g,"\\'")}')" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:${activo ? '#dc2626' : '#16a34a'};">${activo ? '⛔ Desactivar' : '✅ Activar'}</button>
                </td>
            </tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="4">Error al cargar</td></tr>'; }
}

function abrirEditarRep(id, nombre) {
    document.getElementById('edit-rep-id').value     = id;
    document.getElementById('edit-rep-nombre').value = nombre;
    document.getElementById('edit-rep-pin').value    = '';
    document.getElementById('msg-edit-rep').style.display = 'none';
    abrirModal('modal-editar-rep');
}

async function guardarEdicionRepartidor() {
    const id  = document.getElementById('edit-rep-id').value;
    const el  = document.getElementById('msg-edit-rep');
    const pin = document.getElementById('edit-rep-pin').value;
    const payload = { nombre: document.getElementById('edit-rep-nombre').value, ...(pin ? { pin } : {}) };
    try {
        const res = await fetch(`${API}/repartidores/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { setTimeout(() => cerrarModal('modal-editar-rep'), 1000); repartidoresCache = []; cargarRepartidores(); }
    } catch { msg(el, false, 'Error de conexión'); }
}

async function toggleRepartidor(id, nombre) {
    if (!confirm(`¿Cambiar estatus de ${nombre}?`)) return;
    try {
        const res  = await fetch(`${API}/repartidores/${id}/toggle`, { method: 'PATCH' });
        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) { repartidoresCache = []; cargarRepartidores(); }
    } catch { alert('Error de conexión'); }
}

document.getElementById('form-repartidor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-repartidor');
    const payload = { nombre: document.getElementById('rep_nombre').value, pin: document.getElementById('rep_pin').value };
    try {
        const res = await fetch(`${API}/repartidores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); repartidoresCache = []; cargarRepartidores(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

// ====================== FRECUENCIA ======================
async function cargarFrecuencia() {
    try {
        const d = await (await fetch(`${API}/pedidos/frecuencia`)).json();
        const c = document.getElementById('tabla-frec-clientes');
        c.innerHTML = d.porCliente.length ? '' : '<tr><td colspan="4">Sin datos</td></tr>';
        d.porCliente.forEach(x => c.innerHTML += `<tr><td><strong>${x.cliente}</strong></td><td>${x.total_pedidos}</td><td>${x.ultima_compra || '-'}</td><td>${x.dias_entre_compras ?? '-'}</td></tr>`);
        const p = document.getElementById('tabla-frec-productos');
        p.innerHTML = d.productos.length ? '' : '<tr><td colspan="3">Sin datos</td></tr>';
        d.productos.forEach(x => p.innerHTML += `<tr><td>${x.producto}</td><td>${x.veces_pedido}</td><td>${x.total_piezas || 0}</td></tr>`);
    } catch (e) { console.error(e); }
}

// ====================== CONTROL DE CARGA ======================
async function cargarControlCarga() {
    const fechaInput = document.getElementById('carga-fecha');
    const fecha = fechaInput.value || new Date().toISOString().split('T')[0];
    fechaInput.value = fecha;

    const wrap = document.getElementById('carga-tabla-wrap');
    wrap.innerHTML = '<p style="color:#64748b;">Cargando...</p>';

    try {
        const d = await (await fetch(`${API}/pedidos/control-carga/${fecha}`)).json();

        if (!d.resumen.length) {
            wrap.innerHTML = '<p style="color:#64748b;">Sin repartidores activos.</p>';
            return;
        }

        wrap.innerHTML = d.resumen.map(r => {
            const hayDif     = r.retorno_registrado && r.diferencia > 0;
            const cuadra     = r.retorno_registrado && r.diferencia === 0;
            const bordeColor = !r.retorno_registrado ? '#94a3b8' : hayDif ? '#dc2626' : '#16a34a';

            const filaDatos = `
                <tr style="background:#f8fafc;">
                    <td colspan="2" style="font-weight:700; font-size:1rem; color:#1e293b;">🛵 ${r.repartidor}</td>
                    <td style="text-align:center; font-size:1.3rem; font-weight:800;">${r.piezas_salida}</td>
                    <td style="text-align:center; font-size:1.3rem; font-weight:800; color:#16a34a;">${r.piezas_entregadas}</td>
                    <td style="text-align:center; font-size:1.3rem; font-weight:800; color:#2563eb;">${r.esperado_regreso}</td>
                    <td style="text-align:center; font-size:1.3rem; font-weight:800; color:${r.retorno_registrado ? '#0f172a' : '#94a3b8'};">
                        ${r.retorno_registrado ? r.piezas_regresadas : '—'}
                    </td>
                    <td style="text-align:center;">
                        ${hayDif
                            ? `<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:8px; font-weight:700;">⚠️ Faltan ${r.diferencia}</span>`
                            : cuadra
                                ? `<span style="background:#dcfce7; color:#16a34a; padding:4px 10px; border-radius:8px; font-weight:700;">✅ Cuadra</span>`
                                : `<span style="background:#f1f5f9; color:#64748b; padding:4px 10px; border-radius:8px;">Sin registrar</span>`}
                    </td>
                    <td style="text-align:center;">
                        <button onclick="abrirRegistroRetorno(${r.id}, '${r.repartidor}', '${fecha}', ${r.esperado_regreso})"
                            style="width:auto; padding:6px 14px; font-size:0.82rem; background:#2563eb;">
                            ${r.retorno_registrado ? 'Editar' : 'Registrar regreso'}
                        </button>
                    </td>
                </tr>
                ${r.notas_retorno ? `<tr><td colspan="8" style="color:#64748b; font-size:0.85rem; padding:4px 12px;">📝 Nota: ${r.notas_retorno}</td></tr>` : ''}`;

            return `
            <div class="table-container" style="border-left:4px solid ${bordeColor}; margin-bottom:16px;">
                <table>
                    <thead>
                        <tr>
                            <th colspan="2">Repartidor</th>
                            <th style="text-align:center;">Salió con</th>
                            <th style="text-align:center;">Entregó</th>
                            <th style="text-align:center;">Debería regresar</th>
                            <th style="text-align:center;">Regresó con</th>
                            <th style="text-align:center;">Estado</th>
                            <th style="text-align:center;">Acción</th>
                        </tr>
                    </thead>
                    <tbody>${filaDatos}</tbody>
                </table>
            </div>`;
        }).join('');

    } catch (e) {
        wrap.innerHTML = '<p style="color:#dc2626;">Error al cargar datos.</p>';
    }
}

function abrirRegistroRetorno(repId, nombre, fecha, esperado) {
    const regresadas = prompt(`${nombre}\n\nSalió con ${esperado} piezas que no fueron entregadas.\n¿Cuántas cajas/piezas regresó físicamente?`);
    if (regresadas === null) return;
    const notas = prompt('¿Alguna nota? (opcional, puedes dejarlo vacío)') || '';

    fetch(`${API}/pedidos/retorno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repartidor_id: repId, fecha, piezas_regresadas: parseInt(regresadas) || 0, notas })
    })
    .then(r => r.json())
    .then(d => { alert(d.mensaje); cargarControlCarga(); })
    .catch(() => alert('Error de conexión'));
}

// ====================== DEUDAS DEL NEGOCIO ======================
async function cargarDeudasNegocio() {
    const tbody = document.getElementById('tabla-deudas-negocio');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8;">Cargando...</td></tr>';
    try {
        const deudas = await (await fetch(`${API}/deudas-negocio`)).json();

        let totalMonto = 0, totalPagado = 0, totalPendiente = 0;
        deudas.forEach(d => {
            totalMonto    += Number(d.monto_total);
            totalPagado   += Number(d.monto_pagado);
            totalPendiente += Number(d.saldo_pendiente);
        });
        document.getElementById('deuda-total-monto').textContent    = '$' + totalMonto.toFixed(2);
        document.getElementById('deuda-total-pagado').textContent   = '$' + totalPagado.toFixed(2);
        document.getElementById('deuda-total-pendiente').textContent = '$' + totalPendiente.toFixed(2);

        if (!deudas.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8;">Sin deudas registradas</td></tr>';
            return;
        }

        const colorEstatus = { pendiente: '#fee2e2', parcial: '#fef3c7', pagada: '#dcfce7' };
        const labelEstatus = { pendiente: '🔴 Pendiente', parcial: '🟡 Parcial', pagada: '✅ Pagada' };
        tbody.innerHTML = deudas.map(d => `
            <tr style="background:${colorEstatus[d.estatus]};">
                <td><strong>${d.proveedor}</strong></td>
                <td>${d.concepto}</td>
                <td>$${Number(d.monto_total).toFixed(2)}</td>
                <td style="color:#16a34a;">$${Number(d.monto_pagado).toFixed(2)}</td>
                <td style="font-weight:700; color:#dc2626;">$${Number(d.saldo_pendiente).toFixed(2)}</td>
                <td>${d.fecha_vencimiento || '—'}</td>
                <td>${labelEstatus[d.estatus]}</td>
                <td>${d.estatus !== 'pagada' ? `<button onclick="abonarDeuda(${d.id})" style="width:auto; padding:6px 12px; font-size:0.8rem;">Abonar</button>` : '—'}</td>
            </tr>`).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" style="color:#dc2626;">Error al cargar.</td></tr>';
    }
}

async function abonarDeuda(id) {
    const monto = prompt('¿Cuánto vas a abonar? ($)');
    if (!monto || isNaN(monto) || Number(monto) <= 0) return;
    try {
        const res = await fetch(`${API}/deudas-negocio/${id}/abono`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto_abono: parseFloat(monto) })
        });
        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) cargarDeudasNegocio();
    } catch { alert('Error de conexión'); }
}

document.getElementById('form-deuda-negocio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('msg-deuda');
    const payload = {
        proveedor:        document.getElementById('deuda-proveedor').value,
        concepto:         document.getElementById('deuda-concepto').value,
        monto_total:      document.getElementById('deuda-monto').value,
        fecha:            document.getElementById('deuda-fecha').value,
        fecha_vencimiento: document.getElementById('deuda-vencimiento').value || null,
        notas:            document.getElementById('deuda-notas').value
    };
    try {
        const res = await fetch(`${API}/deudas-negocio`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); cargarDeudasNegocio(); }
    } catch { msg(el, false, 'Error de conexión'); }
});

// Carga inicial
function iniciarApp() {
    cambiarVista('crear');
    const hoy = new Date().toISOString().split('T')[0];
    const fi = document.getElementById('carga-fecha');
    if (fi) fi.value = hoy;
    const fd = document.getElementById('deuda-fecha');
    if (fd) fd.value = hoy;
    // Verificar stock bajo en segundo plano
    cargarInsumos();
}

window.onload = () => {
    const token = localStorage.getItem('admin_token');
    if (token) {
        document.getElementById('login-overlay').style.display = 'none';
        iniciarApp();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        setTimeout(() => document.getElementById('login-password').focus(), 100);
    }
};
