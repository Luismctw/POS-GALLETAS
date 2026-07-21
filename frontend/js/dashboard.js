const API = location.protocol.startsWith('http') ? '/api' : 'http://localhost:3001/api';

// ====================== AUTH ADMIN ======================
const _origFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
    if (typeof url === 'string' && url.includes('/api/')) {
        const token = localStorage.getItem('admin_token');
        if (token) opts.headers = { ...opts.headers, 'Authorization': `Bearer ${token}` };
    }
    const res = await _origFetch(url, opts);
    if (res.status === 401 && typeof url === 'string' && url.includes('/api/') && !url.includes('/admin/login')) {
        localStorage.removeItem('admin_token');
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('login-error').textContent = 'Sesión expirada. Vuelve a iniciar sesión.';
    }
    return res;
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

// Escapa caracteres HTML para evitar XSS al inyectar en innerHTML
function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
        crear: () => { cargarClientesSelect(); cargarCreadosResumen(); cargarContenidosSugeridos(); cargarSelectorBodega(); },
        asignar: () => { cargarPedidosPorAsignar(); cargarPedidosMonitor(); },
        prioridad: cargarPrioridad,
        materia: async () => { await cargarBodegas(); cargarInsumos(); },
        terminado: async () => { await cargarBodegas(); cargarProductoTerminado(); },
        produccion: async () => { await cargarBodegas(); cargarInsumosReceta(); cargarRecetasProducir(); },
        compras: () => { cargarInsumosCompra(); cargarTicketsCompra(); cargarAnalisisCompras(); },
        contabilidad: () => { cargarBalance('dia'); cargarDeudas(); cargarContabProduccion(); cargarTicketsBalance('dia'); },
        capital: cargarCapital,
        clientes: cargarClientes,
        repartidores: cargarRepartidores,
        frecuencia: cargarFrecuencia,
        'control-carga': cargarControlCarga,
        'deudas-negocio': cargarDeudasNegocio
    };
    if (cargadores[vista]) cargadores[vista]();
}

// ====================== CREAR PEDIDO ======================
let _clientesCache = []; // lista completa para el buscador del selector de pedido

async function cargarClientesSelect() {
    try {
        _clientesCache = await (await fetch(`${API}/clientes`)).json();
        const buscar = document.getElementById('cliente_buscar');
        if (buscar) buscar.value = '';
        pintarClientesSelect(_clientesCache);
    } catch (e) { console.error(e); }
}

// Rellena el <select> de clientes con la lista dada (respeta la selección actual)
function pintarClientesSelect(lista) {
    const sel = document.getElementById('cliente_id');
    if (!sel) return;
    const seleccionado = sel.value;
    sel.innerHTML = '<option value="">Selecciona un cliente...</option>' +
        lista.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    if (seleccionado && lista.some(c => String(c.id) === seleccionado)) sel.value = seleccionado;
}

// Filtra el selector de clientes según lo que se escribe en el buscador
function filtrarClientesSelect() {
    const q = (document.getElementById('cliente_buscar').value || '').toLowerCase().trim();
    const filtrados = q
        ? _clientesCache.filter(c => String(c.nombre).toLowerCase().includes(q))
        : _clientesCache;
    pintarClientesSelect(filtrados);
    // Si solo queda uno, lo selecciona automáticamente
    const sel = document.getElementById('cliente_id');
    if (filtrados.length === 1) sel.value = filtrados[0].id;
}

// ---- PICKER DE PRODUCTOS EN BODEGA para Crear Pedido ----
let _productosPedido = []; // carrito temporal

// Solo refresca el <select> del picker sin tocar el carrito
let _prodBodegaCache = [];
async function cargarSelectorBodega() {
    try {
        const prods = await (await fetch(`${API}/produccion/productos`)).json();
        _prodBodegaCache = prods.filter(p => p.stock_actual > 0);
        // #2 · Llenar el filtro de bodega con las bodegas que tienen stock
        const filtro = document.getElementById('prod-bodega-filtro');
        if (filtro) {
            const bodegas = [...new Set(_prodBodegaCache.map(p => String(p.bodega_asignada)))];
            const actual = filtro.value;
            filtro.innerHTML = '<option value="">Todas las bodegas</option>' +
                bodegas.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
            if (actual && bodegas.includes(actual)) filtro.value = actual;
        }
        pintarSelectorProductos();
    } catch (e) { console.error(e); }
}

// Rellena el selector de productos según la bodega elegida en el filtro
function pintarSelectorProductos() {
    const sel = document.getElementById('prod-bodega-sel');
    if (!sel) return;
    const filtro = document.getElementById('prod-bodega-filtro');
    const bod = filtro ? filtro.value : '';
    const lista = bod ? _prodBodegaCache.filter(p => String(p.bodega_asignada) === bod) : _prodBodegaCache;
    if (!lista.length) { sel.innerHTML = '<option value="">Sin stock en esta bodega</option>'; return; }
    sel.innerHTML = '<option value="">Selecciona producto...</option>' +
        lista.map(p =>
            `<option value="${p.id}" data-precio="${esc(p.precio_caja)}" data-stock="${esc(p.stock_actual)}" data-nombre="${esc(p.nombre)}">
                ${esc(p.nombre)} — ${esc(p.bodega_asignada)} (${esc(p.stock_actual)} cajas)
            </option>`
        ).join('');
}

// Limpia el carrito y recarga el selector (solo en submit exitoso)
async function cargarProductosBodega() {
    _productosPedido = [];
    actualizarListaPedido();
    await cargarSelectorBodega();
}

function agregarProductoPedido() {
    const sel = document.getElementById('prod-bodega-sel');
    const qty = parseInt(document.getElementById('prod-bodega-qty').value) || 1;
    const opt = sel.options[sel.selectedIndex];
    if (!sel.value) return;

    const id    = parseInt(sel.value);
    const nombre = opt.dataset.nombre;
    const precio = parseFloat(opt.dataset.precio);
    const stock  = parseInt(opt.dataset.stock);

    const existente = _productosPedido.find(p => p.id === id);
    const yaAgregado = existente ? existente.qty : 0;
    if (yaAgregado + qty > stock) {
        alert(`Solo hay ${stock} cajas de ${nombre} disponibles.`);
        return;
    }
    if (existente) {
        existente.qty += qty;
    } else {
        _productosPedido.push({ id, nombre, qty, precio });
    }
    actualizarListaPedido();
}

function quitarProductoPedido(id) {
    _productosPedido = _productosPedido.filter(p => p.id !== id);
    actualizarListaPedido();
}

