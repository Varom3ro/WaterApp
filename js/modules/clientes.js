// ============================================
// Tu Empresa - Clientes Module
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export function renderClientes(container) {
  const clientes = store.getAll('clientes');
  const cumpleaneros = getCumpleanerosHoy();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Clientes</h1>
        <p class="page-subtitle">Gestión de clientes y cuentas</p>
      </div>
      <div class="page-actions" style="display: flex; gap: 10px; align-items: center;">
        <button class="btn btn-success" id="btn-abono-general" style="display:flex; align-items:center; gap:6px; font-weight:700;">
          <span style="font-size:16px;">💵</span> Registrar Abono
        </button>
        <button class="btn btn-primary" id="btn-nuevo-cliente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo Cliente
        </button>
      </div>
    </div>

    <!-- Banner de Cumpleaños del Día -->
    ${cumpleaneros.length > 0 ? `
      <div class="card mb-lg" style="background: linear-gradient(135deg, #FFF9E6, #FEF3C7); border: 2px solid #F59E0B; padding: 16px 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 32px;">🎉</span>
            <div>
              <h3 style="margin: 0; font-size: 16px; color: #92400E; font-weight: 700;">¡Hoy está de cumpleaños! 🎂</h3>
              <p style="margin: 2px 0 0 0; font-size: 14px; color: #B45309;">
                ${cumpleaneros.map(c => `<strong>${Utils.escapeHtml(c.nombre)}</strong>`).join(', ')}
              </p>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${cumpleaneros.map(c => `
              <a href="${getWhatsAppBirthdayUrl(c)}" target="_blank" class="btn btn-sm" style="background: #25D366; color: white; border: none; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 6px;">
                💬 Felicitar a ${Utils.escapeHtml(c.nombre.split(' ')[0])} por WhatsApp
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Filters -->
    <div class="card mb-lg">
      <div class="flex items-center gap-md" style="flex-wrap:wrap">
        <input type="text" class="form-control" id="search-clientes" placeholder="Buscar por nombre, RIF, local..."
          style="max-width:300px;height:40px"/>
        <select class="form-control" id="filter-estatus" style="max-width:180px;height:40px">
          <option value="">Todos los estatus</option>
          <option value="al_dia">Al Día</option>
          <option value="con_abono">Con Abono (Saldo a favor)</option>
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
              <th>Saldo / Deuda</th>
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
  const btnAbonoGen = container.querySelector('#btn-abono-general');
  if (btnAbonoGen) {
    btnAbonoGen.addEventListener('click', () => {
      openAbonoClienteDirecto(null, () => renderClientes(container));
    });
  }
  container.querySelector('#search-clientes').addEventListener('input', Utils.debounce(filterClientes, 200));
  container.querySelector('#filter-estatus').addEventListener('change', filterClientes);
}

function renderClientesTable(clientes) {
  const tbody = document.getElementById('clientes-tbody');
  if (!tbody) return;

  const now = new Date();
  tbody.innerHTML = clientes.map(c => {
    const estatus = store.calcularEstatusCliente(c.id);
    const statusInfo = Utils.clientStatus[estatus];
    const saldoNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(c.id) : (store.getDeudaCliente(c.id) || 0);
    const deuda = Math.max(0, saldoNeto);
    const saldoFavor = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;
    const ubicacion = c.tipoUbicacion === 'externo'
      ? [c.municipio, c.urbanizacion, c.calle, c.edificio].filter(Boolean).join(', ')
      : [c.sector, c.nivel, c.local, c.nombreLocal].filter(Boolean).join(' / ');

    const isBirthdayToday = c.fechaNacimiento && (() => {
      const parts = c.fechaNacimiento.split('-');
      if (parts.length < 3) return false;
      return parseInt(parts[1], 10) === (now.getMonth() + 1) && parseInt(parts[2], 10) === now.getDate();
    })();

    let saldoDisplay = `$0.00`;
    if (deuda > 0) {
      saldoDisplay = `<span class="text-danger font-semibold">${Utils.formatCurrency(deuda)}</span>`;
    } else if (saldoFavor > 0) {
      saldoDisplay = `<span class="text-success font-semibold" title="Saldo a favor / abonado por adelantado">+${Utils.formatCurrency(saldoFavor)}</span>`;
    }

    return `
      <tr data-id="${c.id}">
        <td>
          <span class="font-semibold">${Utils.escapeHtml(c.nombre)}</span>
          ${isBirthdayToday ? '<span class="badge" style="background:#F59E0B; color:#fff; margin-left:6px; font-size:11px;" title="¡Hoy es su cumpleaños!">🎂 Cumpleaños</span>' : ''}
        </td>
        <td>${Utils.escapeHtml(c.rif || '-')}</td>
        <td>${Utils.escapeHtml(ubicacion || '-')}</td>
        <td>${Utils.escapeHtml(c.telefono || '-')}</td>
        <td>${saldoDisplay}</td>
        <td><span class="badge ${statusInfo.class}">${statusInfo.label}</span></td>
        <td>
          <div class="flex gap-sm">
            ${isBirthdayToday && c.telefono ? `<a href="${getWhatsAppBirthdayUrl(c)}" target="_blank" class="btn btn-sm" style="background:#25D366; color:#fff; text-decoration:none;" title="Felicitar por WhatsApp">💬</a>` : ''}
            <button class="btn btn-sm btn-success btn-collect-deuda" data-id="${c.id}" title="${deuda > 0 ? 'Cobrar Deuda' : 'Registrar Abono por Adelantado'}">💵</button>
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

  const storeMunicipios = store.getZonasMunicipios();
  const storeUrbanizaciones = store.getZonasUrbanizaciones();

  // Asegurar que si el cliente ya tiene un municipio/urbanización guardada, aparezca en el listado
  const listMunicipios = [...storeMunicipios];
  if (cliente.municipio && !listMunicipios.includes(cliente.municipio)) {
    listMunicipios.push(cliente.municipio);
  }

  const listUrbanizaciones = [...storeUrbanizaciones];
  if (cliente.urbanizacion && !listUrbanizaciones.includes(cliente.urbanizacion)) {
    listUrbanizaciones.push(cliente.urbanizacion);
  }

  const selectedMunicipio = cliente.municipio || listMunicipios[0] || 'Libertador';
  const selectedUrbanizacion = cliente.urbanizacion || listUrbanizaciones[0] || '';

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
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input type="text" class="form-control" name="telefono" value="${Utils.escapeHtml(cliente.telefono || '')}" placeholder="0412-1234567"/>
        </div>
        <div class="form-group">
          <label class="form-label">🎂 Fecha de Nacimiento</label>
          <input type="date" class="form-control" name="fechaNacimiento" value="${cliente.fechaNacimiento || ''}"/>
        </div>
      </div>

      <h3 style="font-size:var(--font-size-md);margin:var(--space-lg) 0 var(--space-md);color:var(--color-text-secondary)">📍 Ubicación del Cliente</h3>
      <div id="campos-ubicacion">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Municipio / Zona</label>
            <select class="form-control" name="municipio" id="select-cliente-municipio" required>
              ${listMunicipios.map(m => `
                <option value="${m}" ${selectedMunicipio === m ? 'selected' : ''}>${m}</option>
              `).join('')}
              <option value="__OTRO__">➕ Otro Municipio...</option>
            </select>
            <input type="text" class="form-control" name="otro_municipio" id="input-otro-municipio" placeholder="Escriba el nombre del municipio..." style="margin-top: 6px; display: none;" />
          </div>
          <div class="form-group">
            <label class="form-label">Urbanización / Barrio / Sector</label>
            <select class="form-control" name="urbanizacion" id="select-cliente-urbanizacion" required>
              ${listUrbanizaciones.map(u => `
                <option value="${u}" ${selectedUrbanizacion === u ? 'selected' : ''}>${u}</option>
              `).join('')}
              <option value="__OTRA__">➕ Otra (Personalizada)...</option>
            </select>
            <input type="text" class="form-control" name="otra_urbanizacion" id="input-otra-urbanizacion" placeholder="Escriba la urbanización o sector..." style="margin-top: 6px; display: none;" />
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

      let municipioVal = fd.get('municipio')?.trim() || '';
      if (municipioVal === '__OTRO__') {
        municipioVal = fd.get('otro_municipio')?.trim() || '';
        if (!municipioVal) {
          showToast('Escriba el nombre del municipio personalizado', 'warning');
          return;
        }
      }

      let urbanizacionVal = fd.get('urbanizacion')?.trim() || '';
      if (urbanizacionVal === '__OTRA__') {
        urbanizacionVal = fd.get('otra_urbanizacion')?.trim() || '';
        if (!urbanizacionVal) {
          showToast('Escriba el nombre de la urbanización o sector', 'warning');
          return;
        }
        // Si se ingresó una personalizada nueva, podemos añadirla a la lista de la tienda para que quede disponible
        const currentUrbs = store.getZonasUrbanizaciones();
        if (!currentUrbs.some(u => u.toLowerCase() === urbanizacionVal.toLowerCase())) {
          store.setConfig('zonasUrbanizaciones', [...currentUrbs, urbanizacionVal]);
        }
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
        municipio: municipioVal,
        urbanizacion: urbanizacionVal,
        calle: fd.get('calle')?.trim() || '',
        edificio: fd.get('edificio')?.trim() || '',
        referencia: fd.get('referencia')?.trim() || '',
        fechaNacimiento: fd.get('fechaNacimiento') || '',
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

  // Listener para mostrar/ocultar inputs personalizados
  setTimeout(() => {
    const selUrb = document.getElementById('select-cliente-urbanizacion');
    const inOtraUrb = document.getElementById('input-otra-urbanizacion');
    if (selUrb && inOtraUrb) {
      selUrb.addEventListener('change', () => {
        if (selUrb.value === '__OTRA__') {
          inOtraUrb.style.display = 'block';
          inOtraUrb.focus();
        } else {
          inOtraUrb.style.display = 'none';
        }
      });
    }

    const selMuni = document.getElementById('select-cliente-municipio');
    const inOtroMuni = document.getElementById('input-otro-municipio');
    if (selMuni && inOtroMuni) {
      selMuni.addEventListener('change', () => {
        if (selMuni.value === '__OTRO__') {
          inOtroMuni.style.display = 'block';
          inOtroMuni.focus();
        } else {
          inOtroMuni.style.display = 'none';
        }
      });
    }
  }, 60);
}

function viewClienteDetail(id) {
  const cliente = store.getById('clientes', id);
  if (!cliente) return;

  const estatus = store.calcularEstatusCliente(id);
  const statusInfo = Utils.clientStatus[estatus];
  const saldoNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(id) : (store.getDeudaCliente(id) || 0);
  const deuda = Math.max(0, saldoNeto);
  const saldoFavor = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;
  const ventas = store.getAll('ventas').filter(v => v.clienteId === id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const abonos = store.getAll('abonos').filter(a => a.clienteId === id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const ubicacion = cliente.tipoUbicacion === 'externo'
    ? [cliente.municipio, cliente.urbanizacion, cliente.calle, cliente.edificio].filter(Boolean).join(', ')
    : [cliente.sector, cliente.nivel, cliente.local, cliente.nombreLocal].filter(Boolean).join(' / ');

  const estadoSaldoTexto = deuda > 0 ? `Deuda Pendiente: ${Utils.formatCurrency(deuda)}` : (saldoFavor > 0 ? `Saldo a Favor (Abonado): +${Utils.formatCurrency(saldoFavor)}` : 'Saldo: Al Día ($0.00)');
  const summaryText = `*Tu Empresa - Estado de Cuenta*\n👤 Cliente: ${cliente.nombre}\n📍 Ubicación: ${ubicacion || 'N/A'}\n\n*${estadoSaldoTexto}*\n*Estatus actual:* ${statusInfo.label}\n\n_Generado el ${Utils.formatDateTime(Utils.nowISO())}_`;
  
  let saldoInfoHTML = '$0.00 (Al día)';
  if (deuda > 0) {
    saldoInfoHTML = `<span class="text-danger font-bold">${Utils.formatCurrency(deuda)}</span>`;
  } else if (saldoFavor > 0) {
    saldoInfoHTML = `<span class="text-success font-bold" title="Saldo a favor por adelantado">+${Utils.formatCurrency(saldoFavor)} (Abono a favor)</span>`;
  }

  const content = `
    <div style="display:flex;gap:var(--space-md); flex-wrap:wrap; margin-bottom:var(--space-md);">
       <button class="btn btn-sm btn-success flex-1" id="btn-wa-receipt" style="display:flex; justify-content:center; align-items:center; gap:8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          Enviar WhatsApp
       </button>
       <button class="btn btn-sm btn-primary flex-1" id="btn-collect-receipt" style="display:flex; justify-content:center; align-items:center; gap:8px;">
          💵 ${deuda > 0 ? 'Registrar Cobro / Abono' : 'Registrar Abono por Adelantado'}
       </button>
    </div>

    <div style="display:flex;gap:var(--space-lg);flex-wrap:wrap">
      <div style="flex:1;min-width:250px">
        <h3 style="margin-bottom:var(--space-md)">Información</h3>
        <p><strong>RIF:</strong> ${Utils.escapeHtml(cliente.rif || '-')}</p>
        <p><strong>Teléfono:</strong> ${Utils.escapeHtml(cliente.telefono || '-')}</p>
        <p><strong>Ubicación:</strong> ${Utils.escapeHtml(ubicacion || '-')}</p>
        ${cliente.referencia ? `<p><strong>Punto de Referencia:</strong> ${Utils.escapeHtml(cliente.referencia)}</p>` : ''}
        <p><strong>Estatus:</strong> <span class="badge ${statusInfo.class}">${statusInfo.label}</span></p>
        <p><strong>Saldo / Deuda:</strong> ${saldoInfoHTML}</p>
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
            ${abonos.slice(0, 10).map(a => {
              const allM = store.getMetodosPago ? store.getMetodosPago(false) : (Utils.paymentMethods || []);
              const mObj = allM.find(m => m.id === a.metodo);
              const mLabel = mObj ? `${mObj.icon} ${mObj.label}` : (a.metodo || '-');
              return `
                <tr>
                  <td>${Utils.formatDateTime(a.fecha)}</td>
                  <td class="text-success font-semibold">${Utils.formatCurrency(a.monto)}</td>
                  <td>${mLabel}</td>
                </tr>
              `;
            }).join('')}
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
        openAbonoClienteDirecto(id);
      });
    }
  }
}

