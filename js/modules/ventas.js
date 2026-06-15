// ============================================
// Tu Empresa - Ventas Module
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export function renderVentas(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Ventas</h1>
        <p class="page-subtitle">Registro de ventas y facturación</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-nueva-venta">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nueva Venta
        </button>
        <button class="btn btn-secondary" id="btn-registrar-abono">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Registrar Abono
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-lg">
      <div class="flex items-center gap-md" style="flex-wrap:wrap">
        <input type="date" class="form-control" id="filter-fecha" style="max-width:180px;height:40px" value="${Utils.todayISO()}"/>
        <input type="text" class="form-control" id="search-ventas" placeholder="Buscar por cliente..."
          style="max-width:250px;height:40px"/>
        <select class="form-control" id="filter-tipo-venta" style="max-width:160px;height:40px">
          <option value="">Todos</option>
          <option value="contado">Contado</option>
          <option value="credito">Crédito</option>
        </select>
      </div>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Cliente</th>
              <th>Botellones</th>
              <th>Total</th>
              <th>Tipo</th>
              <th>Pago</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="ventas-tbody"></tbody>
        </table>
      </div>
      <div id="ventas-empty"></div>
    </div>
  `;

  renderVentasTable();

  container.querySelector('#btn-nueva-venta').addEventListener('click', () => openVentaModal());
  container.querySelector('#btn-registrar-abono').addEventListener('click', () => openAbonoModal());
  container.querySelector('#filter-fecha').addEventListener('change', renderVentasTable);
  container.querySelector('#search-ventas').addEventListener('input', Utils.debounce(renderVentasTable, 200));
  container.querySelector('#filter-tipo-venta').addEventListener('change', renderVentasTable);
}

function renderVentasTable() {
  const tbody = document.getElementById('ventas-tbody');
  const emptyDiv = document.getElementById('ventas-empty');
  if (!tbody) return;

  let ventas = store.getAll('ventas').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // Filters
  const fecha = document.getElementById('filter-fecha')?.value;
  const search = (document.getElementById('search-ventas')?.value || '').toLowerCase();
  const tipo = document.getElementById('filter-tipo-venta')?.value;

  if (fecha) {
    const dayStart = new Date(fecha + 'T00:00:00');
    const dayEnd = new Date(fecha + 'T23:59:59');
    ventas = ventas.filter(v => {
      const d = new Date(v.fecha);
      return d >= dayStart && d <= dayEnd;
    });
  }

  if (search) {
    ventas = ventas.filter(v => {
      const cliente = store.getById('clientes', v.clienteId);
      const nombre = cliente ? cliente.nombre.toLowerCase() : 'general';
      return nombre.includes(search);
    });
  }

  if (tipo) {
    ventas = ventas.filter(v => v.tipo === tipo);
  }

  if (ventas.length === 0) {
    tbody.innerHTML = '';
    if (emptyDiv) emptyDiv.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📋</span><span class="empty-state-text">No hay ventas para esta fecha</span></div>';
    return;
  }

  if (emptyDiv) emptyDiv.innerHTML = '';

  tbody.innerHTML = ventas.map(v => {
    const cliente = store.getById('clientes', v.clienteId);
    const nombre = cliente ? cliente.nombre : 'Cliente General';
    const pagosStr = v.pagos ? v.pagos.map(p => {
      const method = Utils.paymentMethods.find(m => m.id === p.metodo);
      return method ? method.icon : p.metodo;
    }).join(' ') : '-';

    return `
      <tr>
        <td>${Utils.formatDateTime(v.fecha)}</td>
        <td class="font-semibold">${Utils.escapeHtml(nombre)}</td>
        <td>${v.botellones}</td>
        <td class="font-semibold">${Utils.formatCurrency(v.total)}</td>
        <td><span class="badge ${v.tipo === 'credito' ? 'badge-warning' : 'badge-success'}">${v.tipo === 'credito' ? 'Crédito' : 'Contado'}</span></td>
        <td>${pagosStr}</td>
        <td>
          <button class="btn btn-sm btn-secondary btn-delete-venta" data-id="${v.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-delete-venta').forEach(btn => {
    btn.addEventListener('click', () => deleteVenta(btn.dataset.id));
  });
}