function actualizarListaPedido() {
    const ul = document.getElementById('lista-prod-pedido');
    if (!ul) return;
    if (_productosPedido.length === 0) {
        ul.innerHTML = '';
        return;
    }
    ul.innerHTML = _productosPedido.map(p =>
        `<li style="display:flex; justify-content:space-between; align-items:center; background:#fff; border-radius:6px; padding:5px 10px; margin-bottom:4px; font-size:0.88rem;">
            <span><strong>${esc(p.qty)}</strong> cajas de <strong>${esc(p.nombre)}</strong> — $${(p.qty * p.precio).toFixed(2)}</span>
            <button type="button" onclick="quitarProductoPedido(${p.id})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1rem;">✕</button>
        </li>`
    ).join('');

    // Auto-rellenar contenido, piezas y total
    const contenido = _productosPedido.map(p => `${p.qty} cajas ${p.nombre}`).join(' + ');
    const total     = _productosPedido.reduce((s, p) => s + p.qty * p.precio, 0);
    const piezas    = _productosPedido.reduce((s, p) => s + p.qty, 0);

    document.getElementById('contenido').value = contenido;
    document.getElementById('total').value     = total.toFixed(2);
    document.getElementById('piezas').value    = piezas;
}

async function cambiarBodegaInsumo(id) {
    const sel = document.getElementById(`bodega-sel-${id}`);
    const ubicacion = sel.value;
    try {
        const res = await fetch(`${API}/produccion/insumos/${id}/bodega`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ubicacion })
        });
        if (res.ok) { cargarInsumos(); }
        else { alert('Error al actualizar bodega'); }
    } catch (e) { alert('Sin conexión al servidor'); }
}

async function cargarContenidosSugeridos() {
    try {
        const contenidos = await (await fetch(`${API}/pedidos/contenidos`)).json();
        const dl = document.getElementById('lista-contenidos');
        dl.innerHTML = contenidos.map(c => `<option value="${c}">`).join('');
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
        total: document.getElementById('total').value,
        fecha: document.getElementById('pedido_fecha').value || null,
        // Productos seleccionados de la bodega (para descontar stock al entregar)
        productos: _productosPedido.map(p => ({ producto_id: p.id, cantidad: p.qty }))
    };
    const el = document.getElementById('mensaje-pedido');
    try {
        const res = await fetch(`${API}/pedidos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); _productosPedido = []; actualizarListaPedido(); cargarProductosBodega(); cargarCreadosResumen(); cargarContenidosSugeridos(); }
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

let _pedidosMonitorCache = []; // #5 · para editar pedidos desde el monitor

// #5 · Editar un pedido no entregado (contenido, piezas, total)
async function editarPedidoMonitor(id) {
    const p = _pedidosMonitorCache.find(x => String(x.id) === String(id));
    if (!p) return;
    const contenido = prompt('Contenido del pedido:', p.contenido || '');
    if (contenido === null) return;
    const piezas = prompt('Piezas:', p.piezas ?? 0);
    if (piezas === null) return;
    const total = prompt('Total ($):', p.total);
    if (total === null) return;
    try {
        const res = await fetch(`${API}/pedidos/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contenido: contenido.trim(), piezas: parseInt(piezas) || 0, total: parseFloat(total) })
        });
        const data = await res.json();
        if (res.ok) cargarPedidosMonitor();
        else alert(data.mensaje || 'No se pudo editar');
    } catch (e) { alert('Error de conexión'); }
}

// #5 · Eliminar un pedido no entregado
async function eliminarPedidoMonitor(id, cliente) {
    if (!confirm(`¿Eliminar el pedido #${id} de "${cliente}"?\n\nSe revertirá el cargo en la cuenta del cliente.`)) return;
    try {
        const res = await fetch(`${API}/pedidos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) cargarPedidosMonitor();
        else alert(data.mensaje || 'No se pudo eliminar');
    } catch (e) { alert('Error de conexión'); }
}

async function cargarPedidosMonitor() {
    const tbody = document.getElementById('tabla-pedidos-monitor');
    try {
        const pedidos = await (await fetch(`${API}/pedidos`)).json();
        _pedidosMonitorCache = pedidos;
        tbody.innerHTML = '';
        pedidos.forEach(p => {
            const color = p.estatus === 'entregado' ? 'green' : (p.estatus === 'reagendado' ? 'orange' : (p.estatus === 'creado' ? 'gray' : (p.estatus === 'cancelado' ? '#dc2626' : 'blue')));
            const accion = p.estatus === 'pendiente'
                ? `<button onclick="entregarAdmin(${p.id})" style="padding:5px 10px; background:#16a34a; font-size:12px; width:auto;">✔️ Entregar</button>`
                : (p.estatus === 'entregado'
                    ? `<button onclick="corregirCobro(${p.id}, ${p.monto_cobrado ?? p.total})" style="padding:4px 8px; background:#f59e0b; color:#fff; font-size:11px; width:auto;">✏️ Corregir cobro</button>`
                    : '-');
            const editable = !['entregado','cancelado'].includes(p.estatus);
            const editBtn = editable
                ? `<button onclick="editarPedidoMonitor(${p.id})" style="padding:4px 8px; background:#0ea5e9; color:#fff; font-size:11px; width:auto;">✏️ Editar</button>` : '';
            const cancelBtn = editable
                ? `<button onclick="cancelarPedido(${p.id})" style="padding:4px 8px; background:#dc2626; font-size:11px; width:auto;">✕ Cancelar</button>` : '';
            const delBtn = p.estatus !== 'entregado'
                ? `<button onclick="eliminarPedidoMonitor(${p.id}, ${esc(JSON.stringify(p.cliente))})" title="Eliminar pedido" style="padding:4px 8px; background:#991b1b; color:#fff; font-size:11px; width:auto;">🗑</button>` : '';
            const gestion = [cancelBtn, editBtn, delBtn].filter(Boolean).join(' ') || '-';
            const antig = p.dias_antiguedad > 0 ? `${p.dias_antiguedad} días${p.veces_reagendado ? ' · ' + p.veces_reagendado + 'x' : ''}` : 'Hoy';
            tbody.innerHTML += `<tr style="${p.estatus === 'cancelado' ? 'opacity:0.55;' : ''}">
                <td>#${p.id}</td><td><strong>${esc(p.cliente)}</strong></td><td>${esc(p.repartidor)}</td>
                <td>${esc(p.contenido) || '-'}</td><td>$${esc(p.total)}</td>
                <td style="color:${color}; font-weight:bold; text-transform:uppercase;">${esc(p.estatus)}</td>
                <td>${antig}</td><td>${accion}</td><td style="white-space:nowrap;">${gestion}</td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="9">Error al cargar el monitor</td></tr>'; }
}

async function corregirCobro(id, montoActual) {
    const nuevo = prompt(`Pedido #${id}\nMonto cobrado actual: $${Number(montoActual).toFixed(2)}\n\n¿Cuánto se cobró realmente?`, Number(montoActual).toFixed(2));
    if (nuevo === null) return;
    const monto = parseFloat(nuevo);
    if (isNaN(monto) || monto < 0) { alert('Monto inválido'); return; }
    try {
        const res  = await fetch(`${API}/pedidos/${id}/corregir-cobro`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monto_cobrado: monto })
        });
        const data = await res.json();
        alert(res.ok ? `✅ ${data.mensaje}` : `Error: ${data.mensaje}`);
        if (res.ok) cargarPedidosMonitor();
    } catch (e) { alert('Error de conexión'); }
}

