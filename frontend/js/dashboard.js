// --- NAVEGACIÓN ---
function cambiarVista(vista) {
    document.querySelectorAll('.vista').forEach(el => el.classList.remove('activa'));
    document.querySelectorAll('.sidebar a').forEach(el => el.classList.remove('active'));
    document.getElementById(`vista-${vista}`).classList.add('activa');
    document.getElementById(`nav-${vista}`).classList.add('active');

    if (vista === 'pedidos') { cargarOpcionesPedidos(); cargarPedidosMonitor(); }
    if (vista === 'clientes') cargarClientes();
    if (vista === 'repartidores') cargarRepartidores();
    if (vista === 'produccion') cargarInsumos();
    if (vista === 'balance') cargarBalance();
}

// --- LÓGICA PEDIDOS ---
async function cargarOpcionesPedidos() {
    try {
        const resC = await fetch('http://localhost:3001/api/clientes');
        const clientes = await resC.json();
        const selectCliente = document.getElementById('cliente_id');
        selectCliente.innerHTML = '<option value="">Selecciona un cliente...</option>';
        clientes.forEach(c => selectCliente.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);

        const resR = await fetch('http://localhost:3001/api/repartidores');
        const repartidores = await resR.json();
        const selectRepartidor = document.getElementById('repartidor_id');
        selectRepartidor.innerHTML = '<option value="">Selecciona un repartidor...</option>';
        repartidores.forEach(r => selectRepartidor.innerHTML += `<option value="${r.id}">${r.nombre}</option>`);
    } catch (e) { console.error("Error al cargar opciones"); }
}

