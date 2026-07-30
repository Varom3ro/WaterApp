// ============================================
// Tu Empresa - Clientes Module
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export function renderClientes(container) {
  const clientes = store.getAll('clientes');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Clientes</h1>
        <p class="page-subtitle">Gestión de clientes y cuentas</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-nuevo-cliente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo Cliente
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-lg">
      <div class="flex items-center gap-md" style="flex-wrap:wrap">
        <input type="text" class="form-control" id="search-clientes" placeholder="Buscar por nombre, RIF, local..."
          style="max-width:300px;height:40px"/>
        <select class="form-control" id="filter-estatus" style="max-width:180px;height:40px">
          <option value="">Todos los estatus</option>
          <option value="al_dia">Al Día</option>
          <option value="con_abono">Con Abono</option>
          <option value="debe">Debe</option>
          <option value="moroso">Moroso</option>
        </select>
      </div>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="table-container">
        <table class="table" id="tabla-clientes">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>RIF / Cédula</th>
              <th>Ubicación</th>
              <th>Teléfono</th>
              <th>Deuda</th>
              <th>Estatus</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="clientes-tbody">
          </tbody>
        </table>
      </div>
      ${clientes.length === 0 ? '<div class="empty-state"><span class="empty-state-icon">👥</span><span class="empty-state-text">No hay clientes registrados. ¡Crea el primero!</span></div>' : ''}
    </div>
  `;

  renderClientesTable(clientes);

  // Events
  container.querySelector('#btn-nuevo-cliente').addEventListener('click', () => openClienteModal());
  container.querySelector('#search-clientes').addEventListener('input', Utils.debounce(filterClientes, 200));
  container.querySelector('#filter-estatus').addEventListener('change', filterClientes);
}

function renderClientesTable(clientes) {
  const tbody = document.getElementById('clientes-tbody');
  if (!tbody) return;

  tbody.innerHTML = clientes.map(c => {
    const estatus = store.calcularEstatusCliente(c.id);
    const statusInfo = Utils.clientStatus[estatus];
    const deuda = store.getDeudaCliente(c.id);
    const ubicacion = c.tipoUbicacion === 'externo'
      ? [c.municipio, c.urbanizacion, c.calle, c.edificio].filter(Boolean).join(', ')
      : [c.sector, c.nivel, c.local, c.nombreLocal].filter(Boolean).join(' / ');

    return `
      <tr data-id="${c.id}">
        <td><span class="font-semibold">${Utils.escapeHtml(c.nombre)}</span></td>
        <td>${Utils.escapeHtml(c.rif || '-')}</td>
        <td>${Utils.escapeHtml(ubicacion || '-')}</td>
        <td>${Utils.escapeHtml(c.telefono || '-')}</td>
        <td class="${deuda > 0 ? 'text-danger font-semibold' : ''}">${Utils.formatCurrency(deuda)}</td>
        <td><span class="badge ${statusInfo.class}">${statusInfo.label}</span></td>
        <td>
          <div class="flex gap-sm">
            ${deuda > 0 ? `<button class="btn btn-sm btn-success btn-collect-deuda" data-id="${c.id}" title="Cobrar Deuda">💵</button>` : ''}
            <button class="btn btn-sm btn-secondary btn-edit-cliente" data-id="${c.id}" title="Editar">✏️</button>
            <button class="btn btn-sm btn-secondary btn-view-cliente" data-id="${c.id}" title="Ver detalle">👁️</button>
            <button class="btn btn-sm btn-secondary btn-delete-cliente" data-id="${c.id}" title="Eliminar">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach row events
  tbody.querySelectorAll('.btn-collect-deuda').forEach(btn => {
    btn.addEventListener('click', () => openAbonoClienteDirecto(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-edit-cliente').forEach(btn => {
    btn.addEventListener('click', () => openClienteModal(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-view-cliente').forEach(btn => {
    btn.addEventListener('click', () => viewClienteDetail(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-delete-cliente').forEach(btn => {
    btn.addEventListener('click', () => deleteCliente(btn.dataset.id));
  });
}

function filterClientes() {
  const search = (document.getElementById('search-clientes')?.value || '').toLowerCase();
  const estatus = document.getElementById('filter-estatus')?.value || '';

  let clientes = store.getAll('clientes');

  if (search) {
    clientes = clientes.filter(c =>
      (c.nombre || '').toLowerCase().includes(search) ||
      (c.rif || '').toLowerCase().includes(search) ||
      (c.local || '').toLowerCase().includes(search) ||
      (c.nombreLocal || '').toLowerCase().includes(search) ||
      (c.sector || '').toLowerCase().includes(search) ||
      (c.urbanizacion || '').toLowerCase().includes(search) ||
      (c.municipio || '').toLowerCase().includes(search)
    );
  }

  if (estatus) {
    clientes = clientes.filter(c => store.calcularEstatusCliente(c.id) === estatus);
  }

  renderClientesTable(clientes);
}

export function openClienteModal(id = null, onSuccess = null) {
  const isEdit = !!id;
  const cliente = isEdit ? store.getById('clientes', id) : {};

  const content = `
    <form id="form-cliente">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nombre / Razón Social *</label>
          <input type="text" class="form-control" name="nombre" value="${Utils.escapeHtml(cliente.nombre || '')}" required/>
        </div>
        <div class="form-group">
          <label class="form-label">RIF / Cédula</label>
          <div style="display: flex; gap: var(--space-xs);">
            <select class="form-control" name="rifPrefix" style="width: 80px; flex-shrink: 0; padding-right: 25px;">
              <option value="V" ${cliente.rif?.startsWith('V') ? 'selected' : ''}>V</option>
              <option value="J" ${cliente.rif?.startsWith('J') ? 'selected' : ''}>J</option>
            </select>
            <input type="text" class="form-control" name="rifNumber" value="${Utils.escapeHtml(cliente.rif ? (cliente.rif.includes('-') ? cliente.rif.split('-')[1] : cliente.rif.replace(/^[VJ]-?/, '')) : '')}" placeholder="12345678" style="flex: 1;"/>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Teléfono</label>
        <input type="text" class="form-control" name="telefono" value="${Utils.escapeHtml(cliente.telefono || '')}" placeholder="0412-1234567"/>
      </div>

      <h3 style="font-size:var(--font-size-md);margin:var(--space-lg) 0 var(--space-md);color:var(--color-text-secondary)">📍 Ubicación del Cliente</h3>
      <div id="campos-ubicacion">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Municipio / Zona</label>
            <select class="form-control" name="municipio" required>
              ${['Libertador', 'Chacao', 'Baruta', 'Sucre', 'El Hatillo'].map(m => `
                <option value="${m}" ${(cliente.municipio || 'Libertador') === m ? 'selected' : ''}>${m}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Urbanización / Barrio</label>
            <select class="form-control" name="urbanizacion" required>
              ${['El Paraíso', 'Montalbán', 'Vista Alegre', 'La Quebradita', 'Bella Vista', 'San Martín', 'Juan Pablo II'].map(u => `
                <option value="${u}" ${(cliente.urbanizacion || 'El Paraíso') === u ? 'selected' : ''}>${u}</option>
              `).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Calle / Avenida</label>
            <input type="text" class="form-control" name="calle" value="${Utils.escapeHtml(cliente.calle || '')}" placeholder="Ej: Av. Principal"/>
          </div>
          <div class="form-group">
            <label class="form-label">Edificio / Casa</label>
            <input type="text" class="form-control" name="edificio" value="${Utils.escapeHtml(cliente.edificio || '')}" placeholder="Ej: Edif. Los Pinos, Piso 3"/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Punto de Referencia</label>
          <input type="text" class="form-control" name="referencia" value="${Utils.escapeHtml(cliente.referencia || '')}" placeholder="Ej: Frente a la panadería"/>
        </div>
      </div>

      <h3 style="font-size:var(--font-size-md);margin:var(--space-lg) 0 var(--space-md);color:var(--color-text-secondary)">⚙️ Límites de Crédito</h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Límite por Monto ($)</label>
          <input type="number" class="form-control" name="limiteMonto" value="${cliente.limiteMonto !== undefined ? cliente.limiteMonto : '0.00'}" placeholder="0.00" step="0.01" min="0"/>
        </div>
        <div class="form-group">
          <label class="form-label">Límite por Días</label>
          <input type="number" class="form-control" name="limiteDias" value="${cliente.limiteDias !== undefined ? cliente.limiteDias : '0'}" placeholder="0" min="0"/>
        </div>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'Editar Cliente' : 'Nuevo Cliente',
    content,
    size: 'lg',
    saveLabel: isEdit ? 'Actualizar' : 'Crear Cliente',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-cliente');
      const fd = new FormData(form);
      const nombre = fd.get('nombre')?.trim();
      if (!nombre) {
        showToast('El nombre es obligatorio', 'error');
        return;
      }

      const data = {
        nombre,
        rif: fd.get('rifNumber').trim() ? `${fd.get('rifPrefix')}-${fd.get('rifNumber').trim()}` : '',
        telefono: fd.get('telefono')?.trim() || '',
        tipoUbicacion: 'externo',
        sector: '',
        nivel: '',
        local: '',
        nombreLocal: '',
        municipio: fd.get('municipio')?.trim() || '',
        urbanizacion: fd.get('urbanizacion')?.trim() || '',
        calle: fd.get('calle')?.trim() || '',
        edificio: fd.get('edificio')?.trim() || '',
        referencia: fd.get('referencia')?.trim() || '',
        limiteMonto: parseFloat(fd.get('limiteMonto')),
        limiteDias: parseInt(fd.get('limiteDias'))
      };
      
      // Handle NaN for defaults
      data.limiteMonto = isNaN(data.limiteMonto) ? null : data.limiteMonto;
      data.limiteDias = isNaN(data.limiteDias) ? null : data.limiteDias;

      if (isEdit) {
        store.update('clientes', id, data);
        showToast('Cliente actualizado correctamente', 'success');
      } else {
        data.id = Utils.generateId();
        data.createdAt = Utils.nowISO();
        store.save('clientes', data);
        showToast('Cliente creado correctamente', 'success');
      }

      closeModal();
      if (onSuccess && !isEdit) {
        onSuccess(data);
      }
      // Refresh only if we are on the clients page
      const container = document.querySelector('.main-content');
      if (container && container.querySelector('.page-title')?.textContent === 'Clientes') {
         renderClientes(container);
      }
    }
  });
}

function viewClienteDetail(id) {
  const cliente = store.getById('clientes', id);
  if (!cliente) return;

  const estatus = store.calcularEstatusCliente(id);
  const statusInfo = Utils.clientStatus[estatus];
  const deuda = store.getDeudaCliente(id);
  const ventas = store.getAll('ventas').filter(v => v.clienteId === id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const abonos = store.getAll('abonos').filter(a => a.clienteId === id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const ubicacion = cliente.tipoUbicacion === 'externo'
    ? [cliente.municipio, cliente.urbanizacion, cliente.calle, cliente.edificio].filter(Boolean).join(', ')
    : [cliente.sector, cliente.nivel, cliente.local, cliente.nombreLocal].filter(Boolean).join(' / ');

  const summaryText = `*Tu Empresa - Estado de Cuenta*\n👤 Cliente: ${cliente.nombre}\n📍 Ubicación: ${ubicacion || 'N/A'}\n\n*Deuda Pendiente:* ${Utils.formatCurrency(deuda)}\n*Estatus actual:* ${statusInfo.label}\n\n_Generado el ${Utils.formatDateTime(Utils.nowISO())}_`;
  
  const content = `
    <div style="display:flex;gap:var(--space-md); flex-wrap:wrap; margin-bottom:var(--space-md);">
       <button class="btn btn-sm btn-success flex-1" id="btn-wa-receipt" style="display:flex; justify-content:center; align-items:center; gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          Enviar WhatsApp
       </button>
       ${deuda > 0 ? `
       <button class="btn btn-sm btn-primary flex-1" id="btn-collect-receipt" style="display:flex; justify-content:center; align-items:center; gap:8px;">
          💵 Registrar Cobro / Abono
       </button>
       ` : ''}
    </div>

    <div style="display:flex;gap:var(--space-lg);flex-wrap:wrap">
      <div style="flex:1;min-width:250px">
        <h3 style="margin-bottom:var(--space-md)">Información</h3>
        <p><strong>RIF:</strong> ${Utils.escapeHtml(cliente.rif || '-')}</p>
        <p><strong>Teléfono:</strong> ${Utils.escapeHtml(cliente.telefono || '-')}</p>
        <p><strong>Ubicación:</strong> ${Utils.escapeHtml(ubicacion || '-')}</p>
        ${cliente.referencia ? `<p><strong>Punto de Referencia:</strong> ${Utils.escapeHtml(cliente.referencia)}</p>` : ''}
        <p><strong>Estatus:</strong> <span class="badge ${statusInfo.class}">${statusInfo.label}</span></p>
        <p><strong>Deuda:</strong> <span class="${deuda > 0 ? 'text-danger font-bold' : ''}">${Utils.formatCurrency(deuda)}</span></p>
      </div>
      <div style="flex:1;min-width:250px">
        <h3 style="margin-bottom:var(--space-md)">Límites de Crédito</h3>
        <p><strong>Monto máx:</strong> ${cliente.limiteMonto ? Utils.formatCurrency(cliente.limiteMonto) : 'Sin límite'}</p>
        <p><strong>Días máx:</strong> ${cliente.limiteDias || 'Sin límite'}</p>
      </div>
    </div>

    <h3 style="margin:var(--space-lg) 0 var(--space-md)">Últimas Compras</h3>
    ${ventas.length > 0 ? `
      <div class="table-container">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Botellones</th><th>Total</th><th>Tipo</th></tr></thead>
          <tbody>
            ${ventas.slice(0, 10).map(v => `
              <tr>
                <td>${Utils.formatDateTime(v.fecha)}</td>
                <td>${v.botellones}</td>
                <td>${Utils.formatCurrency(v.total)}</td>
                <td><span class="badge ${v.tipo === 'credito' ? 'badge-warning' : 'badge-success'}">${v.tipo === 'credito' ? 'Crédito' : 'Contado'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="text-muted">Sin compras registradas</p>'}

    <h3 style="margin:var(--space-lg) 0 var(--space-md)">Abonos Recibidos</h3>
    ${abonos.length > 0 ? `
      <div class="table-container">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th></tr></thead>
          <tbody>
            ${abonos.slice(0, 10).map(a => `
              <tr>
                <td>${Utils.formatDateTime(a.fecha)}</td>
                <td class="text-success font-semibold">${Utils.formatCurrency(a.monto)}</td>
                <td>${a.metodo || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="text-muted">Sin abonos registrados</p>'}
  `;

  const overlay = openModal({
    title: cliente.nombre,
    content,
    size: 'lg',
    showFooter: false
  });

  // Event Listeners for Receipts
  if(overlay) {
    overlay.querySelector('#btn-wa-receipt').addEventListener('click', () => {
       const phone = (cliente.telefono || '').replace(/\D/g, '');
       const waUrl = `https://wa.me/${phone.length > 8 ? '58' + phone.slice(-10) : ''}?text=${encodeURIComponent(summaryText)}`;
       window.open(waUrl, '_blank');
    });

    const collectBtn = overlay.querySelector('#btn-collect-receipt');
    if (collectBtn) {
      collectBtn.addEventListener('click', () => {
        closeModal();
        openAbonoClienteDirecto(id);
      });
    }
  }
}

function openAbonoClienteDirecto(clienteId) {
  const cliente = store.getById('clientes', clienteId);
  if (!cliente) return;

  const deuda = store.getDeudaCliente(clienteId);
  if (deuda <= 0) {
    showToast('El cliente no tiene deuda pendiente', 'info');
    return;
  }

  const content = `
    <form id="form-abono-directo">
      <div class="alert-panel warning mb-md">
        Deuda actual de ${Utils.escapeHtml(cliente.nombre)}: <strong>${Utils.formatCurrency(deuda)}</strong>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto del Abono *</label>
          <input type="number" class="form-control" name="monto" step="0.01" min="0.01" max="${deuda}" value="${deuda.toFixed(2)}" required placeholder="0.00"/>
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

  openModal({
    title: `Registrar Cobro — ${cliente.nombre}`,
    content,
    saveLabel: 'Registrar Pago',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-abono-directo');
      const fd = new FormData(form);
      const monto = parseFloat(fd.get('monto'));

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
      showToast(`Cobro de ${Utils.formatCurrency(monto)} registrado correctamente`, 'success');
      closeModal();
      
      // Refresh active page
      const container = document.querySelector('.main-content');
      if (container) renderClientes(container);
    }
  });
}

function deleteCliente(id) {
  const cliente = store.getById('clientes', id);
  if (!cliente) return;

  const deuda = store.getDeudaCliente(id);
  if (deuda > 0) {
    showToast('No se puede eliminar un cliente con deuda pendiente', 'error');
    return;
  }

  openModal({
    title: 'Eliminar Cliente',
    content: `<p>¿Estás seguro de que deseas eliminar a <strong>${Utils.escapeHtml(cliente.nombre)}</strong>?</p><p class="text-muted mt-md">Esta acción no se puede deshacer.</p>`,
    saveLabel: 'Eliminar',
    onSave: () => {
      store.delete('clientes', id);
      showToast('Cliente eliminado', 'success');
      closeModal();
      const container = document.querySelector('.main-content');
      if (container) renderClientes(container);
    }
  });
}