async function entregarAdmin(id) {
    if (!confirm('¿Marcar este pedido como entregado?')) return;
    try {
        const res = await fetch(`${API}/pedidos/${id}/entregar`, { method: 'PATCH' });
        if (res.ok) cargarPedidosMonitor();
    } catch (e) { alert('Error de conexión'); }
}

async function cerrarDia() {
    // Obtener resumen previo antes de confirmar
    try {
        const [pendRes, prioRes] = await Promise.all([
            fetch(`${API}/pedidos`),
            fetch(`${API}/pedidos/prioritarios`)
        ]);
        const pedidos   = await pendRes.json();
        const prioridad = await prioRes.json();

        const pendientes   = pedidos.filter(p => p.estatus === 'pendiente').length;
        const sinAsignar   = pedidos.filter(p => p.estatus === 'creado').length;
        const conAtraso    = prioridad.length;

        let dialogo = '¿Cerrar el día?\n\n';
        dialogo += `📦 Pedidos pendientes de entregar hoy: ${pendientes}\n`;
        if (sinAsignar > 0)  dialogo += `⚠️  Pedidos sin asignar a repartidor: ${sinAsignar}\n`;
        if (conAtraso > 0)   dialogo += `🔴 Pedidos atrasados o reagendados: ${conAtraso}\n`;
        dialogo += '\nLos pedidos pendientes se reagendarán para mañana.';

        if (!confirm(dialogo)) return;
    } catch {
        if (!confirm('¿Cerrar el día? Los pedidos pendientes se reagendarán para mañana.')) return;
    }

    try {
        const res  = await fetch(`${API}/admin/cerrar-dia`, { method: 'POST' });
        const data = await res.json();

        if (!res.ok) { alert(`Error al cerrar el día: ${data.mensaje || res.status}`); return; }

        let resultado = '✅ Día cerrado.\n\n';
        resultado += `🔄 Reagendados para mañana: ${data.reagendados}\n`;
        if (data.sin_asignar > 0)    resultado += `📋 Pendientes sin asignar: ${data.sin_asignar}\n`;
        if (data.ya_reagendados > 0) resultado += `⚠️  Ya llevaban días reagendados: ${data.ya_reagendados}\n`;

        alert(resultado);
        cargarPedidosMonitor(); cargarPedidosPorAsignar(); cargarPrioridad();
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
            <h1>🍪 Ruta del día — INGU</h1>
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
// ====================== BODEGAS (dinámicas) ======================
let _bodegasCache = [];
const _BODEGAS_FALLBACK = ['Bodega Materia Prima', 'Bodega 1', 'Bodega 2', 'Bodega 3', 'Bodega de Tránsito'];

// Nombres de bodega disponibles (cache o respaldo por si aún no cargó)
function nombresBodegas() {
    return _bodegasCache.length ? _bodegasCache.map(b => b.nombre) : _BODEGAS_FALLBACK;
}

async function cargarBodegas() {
    try {
        _bodegasCache = await (await fetch(`${API}/produccion/bodegas`)).json();
    } catch (e) { _bodegasCache = []; }
    poblarSelectBodegas('insumo_ubicacion');
    poblarSelectBodegas('nuevo_prod_bodega');
    poblarSelectBodegas('combo-bodega');
    renderListaBodegas();
}

// Llena un <select> con las bodegas (por nombre). Respeta la selección previa.
function poblarSelectBodegas(selectId, seleccionado) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const actual = seleccionado ?? sel.value;
    sel.innerHTML = nombresBodegas().map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if (actual && nombresBodegas().includes(actual)) sel.value = actual;
}

// Chips de bodegas con botón de eliminar (panel de administración)
function renderListaBodegas() {
    const cont = document.getElementById('lista-bodegas');
    if (!cont) return;
    cont.innerHTML = _bodegasCache.map(b => `
        <span style="display:inline-flex; align-items:center; gap:6px; background:#eef2ff; color:#4338ca; padding:6px 10px; border-radius:20px; font-size:0.85rem;">
            🏬 ${esc(b.nombre)}
            <button onclick="eliminarBodega(${esc(b.id)}, ${esc(JSON.stringify(b.nombre))})" title="Eliminar bodega" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; font-size:1rem; line-height:1;">×</button>
        </span>`).join('') || '<span style="color:#94a3b8; font-size:0.85rem;">Sin bodegas</span>';
}

async function eliminarBodega(id, nombre) {
    if (!confirm(`¿Eliminar la bodega "${nombre}"?\n\nSolo se puede si no tiene materia prima ni productos.`)) return;
    try {
        const res = await fetch(`${API}/produccion/bodegas/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) cargarBodegas();
        else alert(data.mensaje || 'No se pudo eliminar');
    } catch (e) { alert('Error de conexión'); }
}

const _formBodega = document.getElementById('form-bodega');
if (_formBodega) _formBodega.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('bodega_nombre').value.trim();
    const el = document.getElementById('mensaje-bodega');
    if (!nombre) return;
    try {
        const res = await fetch(`${API}/produccion/bodegas`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
        });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); cargarBodegas(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

async function cargarInsumos() {
    const tbody = document.getElementById('tabla-insumos');
    try {
        const insumos = await (await fetch(`${API}/produccion/insumos`)).json();
        _insumosCache = insumos;
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
            const opsBodega = nombresBodegas().map(b =>
                `<option value="${esc(b)}" ${b === (i.ubicacion || 'Bodega Materia Prima') ? 'selected' : ''}>${esc(b)}</option>`
            ).join('');
            tbody.innerHTML += `<tr style="${bajo ? 'background:#fff5f5;' : ''}">
                <td>${i.id}</td><td><strong>${i.nombre}</strong></td>
                <td><small>${i.ubicacion || '-'}</small></td>
                <td>${fmt(stock)} ${i.unidad_medida}</td><td>${fmt(minimo)} ${i.unidad_medida}</td>
                <td>${estado}</td>
                <td style="white-space:nowrap;">
                    <select id="bodega-sel-${i.id}" style="font-size:0.8rem; padding:3px 6px; border-radius:6px; border:1px solid #cbd5e1;">${opsBodega}</select>
                    <button onclick="cambiarBodegaInsumo(${i.id})" style="margin-left:4px; padding:3px 8px; font-size:0.78rem; background:#3b82f6; color:#fff; border:none; border-radius:6px; cursor:pointer;">Mandar</button>
                    <button onclick="editarInsumo(${esc(i.id)})" title="Editar materia prima" style="margin-left:4px; padding:3px 8px; font-size:0.78rem; background:#f59e0b; color:#fff; border:none; border-radius:6px; cursor:pointer;">✏️</button>
                    <button onclick="eliminarInsumo(${esc(i.id)}, ${esc(JSON.stringify(i.nombre))})" title="Eliminar materia prima" style="margin-left:4px; padding:3px 8px; font-size:0.78rem; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑</button>
                </td></tr>`;
        });
        const badge = document.getElementById('stock-bajo-badge');
        if (badge) {
            badge.style.display = contadorBajo > 0 ? 'block' : 'none';
            document.getElementById('stock-bajo-count').textContent = contadorBajo;
        }
    } catch (e) { tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>'; }
}

let _insumosCache = [];

// #10 · Editar materia prima completa (nombre, unidad, mínimo, stock, costo)
async function editarInsumo(id) {
    const i = _insumosCache.find(x => String(x.id) === String(id));
    if (!i) return;
    const nombre = prompt('Nombre de la materia prima:', i.nombre);
    if (nombre === null) return;
    const unidad = prompt('Unidad (kg, g, lt, ml, pza, ton):', i.unidad_medida);
    if (unidad === null) return;
    const minimo = prompt('Stock mínimo (alerta):', i.stock_minimo);
    if (minimo === null) return;
    const stock = prompt('Stock actual (corrección manual):', i.stock_actual);
    if (stock === null) return;
    const costo = prompt('Costo unitario ($):', i.costo_unitario);
    if (costo === null) return;
    try {
        const res = await fetch(`${API}/produccion/insumos/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: nombre.trim(),
                unidad_medida: unidad.trim(),
                stock_minimo: minimo,
                stock_actual: stock,
                costo_unitario: costo
            })
        });
        const data = await res.json();
        if (res.ok) cargarInsumos();
        else alert(data.mensaje || 'No se pudo editar');
    } catch (e) { alert('Error de conexión'); }
}