export function openAbonoClienteDirecto(clienteId = null, onSaved = null) {
  const allClientes = store.getAll('clientes');
  if (allClientes.length === 0) {
    showToast('No hay clientes registrados', 'warning');
    return;
  }

  let selectedId = clienteId || allClientes[0].id;
  let cliente = store.getById('clientes', selectedId);
  const isSpecific = !!clienteId;

  const getBannerHTML = (cid) => {
    const cObj = store.getById('clientes', cid);
    if (!cObj) return '';
    const sNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(cid) : (store.getDeudaCliente(cid) || 0);
    const d = Math.max(0, sNeto);
    const sf = sNeto < 0 ? Math.abs(sNeto) : 0;
    if (d > 0) {
      return `<div class="alert-panel warning mb-md">⚠️ Deuda pendiente de <strong>${Utils.escapeHtml(cObj.nombre)}</strong>: <strong style="font-size:16px;">${Utils.formatCurrency(d)}</strong></div>`;
    } else if (sf > 0) {
      return `<div class="alert-panel success mb-md">💰 Saldo a favor actual de <strong>${Utils.escapeHtml(cObj.nombre)}</strong>: <strong style="font-size:16px;">+${Utils.formatCurrency(sf)}</strong> (el nuevo abono se sumará a favor)</div>`;
    } else {
      return `<div class="alert-panel info mb-md">ℹ️ <strong>${Utils.escapeHtml(cObj.nombre)}</strong> está al día ($0.00). El monto ingresado quedará guardado como <strong>saldo a favor por adelantado</strong>.</div>`;
    }
  };

  const getSuggestedAmount = (cid) => {
    const sNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(cid) : (store.getDeudaCliente(cid) || 0);
    return sNeto > 0 ? sNeto.toFixed(2) : '';
  };

  const content = `
    <form id="form-abono-directo">
      ${!isSpecific ? `
        <div class="form-group mb-md">
          <label class="form-label" style="font-weight:700;">Seleccionar Cliente *</label>
          <select class="form-control" name="clienteId" id="select-abono-cliente" style="font-size:15px; font-weight:600; height:38px;">
            ${allClientes.map(c => {
              const sNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(c.id) : (store.getDeudaCliente(c.id) || 0);
              let tag = ' · (Al día)';
              if (sNeto > 0) tag = ` · (Debe: ${Utils.formatCurrency(sNeto)})`;
              else if (sNeto < 0) tag = ` · (Saldo a favor: +${Utils.formatCurrency(Math.abs(sNeto))})`;
              return `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${Utils.escapeHtml(c.nombre)} ${tag}</option>`;
            }).join('')}
          </select>
        </div>
      ` : `<input type="hidden" name="clienteId" value="${clienteId}"/>`}

      <div id="container-banner-abono">
        ${getBannerHTML(selectedId)}
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" style="font-weight:700;">Monto a Abonar / Cobrar *</label>
          <input type="number" class="form-control" name="monto" id="input-monto-abono" step="0.01" min="0.01" value="${getSuggestedAmount(selectedId)}" required placeholder="0.00" style="font-size:16px; font-weight:700;"/>
        </div>
        <div class="form-group">
          <label class="form-label" style="font-weight:700;">Método de Pago</label>
          <select class="form-control" name="metodo" style="font-size:14px; font-weight:600; height:38px;">
            ${store.getMetodosPago(true).map(m => {
              const hasCurrency = /\((usd|bs|\$)\)/i.test(m.label);
              const displayLabel = hasCurrency ? m.label : `${m.label} (${m.moneda || 'Bs'})`;
              return `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${m.icon || '💳'} ${displayLabel}</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Referencia (opcional)</label>
        <input type="text" class="form-control" name="referencia" placeholder="Nro. de referencia o nota"/>
      </div>
    </form>
  `;

  openModal({
    title: isSpecific ? `💵 Registrar Cobro / Abono — ${cliente?.nombre || ''}` : '💵 Registrar Cobro / Abono de Cliente',
    content,
    saveLabel: 'Registrar Abono',
    onOpen: (overlay) => {
      const selectCli = overlay.querySelector('#select-abono-cliente');
      if (selectCli) {
        selectCli.addEventListener('change', (e) => {
          const cid = e.target.value;
          const bannerContainer = overlay.querySelector('#container-banner-abono');
          const inputMonto = overlay.querySelector('#input-monto-abono');
          if (bannerContainer) bannerContainer.innerHTML = getBannerHTML(cid);
          if (inputMonto) inputMonto.value = getSuggestedAmount(cid);
        });
      }
    },
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-abono-directo');
      const fd = new FormData(form);
      const cid = fd.get('clienteId');
      const monto = parseFloat(fd.get('monto'));

      if (!cid) {
        showToast('Debe seleccionar un cliente', 'error');
        return;
      }

      if (!monto || monto <= 0) {
        showToast('Monto inválido', 'error');
        return;
      }

      const abono = {
        id: Utils.generateId(),
        clienteId: cid,
        monto,
        metodo: fd.get('metodo'),
        referencia: fd.get('referencia')?.trim() || '',
        fecha: Utils.nowISO()
      };

      store.save('abonos', abono);
      showToast(`Abono de ${Utils.formatCurrency(monto)} registrado correctamente`, 'success');
      closeModal();
      
      if (typeof syncToCloud === 'function') syncToCloud();

      if (onSaved) {
        onSaved();
      } else {
        const container = document.querySelector('.main-content');
        if (container) renderClientes(container);
      }
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

export function getCumpleanerosHoy() {
  const clientes = store.getAll('clientes') || [];
  const now = new Date();
  const mesActual = now.getMonth() + 1;
  const diaActual = now.getDate();

  return clientes.filter(c => {
    if (!c.fechaNacimiento) return false;
    const parts = c.fechaNacimiento.split('-');
    if (parts.length < 3) return false;
    const mes = parseInt(parts[1], 10);
    const dia = parseInt(parts[2], 10);
    return mes === mesActual && dia === diaActual;
  });
}

export function getWhatsAppBirthdayUrl(cliente) {
  if (!cliente || !cliente.telefono) return '#';
  let cleanPhone = cliente.telefono.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '58' + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith('58') && cleanPhone.length === 10) {
    cleanPhone = '58' + cleanPhone;
  }
  const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
  const msg = `¡Hola ${cliente.nombre}! 🎉 De parte de todo el equipo de ${empresaNombre} te deseamos un muy Feliz Cumpleaños 🎂🎈. ¡Muchas gracias por tu preferencia! Te enviamos un gran saludo y un fuerte abrazo en tu día.`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}