async function cargarPedidosMonitor() {
    const tbody = document.getElementById('tabla-pedidos-monitor');
    try {
        const res = await fetch('http://localhost:3001/api/pedidos');
        const pedidos = await res.json();
        tbody.innerHTML = '';
        pedidos.forEach(p => {
            let colorEstatus = p.estatus === 'entregado' ? 'green' : (p.estatus === 'reagendado' ? 'orange' : 'blue');
            let botonEntregar = p.estatus === 'pendiente' 
                ? `<button onclick="marcarComoEntregadoAdmin(${p.id}, ${p.total})" style="padding: 5px 10px; background-color: #16a34a; font-size: 12px; width: auto;">✔️ Entregar</button>` : '-';
            tbody.innerHTML += `<tr><td>#${p.id}</td><td><strong>${p.cliente}</strong></td><td>${p.repartidor}</td><td>$${p.total}</td><td style="color: ${colorEstatus}; font-weight: bold; text-transform: uppercase;">${p.estatus}</td><td>${botonEntregar}</td></tr>`;
        });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="6">Error al cargar el monitor</td></tr>'; }
}

async function marcarComoEntregadoAdmin(id, totalEsperado) {
    const monto = prompt(`Se cobrará este pedido por el total de $${totalEsperado}.\nSi el monto es diferente, ingresa el valor real:`, totalEsperado);
    if(monto !== null) {
        try {
            const res = await fetch(`http://localhost:3001/api/pedidos/${id}/entregar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ monto_cobrado: parseFloat(monto) }) });
            if (res.ok) { cargarPedidosMonitor(); alert("¡Pedido entregado con éxito!"); } else { alert("Error al actualizar"); }
        } catch (e) { alert("Error de conexión"); }
    }
}

document.getElementById('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cliente_id = document.getElementById('cliente_id').value;
    const repartidor_id = document.getElementById('repartidor_id').value;
    const total = document.getElementById('total').value;
    const msgEl = document.getElementById('mensaje-pedido');
    try {
        const res = await fetch('http://localhost:3001/api/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id, repartidor_id, total }) });
        const data = await res.json();
        msgEl.className = res.ok ? 'mensaje exito' : 'mensaje error'; msgEl.textContent = data.mensaje; msgEl.style.display = 'block';
        if(res.ok) { e.target.reset(); cargarPedidosMonitor(); }
        setTimeout(() => msgEl.style.display = 'none', 4000);
    } catch (err) { alert('Error de conexión'); }
});

// --- LÓGICA CLIENTES ---
async function cargarClientes() {
    const tbody = document.getElementById('tabla-clientes');
    try {
        const res = await fetch('http://localhost:3001/api/clientes');
        const clientes = await res.json();
        tbody.innerHTML = '';
        clientes.forEach(c => {
            tbody.innerHTML += `<tr><td>${c.id}</td><td><strong>${c.nombre}</strong><br><small>${c.telefono || ''}</small></td><td>${c.direccion || 'Sin dirección'}</td><td>$${c.limite_credito}</td><td style="color:red; font-weight:bold;">$${c.saldo_deudor}</td><td>${c.estatus}</td></tr>`;
        });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="6">Error al cargar</td></tr>'; }
}

document.getElementById('form-nuevo-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('mensaje-nuevo-cliente');
    const payload = { nombre: document.getElementById('nuevo_nombre').value, direccion: document.getElementById('nueva_direccion').value, telefono: document.getElementById('nuevo_telefono').value, limite_credito: document.getElementById('nuevo_limite').value };
    try {
        const res = await fetch('http://localhost:3001/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msgEl.className = res.ok ? 'mensaje exito' : 'mensaje error'; msgEl.textContent = data.mensaje; msgEl.style.display = 'block';
        if(res.ok) { e.target.reset(); cargarClientes(); }
    } catch (err) { msgEl.className = 'mensaje error'; msgEl.textContent = 'Error de conexión'; msgEl.style.display = 'block'; }
    setTimeout(() => msgEl.style.display = 'none', 4000);
});

// --- LÓGICA REPARTIDORES ---
async function cargarRepartidores() {
    const tbody = document.getElementById('tabla-repartidores');
    try {
        const res = await fetch('http://localhost:3001/api/repartidores');
        const reps = await res.json();
        tbody.innerHTML = '';
        reps.forEach(r => {
            let estatusColor = r.estatus === 'activo' ? 'green' : 'gray';
            tbody.innerHTML += `<tr><td>${r.id}</td><td><strong>${r.nombre}</strong></td><td style="color: ${estatusColor}; font-weight: bold; text-transform: uppercase;">${r.estatus}</td></tr>`;
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="3">Error al cargar repartidores</td></tr>'; }
}

document.getElementById('form-repartidor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('mensaje-repartidor');
    const payload = { nombre: document.getElementById('rep_nombre').value, pin: document.getElementById('rep_pin').value };
    try {
        const res = await fetch('http://localhost:3001/api/repartidores', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        const data = await res.json();
        msgEl.className = res.ok ? 'mensaje exito' : 'mensaje error';
        msgEl.textContent = data.mensaje; msgEl.style.display = 'block';
        if(res.ok) { e.target.reset(); cargarRepartidores(); }
    } catch (err) { msgEl.className = 'mensaje error'; msgEl.textContent = 'Error de conexión'; msgEl.style.display = 'block'; }
    setTimeout(() => msgEl.style.display = 'none', 4000);
});

// --- LÓGICA PRODUCCIÓN E INVENTARIO ---
async function cargarInsumos() {
    const tbody = document.getElementById('tabla-insumos');
    const selectInsumos = document.getElementById('insumo_comprado_id');
    const selectReceta = document.getElementById('nuevo_prod_insumo');
    const selectInsumoUsado = document.getElementById('prod_insumo_usado'); // NUEVO
    
    try {
        const res = await fetch('http://localhost:3001/api/produccion/insumos');
        const insumos = await res.json();
        
        tbody.innerHTML = '';
        selectInsumos.innerHTML = '<option value="">Selecciona un ingrediente...</option>';
        selectReceta.innerHTML = '<option value="">Selecciona un ingrediente...</option>';
        if (selectInsumoUsado) selectInsumoUsado.innerHTML = '<option value="">Selecciona qué usaste...</option>'; // NUEVO
        
        insumos.forEach(i => {
            let alertaHTML = '';
            let colorFondo = '#e0f2fe'; let colorTexto = '#0284c7';
            if (i.stock_minimo !== undefined && parseFloat(i.stock_actual) <= parseFloat(i.stock_minimo)) {
                colorFondo = '#fee2e2'; colorTexto = '#dc2626'; alertaHTML = ' ⚠️ ¡STOCK BAJO!';
            }
            tbody.innerHTML += `<tr><td>${i.id}</td><td><strong>${i.nombre}</strong><br><small style="color: gray;">Ubicación: ${i.ubicacion || 'Bodega Central'}</small></td><td><span style="background:${colorFondo}; padding:5px 10px; border-radius:10px; color:${colorTexto}; font-weight:bold;">${i.stock_actual} ${i.unidad_medida} ${alertaHTML}</span></td></tr>`;
            
            let optionHTML = `<option value="${i.id}">${i.nombre} (Medida: ${i.unidad_medida})</option>`;
            selectInsumos.innerHTML += optionHTML;
            selectReceta.innerHTML += optionHTML;
            if (selectInsumoUsado) selectInsumoUsado.innerHTML += optionHTML; // NUEVO
        });
    } catch (err) { tbody.innerHTML = '<tr><td colspan="3">Error al cargar inventario</td></tr>'; }
}

let recetaTemporal = []; 

function agregarIngredienteAReceta() {
    const select = document.getElementById('nuevo_prod_insumo');
    const insumo_id = select.value;
    const nombreInsumo = select.options[select.selectedIndex].text;
    const cantidad = document.getElementById('nuevo_prod_cantidad').value;
    if (!insumo_id || !cantidad) return alert("Selecciona un ingrediente e ingresa la cantidad.");
    recetaTemporal.push({ insumo_id: parseInt(insumo_id), nombre: nombreInsumo, cantidad_necesaria: parseFloat(cantidad) });
    document.getElementById('nuevo_prod_insumo').value = '';
    document.getElementById('nuevo_prod_cantidad').value = '';
    dibujarListaReceta();
}

function dibujarListaReceta() {
    const ul = document.getElementById('lista-ingredientes-receta');
    ul.innerHTML = recetaTemporal.map((ing, idx) => `<li>${ing.cantidad_necesaria} de ${ing.nombre} <button type="button" onclick="quitarIngrediente(${idx})" style="background:none; color:red; border:none; cursor:pointer;">[Eliminar]</button></li>`).join('');
}

function quitarIngrediente(index) { recetaTemporal.splice(index, 1); dibujarListaReceta(); }

document.getElementById('form-nuevo-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('mensaje-nuevo-producto');
    const tipoProducto = document.getElementById('nuevo_prod_tipo').value;
    const bodega = document.getElementById('nuevo_prod_bodega').value;

    if (tipoProducto === 'propio' && recetaTemporal.length === 0) return alert("Los productos propios deben tener al menos un ingrediente en la receta.");

    const payload = { 
        nombre: document.getElementById('nuevo_prod_nombre').value, 
        precio_caja: document.getElementById('nuevo_prod_precio').value, 
        receta: recetaTemporal,
        tipo: tipoProducto,
        bodega_asignada: parseInt(bodega)
    };

    try {
        const res = await fetch('http://localhost:3001/api/produccion/nuevo-producto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msgEl.className = res.ok ? 'mensaje exito' : 'mensaje error'; msgEl.textContent = data.mensaje; msgEl.style.display = 'block';
        if(res.ok) { e.target.reset(); recetaTemporal = []; dibujarListaReceta(); }
    } catch (err) { msgEl.className = 'mensaje error'; msgEl.textContent = 'Error de conexión'; msgEl.style.display = 'block'; }
    setTimeout(() => msgEl.style.display = 'none', 5000);
});

// ================= LOGICA HORNEADO MANUAL =================
let insumosUsadosEnHorneado = [];

function agregarInsumoAlHorneado() {
    const select = document.getElementById('prod_insumo_usado');
    const insumo_id = select.value;
    const nombre = select.options[select.selectedIndex].text;
    const cantidad = document.getElementById('prod_cantidad_usada').value;

    if (!insumo_id || !cantidad) return alert("Selecciona un insumo y su cantidad.");

    insumosUsadosEnHorneado.push({ insumo_id: parseInt(insumo_id), nombre, cantidad_usada: parseFloat(cantidad) });
    
    select.value = ''; document.getElementById('prod_cantidad_usada').value = '';
    dibujarListaHorneado();
}

function dibujarListaHorneado() {
    const ul = document.getElementById('lista-insumos-horneado');
    ul.innerHTML = insumosUsadosEnHorneado.map((ing, idx) => 
        `<li>${ing.cantidad_usada} de ${ing.nombre} <button type="button" onclick="quitarInsumoHorneado(${idx})" style="color:red; background:none; border:none; cursor:pointer; margin-left:10px;">[Eliminar]</button></li>`
    ).join('');
}

function quitarInsumoHorneado(index) {
    insumosUsadosEnHorneado.splice(index, 1);
    dibujarListaHorneado();
}

document.getElementById('form-produccion').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(insumosUsadosEnHorneado.length === 0) return alert("Debes registrar al menos un ingrediente usado.");

    const payload = { 
        producto_id: document.getElementById('prod_producto_id').value, 
        cantidad_cajas: document.getElementById('prod_cajas').value,
        ingredientes_usados: insumosUsadosEnHorneado 
    };

    const msgEl = document.getElementById('mensaje-produccion');
    try {
        const res = await fetch('http://localhost:3001/api/produccion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msgEl.className = res.ok ? 'mensaje exito' : 'mensaje error'; 
        msgEl.textContent = data.mensaje; 
        msgEl.style.display = 'block';
        
        if(res.ok) { 
            e.target.reset(); 
            insumosUsadosEnHorneado = []; 
            dibujarListaHorneado();
            cargarInsumos(); // Recargamos para ver el inventario actualizado
        }
    } catch (err) { 
        msgEl.className = 'mensaje error'; msgEl.textContent = 'Error de conexión'; msgEl.style.display = 'block'; 
    }
    setTimeout(() => msgEl.style.display = 'none', 5000);
});
// ==========================================================

document.getElementById('form-entrada-insumo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('mensaje-insumo');
    const payload = { insumo_id: document.getElementById('insumo_comprado_id').value, cantidad_comprada: document.getElementById('cantidad_comprada').value };
    try {
        const res = await fetch('http://localhost:3001/api/produccion/insumos/entrada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        msgEl.className = res.ok ? 'mensaje exito' : 'mensaje error'; msgEl.textContent = data.mensaje; msgEl.style.display = 'block';
        if(res.ok) { e.target.reset(); cargarInsumos(); }
    } catch (err) { msgEl.className = 'mensaje error'; msgEl.textContent = 'Error de conexión'; msgEl.style.display = 'block'; }
    setTimeout(() => msgEl.style.display = 'none', 5000);
});

// --- LÓGICA BALANCE FINANCIERO ---
async function cargarBalance() {
    const elIngresos = document.getElementById('balance-ingresos'); const elEgresos = document.getElementById('balance-egresos'); const elUtilidad = document.getElementById('balance-utilidad');
    elIngresos.textContent = 'Calculando...'; elEgresos.textContent = 'Calculando...'; elUtilidad.textContent = 'Calculando...';
    try {
        const res = await fetch('http://localhost:3001/api/balance/dashboard');
        const data = await res.json();
        elIngresos.textContent = `$${data.ingresos}`; elEgresos.textContent = `$${data.egresos}`; elUtilidad.textContent = `$${data.utilidad}`;
        elUtilidad.className = parseFloat(data.utilidad) >= 0 ? 'monto utilidad-positiva' : 'monto utilidad-negativa';
    } catch (error) { elUtilidad.textContent = 'Error'; }
}

window.onload = () => { cargarOpcionesPedidos(); cargarPedidosMonitor(); };