// #10 · Eliminar materia prima (bloqueada por el backend si está en una receta)
async function eliminarInsumo(id, nombre) {
    if (!confirm(`¿Eliminar la materia prima "${nombre}"?\n\nSolo se puede si no está en ninguna receta.`)) return;
    try {
        const res = await fetch(`${API}/produccion/insumos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) { cargarInsumos(); }
        else alert(data.mensaje || 'No se pudo eliminar');
    } catch (e) { alert('Error de conexión'); }
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
        if (res.ok) { e.target.reset(); document.getElementById('insumo_unidad').value = 'kg'; document.getElementById('insumo_ubicacion').value = 'Bodega Materia Prima'; cargarInsumos(); cargarContenidosSugeridos(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

// ====================== PRODUCTO TERMINADO ======================
let _productosCache = []; // para editar productos de terceros

// #2 · Editar un producto de tercero (nombre, precio, stock, bodega)
async function editarProductoTercero(id) {
    const p = _productosCache.find(x => String(x.id) === String(id));
    if (!p) return;
    const nombre = prompt('Nombre del producto:', p.nombre);
    if (nombre === null) return;
    const precio = prompt('Precio por caja ($):', p.precio_caja);
    if (precio === null) return;
    const stock = prompt('Stock actual (cajas):', p.stock_actual);
    if (stock === null) return;
    const bodega = prompt('Bodega (nombre, ej. "Bodega 1"):', p.bodega_asignada);
    if (bodega === null) return;
    try {
        const res = await fetch(`${API}/produccion/productos/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nombre.trim(), precio_caja: parseFloat(precio), stock_actual: parseInt(stock), bodega_asignada: bodega.trim() })
        });
        const data = await res.json();
        if (res.ok) cargarProductoTerminado();
        else alert(data.mensaje || 'No se pudo editar');
    } catch (e) { alert('Error de conexión'); }
}

// #3 · Traspasar un producto a otra bodega
async function cambiarBodegaProducto(id) {
    const sel = document.getElementById(`prodbod-${id}`);
    if (!sel) return;
    try {
        const res = await fetch(`${API}/produccion/productos/${id}/bodega`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bodega_asignada: sel.value })
        });
        const data = await res.json();
        if (res.ok) cargarProductoTerminado();
        else alert(data.mensaje || 'No se pudo trasladar');
    } catch (e) { alert('Error de conexión'); }
}