function openVentaModal() {
  const clientes = store.getAll('clientes');
  const tipos = store.getConfig('tiposBotellon') || [{ id: '20l', nombre: 'Botellón 20 Litros', litros: 20, precio: 1.50 }];
  const inventario = store.getInventarioActual();

  const content = `
    <form id="form-venta">
      <div class="alert-panel info mb-md">
        💧 Inventario disponible: <strong>${Utils.formatNumber(inventario.litros)} L</strong>
      </div>

      <!-- Fila 1: Fecha y Cliente -->
      <div class="form-row">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Fecha de Venta</label>
          <input type="date" class="form-control" name="fecha" id="input-fecha" value="${Utils.todayISO()}" required/>
        </div>
        <div class="form-group" style="flex: 2;">
          <label class="form-label">Cliente (Nombre o RIF)</label>
          <div class="search-container">
            <input type="text" class="form-control" id="search-cliente-input" placeholder="Buscar o dejar vacío para Cliente General" autocomplete="off"/>
            <input type="hidden" name="clienteId" id="hidden-cliente-id" value=""/>
            <div id="search-cliente-results" class="search-results"></div>
          </div>
        </div>
      </div>

      <!-- Fila 2: Detalles del Producto -->
      <div class="form-row">
        <div class="form-group" style="flex: 2;">
          <label class="form-label">Producto / Botellón</label>
          <select class="form-control" name="tipoBotellonId" id="select-tipo-botellon">
            ${tipos.map(t => `<option value="${t.id}" data-precio="${t.precio}" data-litros="${t.litros}">${Utils.escapeHtml(t.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Cantidad</label>
          <input type="number" class="form-control" name="botellones" min="1" value="1" required id="input-botellones"/>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Precio ($)</label>
          <input type="number" class="form-control" name="precio" step="0.01" min="0" value="${tipos[0].precio}" id="input-precio"/>
        </div>
      </div>

      <!-- Total -->
      <div class="alert-panel success mb-md" style="font-size: var(--font-size-lg); justify-content: space-between; padding: var(--space-md);">
        <span>Total a Cobrar:</span>
        <strong id="total-venta" style="font-size: 24px;">${Utils.formatCurrency(tipos[0].precio)}</strong>
      </div>

      <!-- Fila 3: Condición y Pagos -->
      <div class="form-row" style="align-items: flex-start;">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Condición de Pago</label>
          <div class="flex gap-lg" style="padding-top: 10px;">
            <label class="form-check">
              <input type="radio" name="tipo" value="contado" checked/>
              <span>Al Contado</span>
            </label>
            <label class="form-check">
              <input type="radio" name="tipo" value="credito"/>
              <span>A Crédito</span>
            </label>
          </div>
        </div>
        
        <div class="form-group" style="flex: 2; border-left: 1px solid var(--color-border); padding-left: var(--space-md);" id="seccion-pagos">
          <div class="flex items-center justify-between mb-sm">
            <label class="form-label" style="margin:0">Métodos de Pago</label>
            <button type="button" class="btn btn-xs btn-secondary" id="btn-add-pago-venta">+ Añadir</button>
          </div>
          <div id="pagos-list">
            <div class="form-row pago-row" style="margin-bottom: var(--space-xs);">
              <div class="form-group" style="flex: 2; margin-bottom: 0;">
                <select class="form-control pago-metodo">
                  ${Utils.paymentMethods.map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${tipos[0].precio}"/>
              </div>
            </div>
          </div>
          <div class="alert-panel info mt-sm" id="pago-diff-panel" style="display:none; justify-content: space-between; padding: 8px;">
             <span>Abono Extra:</span>
             <strong id="pago-diff-monto">$0.00</strong>
          </div>
        </div>
      </div>
    </form>
  `;

  const modal = openModal({
    title: 'Nueva Venta',
    content,
    size: 'lg',
    saveLabel: 'Registrar',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-venta');
      const fd = new FormData(form);
      const botellones = parseInt(fd.get('botellones'));
      const precio = parseFloat(fd.get('precio'));
      const tipoBotellonId = fd.get('tipoBotellonId');
      const tipoBotellon = tipos.find(t => t.id === tipoBotellonId);
      const clienteId = fd.get('clienteId') || null;
      const tipo = fd.get('tipo');

      if (!botellones || botellones < 1) return;

      const totalVenta = botellones * precio;
      const litrosTotales = botellones * (tipoBotellon?.litros || 20);

      const pagos = [];
      let totalPagado = 0;
      if (tipo === 'contado') {
        overlay.querySelectorAll('.pago-row').forEach(row => {
          const metodo = row.querySelector('.pago-metodo').value;
          const monto = parseFloat(row.querySelector('.pago-monto').value) || 0;
          if (monto > 0) {
            pagos.push({ metodo, monto });
            totalPagado += monto;
          }
        });
        
        if (totalPagado < totalVenta) {
            showToast('El pago ingresado no cubre el total de la venta', 'error');
            return;
        }
      }

      const inputFecha = fd.get('fecha');
      let fechaRegistro = Utils.nowISO();
      if (inputFecha !== Utils.todayISO()) {
          fechaRegistro = new Date(inputFecha + 'T12:00:00').toISOString();
      }

      const venta = {
        id: Utils.generateId(),
        clienteId,
        tipoBotellonId,
        botellones,
        litrosTotales,
        precioUnitario: precio,
        total: totalVenta,
        tipo,
        pagos,
        fecha: fechaRegistro
      };

      store.save('ventas', venta);
      store.descontarVenta(botellones, tipoBotellon?.litros || 20);

      // Registrar abono si hay excedente y cliente seleccionado
      if (clienteId && totalPagado > totalVenta) {
        const excedente = totalPagado - totalVenta;
        const abono = {
          id: Utils.generateId(),
          clienteId,
          monto: excedente,
          metodo: pagos[0]?.metodo || 'efectivo_usd',
          referencia: 'Excedente de venta',
          fecha: Utils.nowISO()
        };
        store.save('abonos', abono);
        showToast(`Venta registrada y abono de ${Utils.formatCurrency(excedente)} acreditado`, 'success');
      } else {
        showToast('Venta registrada con éxito', 'success');
      }

      closeModal();
      renderVentasTable();
    }
  });

  // Client Search Logic
  const searchInput = modal.querySelector('#search-cliente-input');
  const resultsDiv = modal.querySelector('#search-cliente-results');
  const hiddenId = modal.querySelector('#hidden-cliente-id');

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.toLowerCase().trim();
    if (!val) {
      resultsDiv.classList.remove('active');
      hiddenId.value = '';
      return;
    }

    const filtered = clientes.filter(c =>
      c.nombre.toLowerCase().includes(val) ||
      (c.rif && c.rif.toLowerCase().includes(val))
    ).slice(0, 10);

    if (filtered.length === 0) {
      resultsDiv.innerHTML = '<div class="search-item"><span class="search-item-title">No se encontraron clientes</span></div>';
    } else {
      resultsDiv.innerHTML = filtered.map(c => `
        <div class="search-item" data-id="${c.id}" data-nombre="${Utils.escapeHtml(c.nombre)}">
          <span class="search-item-title">${Utils.escapeHtml(c.nombre)}</span>
          <span class="search-item-subtitle">RIF: ${Utils.escapeHtml(c.rif || 'N/A')}</span>
        </div>
      `).join('');

      resultsDiv.querySelectorAll('.search-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const nombre = item.dataset.nombre;
          searchInput.value = nombre;
          hiddenId.value = id;
          resultsDiv.classList.remove('active');
          update(); // Actualizar panel de abono si se selecciona cliente
        });
      });
    }
    resultsDiv.classList.add('active');
  });

  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.classList.remove('active');
    }
  }, { once: true });

  const selectTipo = modal.querySelector('#select-tipo-botellon');
  const inputBot = modal.querySelector('#input-botellones');
  const inputPrecio = modal.querySelector('#input-precio');
  const totalDisplay = modal.querySelector('#total-venta');
  const diffPanel = modal.querySelector('#pago-diff-panel');
  const diffMonto = modal.querySelector('#pago-diff-monto');

  function update(e) {
    const b = parseInt(inputBot.value) || 0;
    const p = parseFloat(inputPrecio.value) || 0;
    const totalVenta = b * p;
    totalDisplay.textContent = Utils.formatCurrency(totalVenta);

    const pagosMontoInputs = modal.querySelectorAll('.pago-monto');
    
    // Si la actualización viene de cambiar botellones o precio, y solo hay 1 método de pago, autocompletamos el monto
    if (e && (e.target === inputBot || e.target === inputPrecio || e.target === selectTipo)) {
        if (pagosMontoInputs.length === 1) {
            pagosMontoInputs[0].value = totalVenta.toFixed(2);
        }
    }

    // Calcular total de pagos
    let totalPagos = 0;
    pagosMontoInputs.forEach(input => {
      totalPagos += parseFloat(input.value) || 0;
    });

    const clienteId = hiddenId.value;
    if (clienteId && totalPagos > totalVenta) {
      diffMonto.textContent = Utils.formatCurrency(totalPagos - totalVenta);
      diffPanel.style.display = 'flex';
    } else {
      diffPanel.style.display = 'none';
    }
  }

  modal.querySelector('#btn-add-pago-venta').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'form-row pago-row';
    row.style.marginTop = 'var(--space-xs)';
    row.innerHTML = `
      <div class="form-group" style="flex:2">
        <select class="form-control pago-metodo">
          ${Utils.paymentMethods.map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="flex:1">
        <input type="number" class="form-control pago-monto" step="0.01" min="0" placeholder="0.00"/>
      </div>
      <button type="button" class="btn btn-sm btn-danger btn-remove-pago" style="align-self:center">✕</button>
    `;
    modal.querySelector('#pagos-list').appendChild(row);
    row.querySelector('.btn-remove-pago').addEventListener('click', () => {
      row.remove();
      update();
    });
    row.querySelector('.pago-monto').addEventListener('input', update);
  });

  modal.querySelector('.pago-monto').addEventListener('input', update);

  selectTipo.addEventListener('change', () => {
    const opt = selectTipo.options[selectTipo.selectedIndex];
    inputPrecio.value = opt.dataset.precio;
    update();
  });

  inputBot.addEventListener('input', update);
  inputPrecio.addEventListener('input', update);

  const radiosTipo = modal.querySelectorAll('input[name="tipo"]');
  const seccionPagos = modal.querySelector('#seccion-pagos');
  radiosTipo.forEach(r => {
    r.addEventListener('change', () => {
      seccionPagos.style.display = r.value === 'credito' ? 'none' : 'block';
    });
  });
}

function openAbonoModal() {
  const clientes = store.getAll('clientes').filter(c => {
    const deuda = store.getDeudaCliente(c.id);
    return deuda > 0;
  });

  if (clientes.length === 0) {
    showToast('No hay clientes con deuda pendiente', 'info');
    return;
  }

  const content = `
    <form id="form-abono">
      <div class="form-group">
        <label class="form-label">Cliente con Deuda *</label>
        <select class="form-control" name="clienteId" id="abono-cliente" required>
          <option value="">Seleccione un cliente</option>
          ${clientes.map(c => {
    const deuda = store.getDeudaCliente(c.id);
    return `<option value="${c.id}">${Utils.escapeHtml(c.nombre)} — Deuda: ${Utils.formatCurrency(deuda)}</option>`;
  }).join('')}
        </select>
      </div>

      <div class="alert-panel warning mb-md" id="abono-deuda-info" style="display:none">
        Deuda actual: <strong id="abono-deuda-monto">$0.00</strong>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto del Abono *</label>
          <input type="number" class="form-control" name="monto" step="0.01" min="0.01" required placeholder="0.00"/>
        </div>
        <div class="form-group">
          <label class="form-label">Método de Pago</label>
          <select class="form-control" name="metodo">
            ${Utils.paymentMethods.map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Referencia (opcional)</label>
        <input type="text" class="form-control" name="referencia" placeholder="Nro. de referencia"/>
      </div>
    </form>
  `;

  const modal = openModal({
    title: 'Registrar Abono',
    content,
    saveLabel: 'Registrar Abono',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-abono');
      const fd = new FormData(form);
      const clienteId = fd.get('clienteId');
      const monto = parseFloat(fd.get('monto'));

      if (!clienteId) {
        showToast('Seleccione un cliente', 'error');
        return;
      }
      if (!monto || monto <= 0) {
        showToast('Monto inválido', 'error');
        return;
      }

      const abono = {
        id: Utils.generateId(),
        clienteId,
        monto,
        metodo: fd.get('metodo'),
        referencia: fd.get('referencia')?.trim() || '',
        fecha: Utils.nowISO()
      };

      store.save('abonos', abono);
      showToast(`Abono de ${Utils.formatCurrency(monto)} registrado correctamente`, 'success');
      closeModal();
      renderVentasTable();
    }
  });

  // Show debt info when selecting a client
  modal.querySelector('#abono-cliente').addEventListener('change', (e) => {
    const clienteId = e.target.value;
    const infoDiv = modal.querySelector('#abono-deuda-info');
    const montoSpan = modal.querySelector('#abono-deuda-monto');
    if (clienteId) {
      const deuda = store.getDeudaCliente(clienteId);
      montoSpan.textContent = Utils.formatCurrency(deuda);
      infoDiv.style.display = 'flex';
    } else {
      infoDiv.style.display = 'none';
    }
  });
}

function deleteVenta(id) {
  openModal({
    title: 'Eliminar Venta',
    content: '<p>¿Estás seguro de que deseas eliminar esta venta?</p><p class="text-muted mt-md">Se restaurará el inventario correspondiente.</p>',
    saveLabel: 'Eliminar',
    onSave: () => {
      const venta = store.getById('ventas', id);
      if (venta) {
        // Restore inventory based on recorded liters
        const inv = store.getInventarioActual();
        inv.litros += (venta.litrosTotales || venta.botellones * 20);
        store.setConfig('inventario', inv);
      }
      store.delete('ventas', id);
      showToast('Venta eliminada e inventario restaurado', 'success');
      closeModal();
      renderVentasTable();
    }
  });
}