// #2 · Eliminar un producto
async function eliminarProducto(id, nombre) {
    if (!confirm(`¿Eliminar el producto "${nombre}"?`)) return;
    try {
        const res = await fetch(`${API}/produccion/productos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) cargarProductoTerminado();
        else alert(data.mensaje || 'No se pudo eliminar');
    } catch (e) { alert('Error de conexión'); }
}

async function cargarProductoTerminado() {
    const cont = document.getElementById('bodegas-container');
    try {
        const productos = await (await fetch(`${API}/produccion/productos`)).json();
        cont.innerHTML = '';
        _productosCache = productos;
        // Muestra todas las bodegas activas + cualquier bodega que ya tenga productos
        const bodegaNombres = [...new Set([...nombresBodegas(), ...productos.map(p => String(p.bodega_asignada))])];
        bodegaNombres.forEach(bname => {
            const items = productos.filter(p => String(p.bodega_asignada) === bname);
            const filas = items.length
                ? items.map(p => {
                    const editDel = p.tipo !== 'propio'
                        ? `<button onclick="editarProductoTercero(${esc(p.id)})" title="Editar" style="padding:3px 8px; font-size:0.78rem; background:#f59e0b; color:#fff; border:none; border-radius:6px; cursor:pointer;">✏️</button>
                           <button onclick="eliminarProducto(${esc(p.id)}, ${esc(JSON.stringify(p.nombre))})" title="Eliminar" style="margin-left:4px; padding:3px 8px; font-size:0.78rem; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑</button>`
                        : '';
                    // #3 · Traspasar producto a otra bodega
                    const opsBod = nombresBodegas().map(b => `<option value="${esc(b)}" ${b === p.bodega_asignada ? 'selected' : ''}>${esc(b)}</option>`).join('');
                    const mover = `<select id="prodbod-${esc(p.id)}" style="font-size:0.75rem; padding:2px 4px; border-radius:5px; border:1px solid #cbd5e1;">${opsBod}</select>
                        <button onclick="cambiarBodegaProducto(${esc(p.id)})" title="Traspasar a otra bodega" style="margin-left:3px; padding:3px 7px; font-size:0.75rem; background:#3b82f6; color:#fff; border:none; border-radius:5px; cursor:pointer;">Mandar</button>`;
                    return `<tr><td><strong>${esc(p.nombre)}</strong><br><small style="color:${p.tipo === 'propio' ? '#8b5cf6' : (p.tipo === 'combinada' ? '#db2777' : '#0ea5e9')};">${esc(p.tipo)}</small></td><td>$${esc(p.precio_caja)}</td><td><strong>${esc(p.stock_actual)}</strong> cajas</td><td style="white-space:nowrap;">${mover} ${editDel}</td></tr>`;
                }).join('')
                : '<tr><td colspan="4" style="color:#94a3b8;">Sin productos</td></tr>';
            cont.innerHTML += `<div class="table-container">
                <h3 style="margin-bottom:10px; color:var(--primary);">🏬 ${esc(bname)}</h3>
                <table><thead><tr><th>Producto</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr></thead><tbody>${filas}</tbody></table></div>`;
        });

        // Llenar el select de productos de terceros
        const terceros = productos.filter(p => p.tipo === 'tercero');
        const sel = document.getElementById('tercero_producto_id');
        if (sel) {
            sel.innerHTML = terceros.length
                ? '<option value="">Selecciona producto...</option>' + terceros.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)} (${esc(p.bodega_asignada)})</option>`).join('')
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

let _editandoRecetaId = null; // #5 · id de la receta que se está editando

document.getElementById('form-nuevo-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-nuevo-producto');
    const tipo = document.getElementById('nuevo_prod_tipo').value;

    // Modo EDICIÓN de receta (solo productos propios)
    if (_editandoRecetaId) {
        if (recetaTemporal.length === 0) return msg(el, false, 'La receta necesita al menos un ingrediente.');
        const payload = {
            nombre: document.getElementById('nuevo_prod_nombre').value,
            precio_caja: document.getElementById('nuevo_prod_precio').value,
            bodega_asignada: document.getElementById('nuevo_prod_bodega').value,
            receta: recetaTemporal
        };
        try {
            const res = await fetch(`${API}/produccion/recetas/${_editandoRecetaId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            msg(el, res.ok, data.mensaje);
            if (res.ok) { cancelarEdicionReceta(); cargarRecetasProducir(); }
        } catch (err) { msg(el, false, 'Error de conexión'); }
        return;
    }

    if (tipo === 'propio' && recetaTemporal.length === 0) return msg(el, false, 'Un producto propio necesita al menos un ingrediente.');
    const payload = {
        nombre: document.getElementById('nuevo_prod_nombre').value,
        precio_caja: document.getElementById('nuevo_prod_precio').value,
        tipo,
        bodega_asignada: document.getElementById('nuevo_prod_bodega').value,
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

// #5 · Lista de recetas guardadas con editar/eliminar
function renderListaRecetas() {
    const cont = document.getElementById('lista-recetas');
    if (!cont) return;
    if (!recetasCache.length) { cont.innerHTML = '<small style="color:#94a3b8;">Aún no hay recetas.</small>'; return; }
    cont.innerHTML = recetasCache.map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px; padding:8px 12px;">
            <div><strong>${esc(p.nombre)}</strong> <small style="color:#94a3b8;">— $${esc(p.precio_caja)} · ${p.receta ? p.receta.length : 0} ingrediente(s)</small></div>
            <div style="white-space:nowrap;">
                <button onclick="editarRecetaCargar(${esc(p.id)})" style="width:auto; padding:4px 8px; font-size:0.78rem; background:#f59e0b;">✏️</button>
                <button onclick="eliminarReceta(${esc(p.id)}, ${esc(JSON.stringify(p.nombre))})" style="width:auto; padding:4px 8px; font-size:0.78rem; background:#ef4444; margin-left:4px;">🗑</button>
            </div>
        </div>`).join('');
}

// #5 · Cargar una receta en el formulario para editarla
function editarRecetaCargar(id) {
    const p = recetasCache.find(x => String(x.id) === String(id));
    if (!p) return;
    _editandoRecetaId = id;
    document.getElementById('nuevo_prod_nombre').value = p.nombre;
    document.getElementById('nuevo_prod_precio').value = p.precio_caja;
    document.getElementById('nuevo_prod_tipo').value = 'propio';
    document.getElementById('nuevo_prod_tipo').dispatchEvent(new Event('change'));
    document.getElementById('nuevo_prod_tipo').disabled = true;
    recetaTemporal = (p.receta || []).map(r => ({ insumo_id: r.insumo_id, nombre: r.nombre, cantidad_necesaria: parseFloat(r.cantidad_necesaria) }));
    dibujarReceta();
    document.getElementById('btn-guardar-producto').textContent = 'Guardar cambios de receta';
    document.getElementById('btn-cancelar-edicion-receta').style.display = 'block';
    document.getElementById('nuevo_prod_nombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelarEdicionReceta() {
    _editandoRecetaId = null;
    document.getElementById('form-nuevo-producto').reset();
    document.getElementById('nuevo_prod_tipo').disabled = false;
    document.getElementById('nuevo_prod_tipo').dispatchEvent(new Event('change'));
    recetaTemporal = [];
    dibujarReceta();
    document.getElementById('btn-guardar-producto').textContent = 'Guardar Producto';
    document.getElementById('btn-cancelar-edicion-receta').style.display = 'none';
}

// #5 · Eliminar una receta (borra el producto propio y su receta)
async function eliminarReceta(id, nombre) {
    if (!confirm(`¿Eliminar la receta "${nombre}"?`)) return;
    try {
        const res = await fetch(`${API}/produccion/productos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) { if (String(_editandoRecetaId) === String(id)) cancelarEdicionReceta(); cargarRecetasProducir(); }
        else alert(data.mensaje || 'No se pudo eliminar');
    } catch (e) { alert('Error de conexión'); }
}

let recetasCache = [];
async function cargarRecetasProducir() {
    try {
        recetasCache = await (await fetch(`${API}/produccion/recetas`)).json();
        const sel = document.getElementById('producir_producto');
        sel.innerHTML = '<option value="">Selecciona una receta...</option>';
        recetasCache.forEach(p => sel.innerHTML += `<option value="${p.id}">${esc(p.nombre)} (stock: ${esc(p.stock_actual)})</option>`);
        renderComboSabores();
        renderListaRecetas();
    } catch (e) { console.error(e); }
}

// #11 · Casillas de sabores para la caja combinada (recetas individuales)
function renderComboSabores() {
    const cont = document.getElementById('combo-sabores');
    if (!cont) return;
    if (!recetasCache.length) {
        cont.innerHTML = '<span style="color:#94a3b8; font-size:0.85rem;">No hay recetas individuales todavía. Crea sabores en "Crear Producto / Receta".</span>';
        return;
    }
    cont.innerHTML = recetasCache.map(p => `
        <label style="display:inline-flex; align-items:center; gap:6px; background:#fdf2f8; border:1px solid #fbcfe8; border-radius:8px; padding:6px 10px; cursor:pointer; font-size:0.88rem;">
            <input type="checkbox" class="combo-sabor" value="${esc(p.id)}" onchange="previewCombo()"> ${esc(p.nombre)}
        </label>`).join('');
}

function saboresComboSeleccionados() {
    return [...document.querySelectorAll('.combo-sabor:checked')].map(c => parseInt(c.value));
}

// #11 · Vista previa: reparte la materia prima 1/N entre los sabores marcados
function previewCombo() {
    const prev = document.getElementById('combo-preview');
    if (!prev) return;
    const ids = saboresComboSeleccionados();
    const cajas = parseInt(document.getElementById('combo-cantidad').value) || 0;
    if (ids.length < 2 || !cajas) { prev.style.display = 'none'; return; }
    const N = ids.length;
    const acum = {}; // insumo -> { nombre, unidad, porCaja, stock }
    ids.forEach(id => {
        const p = recetasCache.find(r => r.id === id);
        if (!p || !p.receta) return;
        p.receta.forEach(ing => {
            if (!acum[ing.insumo_id]) acum[ing.insumo_id] = { nombre: ing.nombre, unidad: ing.unidad_medida, porCaja: 0, stock: parseFloat(ing.stock_actual) };
            acum[ing.insumo_id].porCaja += parseFloat(ing.cantidad_necesaria) / N;
        });
    });
    const filas = Object.values(acum).map(a => {
        const req = parseFloat((a.porCaja * cajas).toFixed(4));
        const falta = a.stock < req;
        return `${req} ${esc(a.unidad)} de ${esc(a.nombre)} ${falta ? '<span style="color:#dc2626;">(¡falta! hay ' + a.stock + ')</span>' : ''}`;
    }).join('<br>');
    prev.style.display = 'block';
    prev.innerHTML = `<strong>Materia prima a descontar (${N} sabores, ${cajas} cajas):</strong><br>${filas || 'Los sabores marcados no tienen receta.'}`;
}

// #11 · Producir la caja combinada
async function producirCombo() {
    const el = document.getElementById('mensaje-combo');
    const sabores = saboresComboSeleccionados();
    const cantidad = parseInt(document.getElementById('combo-cantidad').value) || 0;
    const precio_caja = document.getElementById('combo-precio').value;
    const bodega_asignada = document.getElementById('combo-bodega').value;
    if (sabores.length < 2) return msg(el, false, 'Marca al menos 2 sabores.');
    if (!cantidad) return msg(el, false, 'Indica cuántas cajas vas a producir.');
    if (precio_caja === '' || isNaN(parseFloat(precio_caja))) return msg(el, false, 'Indica el precio de venta de la caja.');
    try {
        const res = await fetch(`${API}/produccion/producir-combo`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sabores, cantidad, precio_caja: parseFloat(precio_caja), bodega_asignada })
        });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) {
            document.querySelectorAll('.combo-sabor:checked').forEach(c => c.checked = false);
            document.getElementById('combo-precio').value = '';
            document.getElementById('combo-preview').style.display = 'none';
            cargarInsumos();
        }
    } catch (e) { msg(el, false, 'Error de conexión'); }
}

document.getElementById('producir_producto').addEventListener('change', actualizarPreviewReceta);
document.getElementById('producir_cantidad').addEventListener('input', () => {
    if (document.querySelector('#preview-receta input[data-insumo]')) recalcularTotalesReceta();
    else actualizarPreviewReceta();
});

// #8 · Receta editable: muestra un input por ingrediente (cantidad por caja de ESTE lote)
function actualizarPreviewReceta() {
    const id = parseInt(document.getElementById('producir_producto').value);
    const cant = parseInt(document.getElementById('producir_cantidad').value) || 0;
    const prev = document.getElementById('preview-receta');
    const prod = recetasCache.find(p => p.id === id);
    if (!prod || !cant) { prev.style.display = 'none'; return; }
    prev.style.display = 'block';
    prev.innerHTML = `<strong>Materia prima a descontar</strong> <small style="color:#64748b;">— puedes ajustar la cantidad por caja solo para este lote (no cambia la receta guardada)</small>
        <table style="width:100%; margin-top:8px; font-size:0.85rem;"><thead><tr>
            <th style="text-align:left;">Materia prima</th><th>Por caja</th><th>Total (${cant} cajas)</th></tr></thead><tbody>` +
        prod.receta.map(r => `<tr>
            <td>${esc(r.nombre)} <small style="color:#94a3b8;">(${esc(r.unidad_medida)})</small></td>
            <td style="text-align:center;"><input type="number" step="0.0001" min="0" value="${esc(r.cantidad_necesaria)}" data-insumo="${esc(r.insumo_id)}" oninput="recalcularTotalesReceta()" style="width:80px; padding:3px; text-align:right;"></td>
            <td style="text-align:center;" id="tot-ing-${esc(r.insumo_id)}"></td>
        </tr>`).join('') + '</tbody></table>';
    recalcularTotalesReceta();
}

// Recalcula los totales por ingrediente según la cantidad y los valores editados
function recalcularTotalesReceta() {
    const cant = parseInt(document.getElementById('producir_cantidad').value) || 0;
    const id = parseInt(document.getElementById('producir_producto').value);
    const prod = recetasCache.find(p => p.id === id);
    if (!prod) return;
    document.querySelectorAll('#preview-receta input[data-insumo]').forEach(inp => {
        const insumoId = inp.dataset.insumo;
        const porCaja = parseFloat(inp.value) || 0;
        const req = parseFloat((porCaja * cant).toFixed(4));
        const ing = prod.receta.find(r => String(r.insumo_id) === String(insumoId));
        const falta = ing && parseFloat(ing.stock_actual) < req;
        const cell = document.getElementById(`tot-ing-${insumoId}`);
        if (cell) cell.innerHTML = `${req} ${falta ? '<span style="color:#dc2626;">(¡falta! hay ' + parseFloat(ing.stock_actual) + ')</span>' : ''}`;
    });
}

document.getElementById('form-producir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-producir');
    const overrides = [...document.querySelectorAll('#preview-receta input[data-insumo]')].map(inp => ({
        insumo_id: parseInt(inp.dataset.insumo),
        cantidad_necesaria: parseFloat(inp.value) || 0
    }));
    const payload = {
        producto_id: document.getElementById('producir_producto').value,
        cantidad: document.getElementById('producir_cantidad').value,
        receta_override: overrides
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
    const tfoot = document.getElementById('tfoot-tickets-compra');
    try {
        const compras = await (await fetch(`${API}/compras`)).json();
        tbody.innerHTML = compras.length ? '' : '<tr><td colspan="7">Sin compras registradas.</td></tr>';
        let total = 0;
        compras.forEach(c => {
            total += Number(c.costo_total);
            tbody.innerHTML += `<tr><td>${esc(c.fecha)}</td><td><strong>${esc(c.insumo)}</strong></td><td>${esc(c.proveedor)}</td><td>${esc(c.cantidad)} ${esc(c.unidad_medida)}</td><td>$${Number(c.costo_unitario).toFixed(2)}</td><td><strong>$${Number(c.costo_total).toFixed(2)}</strong></td>
                <td><button onclick="eliminarCompra(${esc(c.id)})" title="Borrar ticket" style="padding:3px 8px; font-size:0.78rem; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑</button></td></tr>`;
        });
        // #9 · Total al final
        if (tfoot) tfoot.innerHTML = compras.length
            ? `<tr style="background:#f1f5f9; font-weight:800;"><td colspan="5" style="text-align:right;">TOTAL de compras:</td><td style="color:#dc2626;">$${total.toFixed(2)}</td><td></td></tr>`
            : '';
    } catch (e) { tbody.innerHTML = '<tr><td colspan="7">Error al cargar</td></tr>'; if (tfoot) tfoot.innerHTML = ''; }
}

// #8 · Eliminar ticket de compra (revierte el stock)
async function eliminarCompra(id) {
    if (!confirm('¿Borrar este ticket de compra?\n\nSe restará del stock la cantidad que había sumado.')) return;
    try {
        const res = await fetch(`${API}/compras/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) { cargarTicketsCompra(); cargarAnalisisCompras(); }
        else alert(data.mensaje || 'No se pudo borrar');
    } catch (e) { alert('Error de conexión'); }
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
    const prom = document.getElementById('prom-produccion');
    // #7 · Costo promedio de producción por día, semana y mes
    try {
        const periodos = [
            { key: 'dia', label: 'Hoy', color: '#0ea5e9' },
            { key: 'semana', label: 'Esta semana', color: '#8b5cf6' },
            { key: 'mes', label: 'Este mes', color: '#16a34a' }
        ];
        const datos = await Promise.all(periodos.map(p =>
            fetch(`${API}/balance/produccion?periodo=${p.key}`).then(r => r.json())
        ));
        if (prom) {
            prom.innerHTML = periodos.map((p, i) => {
                const r = datos[i].resumen;
                return `<div style="background:#f8fafc; border-radius:10px; padding:10px; text-align:center; border-top:3px solid ${p.color};">
                    <div style="font-size:0.75rem; color:#64748b; text-transform:uppercase; letter-spacing:0.03em;">${p.label}</div>
                    <div style="font-size:1.15rem; font-weight:800; color:${p.color};">$${Number(r.costo_promedio_caja).toFixed(2)}</div>
                    <div style="font-size:0.72rem; color:#94a3b8;">prom./caja</div>
                    <div style="font-size:0.78rem; color:#475569; margin-top:4px;">${r.cajas_producidas} cajas · $${Number(r.costo_total).toFixed(2)}</div>
                </div>`;
            }).join('');
        }
        // Detalle del mes por producto
        const d = datos[2];
        document.getElementById('resumen-produccion').innerHTML =
            `Lotes: <strong>${d.resumen.lotes}</strong> · Cajas: <strong>${d.resumen.cajas_producidas}</strong> · Costo total: <strong>$${Number(d.resumen.costo_total).toFixed(2)}</strong>`;
        tbody.innerHTML = d.porProducto.length ? '' : '<tr><td colspan="3">Sin producción este mes.</td></tr>';
        d.porProducto.forEach(p => tbody.innerHTML += `<tr><td><strong>${esc(p.producto)}</strong></td><td>${esc(p.cajas)}</td><td>$${Number(p.costo).toFixed(2)}</td></tr>`);
    } catch (e) {
        if (prom) prom.innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="3">Error al cargar</td></tr>';
    }
}

// ====================== CAPITAL / CAJA ======================
async function cargarCapital() {
    const tbody = document.getElementById('tabla-capital');
    try {
        const d = await (await fetch(`${API}/capital`)).json();
        document.getElementById('capital-disponible').textContent = `$${Number(d.disponible).toFixed(2)}`;
        document.getElementById('capital-disponible').style.color = Number(d.disponible) >= 0 ? '#16a34a' : '#dc2626';
        document.getElementById('capital-detalle').innerHTML =
            `Entradas netas: $${Number(d.entradas).toFixed(2)} · Gastos: $${Number(d.gastos).toFixed(2)} · Compras: $${Number(d.compras).toFixed(2)}`;
        tbody.innerHTML = d.movimientos.length ? '' : '<tr><td colspan="5" style="color:#94a3b8;">Sin movimientos</td></tr>';
        d.movimientos.forEach(m => {
            const esEntrada = m.tipo === 'entrada';
            const color = esEntrada ? '#16a34a' : '#dc2626';
            const signo = esEntrada ? '+' : '−';
            const accion = m.origen === 'manual'
                ? `<button onclick="eliminarMovimientoCapital(${esc(m.id)})" title="Eliminar" style="padding:3px 8px; font-size:0.78rem; background:#ef4444; color:#fff; border:none; border-radius:6px; cursor:pointer;">🗑</button>`
                : `<small style="color:#94a3b8;">auto</small>`;
            tbody.innerHTML += `<tr>
                <td>${esc(m.fecha)}</td>
                <td>${esc(m.concepto) || '-'}</td>
                <td><span style="color:${color}; font-weight:bold; text-transform:capitalize;">${esc(m.tipo)}</span></td>
                <td style="color:${color}; font-weight:bold;">${signo}$${Number(m.monto).toFixed(2)}</td>
                <td>${accion}</td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5">Error al cargar</td></tr>'; }
}

document.getElementById('form-capital').addEventListener('submit', async (e) => {
    e.preventDefault();
    const el = document.getElementById('mensaje-capital');
    const payload = {
        tipo: document.getElementById('capital-tipo').value,
        monto: document.getElementById('capital-monto').value,
        concepto: document.getElementById('capital-concepto').value
    };
    try {
        const res = await fetch(`${API}/capital`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msg(el, res.ok, data.mensaje);
        if (res.ok) { e.target.reset(); cargarCapital(); }
    } catch (err) { msg(el, false, 'Error de conexión'); }
});

async function eliminarMovimientoCapital(id) {
    if (!confirm('¿Eliminar este movimiento de capital?')) return;
    try {
        const res = await fetch(`${API}/capital/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) cargarCapital();
        else alert(data.mensaje || 'No se pudo eliminar');
    } catch (e) { alert('Error de conexión'); }
}

// ====================== CLIENTES ======================
let _clientesTablaCache = [];

async function cargarClientes() {
    const tbody = document.getElementById('tabla-clientes');
    try {
        _clientesTablaCache = await (await fetch(`${API}/clientes`)).json();
        const buscar = document.getElementById('clientes-buscar');
        if (buscar) buscar.value = '';
        pintarTablaClientes(_clientesTablaCache);
    } catch (e) { tbody.innerHTML = '<tr><td colspan="7">Error al cargar</td></tr>'; }
}

// #5b · Filtrar la tabla de clientes por nombre o teléfono
function filtrarClientesTabla() {
    const q = (document.getElementById('clientes-buscar').value || '').toLowerCase().trim();
    const f = q
        ? _clientesTablaCache.filter(c => String(c.nombre).toLowerCase().includes(q) || String(c.telefono || '').toLowerCase().includes(q))
        : _clientesTablaCache;
    pintarTablaClientes(f);
}

function pintarTablaClientes(clientes) {
    const tbody = document.getElementById('tabla-clientes');
    if (!clientes.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:#94a3b8;">Sin clientes</td></tr>'; return; }
    tbody.innerHTML = clientes.map(c => {
        const bloqueado = c.estatus === 'bloqueado';
        const deuda = parseFloat(c.saldo_deudor);
        return `<tr style="${bloqueado ? 'opacity:0.6; background:#fff5f5;' : ''}">
            <td>${esc(c.id)}</td>
            <td><strong>${esc(c.nombre)}</strong><br><small style="color:#64748b;">${esc(c.telefono) || ''}</small></td>
            <td><small>${esc(c.direccion) || '-'}</small></td>
            <td>$${Number(c.limite_credito).toFixed(2)}</td>
            <td style="font-weight:bold; color:${deuda > 0 ? '#dc2626' : '#16a34a'};">$${deuda.toFixed(2)}</td>
            <td><span style="background:${bloqueado ? '#fee2e2' : '#dcfce7'}; color:${bloqueado ? '#dc2626' : '#16a34a'}; padding:2px 8px; border-radius:10px; font-size:0.8rem; font-weight:bold;">${esc(c.estatus)}</span></td>
            <td style="white-space:nowrap;">
                <button onclick="abrirEditarCliente(${esc(c.id)},${esc(JSON.stringify(c.nombre))},${esc(JSON.stringify(c.direccion||''))},${esc(JSON.stringify(c.telefono||''))},${esc(c.limite_credito)})" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px;">✏️ Editar</button>
                <button onclick="toggleBloqueoCliente(${esc(c.id)},${esc(JSON.stringify(c.nombre))})" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:${bloqueado ? '#16a34a' : '#dc2626'};">${bloqueado ? '🔓 Desbloquear' : '🔒 Bloquear'}</button>
                ${deuda > 0 ? `<button onclick="cobrarCliente(${esc(c.id)},${esc(JSON.stringify(c.nombre))})" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:#2563eb;">💰 Cobrar</button>` : ''}
                <button onclick="verHistorial(${esc(c.id)},${esc(JSON.stringify(c.nombre))})" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:#64748b;">📋 Historial</button>
                <button onclick="eliminarCliente(${esc(c.id)},${esc(JSON.stringify(c.nombre))})" title="Eliminar cliente" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:#991b1b;">🗑</button>
            </td>
        </tr>`;
    }).join('');
}

// #6 · Eliminar cliente
async function eliminarCliente(id, nombre) {
    if (!confirm(`¿Eliminar al cliente "${nombre}"?\n\n(Si tiene pedidos en el historial, el sistema no lo borrará para no descuadrar cuentas; en ese caso mejor bloquéalo.)`)) return;
    try {
        const res = await fetch(`${API}/clientes/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) cargarClientes();
        else alert(data.mensaje || 'No se pudo eliminar');
    } catch (e) { alert('Error de conexión'); }
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
                    <button onclick="abrirEditarRep(${r.id},${esc(JSON.stringify(r.nombre))})" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px;">✏️ Editar</button>
                    <button onclick="toggleRepartidor(${r.id},${esc(JSON.stringify(r.nombre))})" style="width:auto; padding:4px 8px; font-size:0.78rem; margin:2px; background:${activo ? '#dc2626' : '#16a34a'};">${activo ? '⛔ Desactivar' : '✅ Activar'}</button>
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
                        <button onclick="abrirRegistroRetorno(${r.id}, ${esc(JSON.stringify(r.repartidor))}, ${esc(JSON.stringify(fecha))}, ${r.esperado_regreso})"
                            style="width:auto; padding:6px 14px; font-size:0.82rem; background:#2563eb;">
                            ${r.retorno_registrado ? 'Editar' : 'Registrar regreso'}
                        </button>
                    </td>
                </tr>
                ${(r.productos && r.productos.length) ? `<tr><td colspan="8" style="padding:6px 12px; background:#fff;">
                    <div style="font-size:0.85rem; color:#475569;"><strong>📦 Se llevó (total):</strong> ${r.productos.map(pp => `<span style="background:#eef2ff; color:#3730a3; padding:2px 8px; border-radius:10px; margin-right:6px; display:inline-block;"><strong>${esc(pp.cantidad)}</strong> ${esc(pp.producto)}</span>`).join('')}</div>
                </td></tr>` : ''}
                <tr><td colspan="8" style="padding:6px 12px; background:#f8fafc; border-top:1px solid #e2e8f0;">
                    <div style="font-size:0.88rem; color:#475569; display:flex; gap:18px; flex-wrap:wrap; align-items:center;">
                        <span>💵 Cobró: <strong style="color:#16a34a;">$${Number(r.cobrado).toFixed(2)}</strong></span>
                        <span>➖ Gastos: <strong style="color:#dc2626;">$${Number(r.gastos).toFixed(2)}</strong></span>
                        <span style="background:#1e293b; color:#fff; padding:4px 12px; border-radius:8px; font-weight:800;">Debe entregar: $${Number(r.debe_entregar).toFixed(2)}</span>
                    </div>
                </td></tr>
                ${r.notas_retorno ? `<tr><td colspan="8" style="color:#64748b; font-size:0.85rem; padding:4px 12px;">📝 Nota: ${esc(r.notas_retorno)}</td></tr>` : ''}`;

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
