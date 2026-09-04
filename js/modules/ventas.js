import { openClienteModal, openAbonoClienteDirecto } from './clientes.js';
// ============================================
// Tu Empresa - Ventas Module
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { getMatricialReportHTML } from './cierre.js';
import { syncToCloud } from '../cloud-sync.js';

export function renderVentas(container, showFichas = true) {
  container.innerHTML = `
    <div class="page-header" style="margin-bottom: 20px;">
      <div>
        <h1 class="page-title">Historial de Ventas</h1>
        <p class="page-subtitle">Registro de todas las operaciones y cobros</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-md" style="overflow-x: auto;">
      <div class="flex items-center gap-sm" style="flex-wrap:nowrap; justify-content: space-between; min-width: 650px;">
        <div class="flex items-center gap-sm" style="flex-wrap:nowrap;">
          <input type="date" class="form-control" id="filter-fecha" style="width:140px; height:38px; padding: 4px 8px;" value="${Utils.todayISO()}"/>
          <input type="text" class="form-control" id="search-ventas" placeholder="Buscar por cliente..." style="width:200px; height:38px; padding: 4px 8px;"/>
          <select class="form-control" id="filter-tipo-venta" style="width:130px; height:38px; padding: 4px 8px;">
            <option value="">Todos los tipos</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
            <option value="convenio">Convenio</option>
          </select>
          <select class="form-control" id="filter-estado-entrega" style="width:150px; height:38px; padding: 4px 8px;">
            <option value="">Todas entregas</option>
            <option value="pendiente">⏳ Pendientes</option>
            <option value="entregado">✅ Entregados</option>
          </select>
        </div>
      </div>
    </div>

    ${showFichas ? '<!-- Fichas de Totales por Método de Pago --><div id="ventas-totales-fichas" style="margin-bottom: 20px;"></div>' : ''}

    <!-- Table -->
    <div class="card">
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Cliente</th>
              <th>Detalles</th>
              <th>Total</th>
              <th>Tipo</th>
              <th>Pago</th>
              <th>Entrega</th>
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

  container.querySelector('#filter-fecha').addEventListener('change', renderVentasTable);
  container.querySelector('#search-ventas').addEventListener('input', Utils.debounce(renderVentasTable, 200));
  container.querySelector('#filter-tipo-venta').addEventListener('change', renderVentasTable);
  const filterEntrega = container.querySelector('#filter-estado-entrega');
  if (filterEntrega) filterEntrega.addEventListener('change', renderVentasTable);
}

function renderVentasTable() {
  const tbody = document.getElementById('ventas-tbody');
  const emptyDiv = document.getElementById('ventas-empty');
  const fichasContainer = document.getElementById('ventas-totales-fichas');
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

  const estadoEntregaFilter = document.getElementById('filter-estado-entrega')?.value;
  if (estadoEntregaFilter) {
    ventas = ventas.filter(v => (v.estadoEntrega || 'entregado') === estadoEntregaFilter);
  }

  // Cálculo de totales por método de pago para las fichas
  const currentTasa = store.getConfig('tasaCambio') || 40.00;
  const totales = {
    efectivo_usd: 0,
    efectivo_bs: 0,
    punto: 0,
    pago_movil: 0,
    transferencia: 0,
    credito: 0,
    totalUSD: 0,
    totalBs: 0
  };

  ventas.forEach(v => {
    const tasa = v.tasa || currentTasa;
    totales.totalUSD += (v.total || 0);
    totales.totalBs += (v.total || 0) * tasa;

    if (v.tipo === 'credito') {
      totales.credito += (v.total || 0);
    } else if (v.pagos && Array.isArray(v.pagos)) {
      v.pagos.forEach(p => {
        const metodoKey = p.metodo;
        const montoUSD = parseFloat(p.monto) || 0;
        if (totales.hasOwnProperty(metodoKey)) {
          totales[metodoKey] += montoUSD;
        }
      });
    }
  });

  // Cálculo de propinas de la fecha
  let propinasFecha = store.getAll('propinas');
  if (fecha) {
    const dayStart = new Date(fecha + 'T00:00:00');
    const dayEnd = new Date(fecha + 'T23:59:59');
    propinasFecha = propinasFecha.filter(p => {
      const d = new Date(p.fecha);
      return d >= dayStart && d <= dayEnd;
    });
  } else {
    const today = Utils.todayISO();
    propinasFecha = propinasFecha.filter(p => p.fecha && p.fecha.startsWith(today));
  }

  const totalesPropinas = {
    cantidad: propinasFecha.length,
    usd: 0,
    bs: 0
  };

  propinasFecha.forEach(p => {
    const tasa = p.tasa || currentTasa;
    let mUSD = 0;
    let mBs = 0;
    if (p.moneda === 'Bs' || p.moneda === 'VES') {
      mBs = parseFloat(p.monto) || 0;
      mUSD = tasa > 0 ? mBs / tasa : 0;
    } else {
      mUSD = parseFloat(p.monto) || 0;
      mBs = mUSD * tasa;
    }
    totalesPropinas.usd += mUSD;
    totalesPropinas.bs += mBs;
  });

  if (fichasContainer) {
    fichasContainer.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; overflow-x: auto; padding-bottom: 2px;">
        <!-- Ficha Efectivo USD -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #10B981; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 100px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #065F46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            💵 Efectivo $
          </div>
          <div class="metric-value" style="font-size: 13px; font-weight: 700; color: #10B981; margin: 2px 0 0 0; white-space: nowrap;">
            ${Utils.formatCurrency(totales.efectivo_usd)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            En caja USD
          </div>
        </div>

        <!-- Ficha Efectivo Bs -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #3B82F6; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 100px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #1E40AF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            💴 Efectivo Bs
          </div>
          <div class="metric-value" style="font-size: 13px; font-weight: 700; color: #2563EB; margin: 2px 0 0 0; white-space: nowrap;">
            Bs ${Utils.formatNumber(totales.efectivo_bs * currentTasa, true)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            ≈ ${Utils.formatCurrency(totales.efectivo_bs)}
          </div>
        </div>

        <!-- Ficha Pago Móvil -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #8B5CF6; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 100px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #5B21B6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            📱 Pago Móvil
          </div>
          <div class="metric-value" style="font-size: 13px; font-weight: 700; color: #7C3AED; margin: 2px 0 0 0; white-space: nowrap;">
            Bs ${Utils.formatNumber(totales.pago_movil * currentTasa, true)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            ≈ ${Utils.formatCurrency(totales.pago_movil)}
          </div>
        </div>

        <!-- Ficha Punto de Venta -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #06B6D4; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 100px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #155E75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            💳 Punto Venta
          </div>
          <div class="metric-value" style="font-size: 13px; font-weight: 700; color: #0891B2; margin: 2px 0 0 0; white-space: nowrap;">
            Bs ${Utils.formatNumber(totales.punto * currentTasa, true)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            ≈ ${Utils.formatCurrency(totales.punto)}
          </div>
        </div>

        <!-- Ficha Transferencia -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #F59E0B; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 100px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #92400E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            🏦 Transf.
          </div>
          <div class="metric-value" style="font-size: 13px; font-weight: 700; color: #D97706; margin: 2px 0 0 0; white-space: nowrap;">
            Bs ${Utils.formatNumber(totales.transferencia * currentTasa, true)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            ≈ ${Utils.formatCurrency(totales.transferencia)}
          </div>
        </div>

        <!-- Ficha A Crédito -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #EF4444; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 100px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #991B1B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            📋 A Crédito
          </div>
          <div class="metric-value" style="font-size: 13px; font-weight: 700; color: #DC2626; margin: 2px 0 0 0; white-space: nowrap;">
            ${Utils.formatCurrency(totales.credito)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            ${ventas.filter(v => v.tipo === 'credito').length} operaciones
          </div>
        </div>

        <!-- Ficha Propinas del Día -->
        <div class="metric-card" id="btn-ver-propinas-fichas" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #F59E0B; background: #FFFBEB; box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 105px; cursor: pointer;" title="Haz clic para ver la lista de propinas y vouchers de esta fecha">
          <div class="metric-label" style="font-size: 10px; font-weight: 700; color: #92400E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            🎁 Propinas
          </div>
          <div class="metric-value" style="font-size: 13px; font-weight: 800; color: #B45309; margin: 2px 0 0 0; white-space: nowrap;">
            Bs ${Utils.formatNumber(totalesPropinas.bs, true)}
          </div>
          <div style="font-size: 8.5px; color: #92400E; margin-top: 1px; white-space: nowrap; font-weight: 600;">
            ≈ ${Utils.formatCurrency(totalesPropinas.usd)} (${totalesPropinas.cantidad}) 🔍
          </div>
        </div>

        <!-- Ficha Total Facturado -->
        <div class="metric-card accent" style="padding: 8px 10px; border-radius: 6px; background: var(--color-primary-900, #1B4332); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-width: 105px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            💰 Total Facturado
          </div>
          <div class="metric-value" style="font-size: 13.5px; font-weight: 700; color: #fff; margin: 2px 0 0 0; white-space: nowrap;">
            ${Utils.formatCurrency(totales.totalUSD)}
          </div>
          <div style="font-size: 8.5px; color: rgba(255,255,255,0.8); margin-top: 1px; white-space: nowrap;">
            Bs ${Utils.formatNumber(totales.totalBs, true)} (${ventas.length})
          </div>
        </div>
      </div>
    `;

    const btnVerProps = fichasContainer.querySelector('#btn-ver-propinas-fichas');
    if (btnVerProps) {
      btnVerProps.addEventListener('click', () => {
        openModalDetallePropinas(fecha || Utils.todayISO(), () => renderVentasTable());
      });
    }
  }

  if (ventas.length === 0) {
    tbody.innerHTML = '';
    if (emptyDiv) emptyDiv.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📋</span><span class="empty-state-text">No hay ventas para esta fecha o filtros seleccionados</span></div>';
    return;
  }

  if (emptyDiv) emptyDiv.innerHTML = '';

  tbody.innerHTML = ventas.map(v => {
    const cliente = store.getById('clientes', v.clienteId);
    const nombre = cliente ? cliente.nombre : 'Cliente General';
    const allMetodos = store.getMetodosPago(false);
    let pagosStr = '-';
    if (v.tipo === 'credito') {
      pagosStr = '<span class="badge badge-warning" style="font-size: 0.75em;">A Crédito</span>';
    } else if (v.tipo === 'convenio') {
      pagosStr = '<span class="badge badge-info" style="font-size: 0.75em;">Convenio</span>';
    } else if (v.pagos && v.pagos.length > 0) {
      pagosStr = v.pagos.map(p => {
        const method = allMetodos.find(m => m.id === p.metodo);
        const icon = method ? method.icon : '';
        const name = method ? method.label : p.metodo;
        const title = p.referencia ? ` title="Ref: ${p.referencia}" style="cursor:help;"` : '';
        return `<div${title} style="font-size: 0.8em; white-space: nowrap; line-height: 1.2;">${icon} ${name}: <b>${Utils.formatCurrency(p.monto)}</b></div>`;
      }).join('');
    }

    // Generar detalles del producto
    let detallesHTML = '';
    const tipos = store.getConfig('tiposBotellon') || [];
    if (v.detalles && v.detalles.length > 0) {
      detallesHTML = v.detalles.map(d => {
        const prod = tipos.find(t => t.id === d.tipoBotellonId);
        const prodName = d.nombre || (prod ? prod.nombre : 'Prod.');
        return `<div style="font-size: 0.9em; margin-bottom: 2px;">${d.cantidad}x ${Utils.formatCurrency(d.precioUnitario)} ${prodName}</div>`;
      }).join('');
    } else {
      detallesHTML = `<div style="font-size: 0.9em;">${v.botellones || 0} botellones</div>`;
    }

    // Calcular/mostrar delivery
    const sumaSubtotal = v.detalles ? v.detalles.reduce((acc, d) => acc + d.subtotal, 0) : v.total;
    const delivery = v.delivery !== undefined ? v.delivery : (v.total - sumaSubtotal > 0.01 ? v.total - sumaSubtotal : 0);
    
    if (delivery > 0) {
      const repNombre = v.repartidorNombre ? ` (${Utils.escapeHtml(v.repartidorNombre)})` : '';
      detallesHTML += `<div style="font-size: 0.85em; color: var(--color-text-secondary); margin-top: 2px;">+ Delivery: ${Utils.formatCurrency(delivery)}${repNombre}</div>`;
    }

    return `
      <tr>
        <td>${Utils.formatDateTime(v.fecha)}</td>
        <td class="font-semibold">${Utils.escapeHtml(nombre)}</td>
        <td style="line-height: 1.2;">${detallesHTML}</td>
        <td class="font-semibold" style="line-height: 1.2;">${Utils.formatCurrency(v.total)}
          ${v.tasa ? `<br><small style="font-size: 0.8em; color: var(--color-text-secondary);">Bs ${Utils.formatNumber(v.total * v.tasa, true)}</small>` : ''}
        </td>
        <td>
          <span class="badge ${v.tipo === 'credito' ? 'badge-warning' : (v.tipo === 'convenio' ? 'badge-info' : 'badge-success')}">
            ${v.tipo === 'credito' ? 'Crédito' : (v.tipo === 'convenio' ? 'Convenio' : 'Contado')}
          </span>
        </td>
        <td>${pagosStr}</td>
        <td>
          ${(v.estadoEntrega === 'pendiente') ? `
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
              <span class="badge badge-warning" style="font-size: 0.75em;">⏳ Pendiente</span>
              <button class="btn btn-xs btn-success btn-marcar-entregado" data-id="${v.id}" style="padding: 2px 6px; font-size: 11px;" title="Confirmar entrega física">
                ✅ Entregado
              </button>
            </div>
          ` : `<span class="badge badge-success" style="font-size: 0.75em;">✅ Entregado</span>`}
        </td>
        <td>
          <button class="btn btn-sm btn-secondary btn-delete-venta" data-id="${v.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.btn-delete-venta').forEach(btn => {
    btn.addEventListener('click', () => deleteVenta(btn.dataset.id));
  });

  tbody.querySelectorAll('.btn-marcar-entregado').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      store.update('ventas', id, { estadoEntrega: 'entregado', fechaEntrega: Utils.nowISO() });
      showToast('Entrega confirmada correctamente', 'success');
      renderVentasTable();
    });
  });
}

export function renderNuevaVentaForm(container) {
  const clientes = store.getAll('clientes');
  const tipos = store.getConfig('tiposBotellon') || [{ id: '20l', nombre: 'Botellón 20 Litros', litros: 20, precio: 1.50 }];
  const inventario = store.getInventarioActual();
  const metodosActivos = store.getMetodosPago(true);
  const isUsdMethod = (id) => {
    const found = store.getMetodosPago(false).find(m => m.id === id);
    return found ? (found.moneda === 'USD') : (id === 'efectivo_usd');
  };

  const formatMetodoOption = (m) => {
    const hasCurrency = /\((usd|bs|\$)\)/i.test(m.label);
    const displayLabel = hasCurrency ? m.label : `${m.label} (${m.moneda || 'Bs'})`;
    return `${m.icon || '💳'} ${displayLabel}`;
  };

  let carrito = [];

  const content = `
    <form id="form-venta">


      <!-- Fila 1: Tasa, Fecha y Disponibilidad -->
      <div class="form-row">
        <div class="form-group" style="flex: 0.8;">
          <label class="form-label">Tasa (Bs/$)</label>
          <input type="number" step="0.01" class="form-control" id="input-tasa" value="${store.getConfig('tasaCambio') || 40.00}" required/>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Fecha de Venta</label>
          <input type="date" class="form-control" name="fecha" id="input-fecha" value="${Utils.todayISO()}" required/>
        </div>
        <div class="form-group" style="flex: 2;">
          <label class="form-label">Disponibilidad del Agua</label>
          <div class="alert-panel info" style="margin-bottom: 0; font-size: 16px; justify-content: center; padding: 7.5px; border-radius: 8px;">
            💧 Disp: <strong style="margin-left: 8px; font-size: 18px;">${Utils.formatNumber(inventario.litros)} L</strong>
          </div>
        </div>
      </div>

      <!-- Fila 2: Nuevo Cliente, Buscar Cliente, Botón Registrar Abono y Botón Registrar Propina -->
      <div style="display: grid; grid-template-columns: 140px 1fr 145px 150px; gap: 10px; align-items: flex-end; margin-bottom: 15px;">
        <div class="form-group" style="margin-bottom: 0;">
          <button type="button" class="btn" id="btn-quick-new-cliente" style="height: 38px; width: 100%; white-space: nowrap; padding: 0 10px; font-size: 13px; background: var(--color-success-light); color: var(--color-success); border: 1px solid var(--color-success-light); font-weight: 700; border-radius: 6px;">+ Nuevo Cliente</button>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span>Cliente (Nombre o RIF)</span>
            <span id="cliente-balance-badge" style="font-size:12px; font-weight:700;"></span>
          </label>
          <div class="search-container">
            <input type="text" class="form-control" id="search-cliente-input" placeholder="Buscar o dejar vacío para Cliente General" autocomplete="off"/>
            <input type="hidden" name="clienteId" id="hidden-cliente-id" value=""/>
            <div id="search-cliente-results" class="search-results"></div>
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <button type="button" class="btn btn-secondary" id="btn-quick-abono" style="height: 38px; width: 100%; white-space: nowrap; padding: 0 8px; font-size: 12.5px; font-weight: 700; border-radius: 6px; display:flex; align-items:center; justify-content:center; gap:5px;" title="Registrar un abono o pago por adelantado">
            <span>💵</span> Abono
          </button>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <button type="button" class="btn btn-secondary" id="btn-quick-propina" style="height: 38px; width: 100%; white-space: nowrap; padding: 0 8px; font-size: 12.5px; font-weight: 700; border-radius: 6px; display:flex; align-items:center; justify-content:center; gap:5px; background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;" title="Registrar una propina pasada por Punto de Venta o Banco">
            <span>🎁</span> Propina
          </button>
        </div>
      </div>

      <!-- Fila 2: Formulario Añadir Ítem -->
      <div style="border: 1px solid var(--color-border); padding: var(--space-md); border-radius: 8px; margin-bottom: var(--space-md); background: #f8fafc;">
        <h4 style="margin-bottom: var(--space-sm); font-size: 14px; color: var(--color-text-secondary);">Añadir Producto</h4>
        <div style="display: grid; grid-template-columns: minmax(120px, 2fr) 70px 80px auto; gap: 12px; align-items: center; margin-bottom: 0;">
          <div class="form-group" style="margin-bottom: 0;">
            <select class="form-control" id="select-tipo-botellon">
              ${tipos.map(t => {
                const isBs = t.moneda === 'VES' || t.moneda === 'Bs';
                const precioLabel = isBs ? `Bs ${Utils.formatNumber(t.precio, true)}` : Utils.formatCurrency(t.precio);
                const stockText = t.categoria === 'producto' ? ` · Stock: ${t.stock !== undefined ? t.stock : 0}` : '';
                return `<option value="${t.id}" data-precio="${t.precio}" data-moneda="${t.moneda || 'USD'}" data-litros="${t.litros}" data-stock="${t.stock !== undefined ? t.stock : 0}" data-categoria="${t.categoria || 'relleno'}" data-nombre="${Utils.escapeHtml(t.nombre)}">${t.categoria === 'producto' ? '📦' : '💧'} ${Utils.escapeHtml(t.nombre)} (${precioLabel}${stockText})</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <input type="number" class="form-control" min="1" value="1" id="input-botellones" placeholder="Cant."/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <input type="number" class="form-control" step="0.01" min="0" value="${(() => {
              const primer = tipos[0] || {};
              const isBs = primer.moneda === 'VES' || primer.moneda === 'Bs';
              const tasaInicial = store.getConfig('tasaCambio') || 40.00;
              return isBs ? (tasaInicial > 0 ? (primer.precio / tasaInicial).toFixed(2) : '0.00') : (primer.precio || 1.50).toFixed(2);
            })()}" id="input-precio" placeholder="Precio $" title="Precio unitario en dólares"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <button type="button" class="btn btn-info" id="btn-add-item" style="padding: 0 20px;">+ Añadir</button>
          </div>
        </div>
        
      </div>

      <!-- Carrito de Compras -->
      <div class="table-container mb-md" id="carrito-container" style="display: none;">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align:center">Cant.</th>
              <th style="text-align:right">Precio</th>
              <th style="text-align:right">Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="carrito-tbody"></tbody>
        </table>
      </div>


      <!-- Delivery y Total a Cobrar -->
      <div class="form-row" style="margin-bottom: 20px; align-items: center;">
        <div class="form-group" style="flex: 1.8; display: flex; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <label class="form-check" style="margin: 0; font-size: 14px; cursor: pointer;">
              <input type="checkbox" id="check-delivery"/> Delivery
            </label>
            <div id="container-monto-delivery" style="display: none; align-items: center; gap: 8px; margin-left: 10px; flex-wrap: wrap;">
              <input type="number" class="form-control" id="cant-delivery" min="1" value="1" style="width: 65px;" title="Cant. de viajes" placeholder="Cant."/>
              <span style="color:var(--color-text-secondary); font-size: 14px;">x</span>
              <input type="number" class="form-control" id="monto-delivery" step="0.01" min="0" placeholder="$0.00" value="0.00" style="width: 85px;"/>
              <select class="form-control" id="repartidor-delivery" style="width: 140px; font-size: 13px;">
                <option value="">🛵 Repartidor</option>
                ${(store.getConfig('repartidores') || []).map(r => `<option value="${r.id}">${Utils.escapeHtml(r.nombre)}</option>`).join('')}
              </select>
            </div>
            <label class="form-check" style="margin: 0 0 0 15px; font-size: 14px; cursor: pointer; color: var(--color-warning);">
              <input type="checkbox" id="check-pendiente-entrega"/> ⏳ Pendiente por Entregar
            </label>
          </div>
        </div>
        <div class="form-group" style="flex: 2;">
          <div class="alert-panel success" style="margin-bottom: 0; font-size: var(--font-size-lg); justify-content: space-between; padding: 10px 20px; border-radius: 8px; align-items: center;">
            <span>Total a Cobrar:</span>
            <strong id="total-venta" style="font-size: 24px; text-align: right; line-height: 1.1;">$0.00</strong>
          </div>
        </div>
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
              <span>A Crédito / Saldo a Favor</span>
            </label>
            <label class="form-check">
              <input type="radio" name="tipo" value="convenio"/>
              <span>Convenio</span>
            </label>
          </div>
        </div>
        
        <div class="form-group" style="flex: 2; border-left: 1px solid var(--color-border); padding-left: var(--space-md);">
          <div id="seccion-pagos">
            <div id="container-btn-saldo-favor" style="display:none; margin-bottom: 12px;"></div>
            <div class="flex items-center justify-between mb-sm" style="margin-bottom: 15px;">
              <label class="form-label" style="margin:0">Métodos de Pago</label>
              <button type="button" class="btn btn-xs btn-secondary" id="btn-add-pago-venta">+ Añadir</button>
            </div>
            <div id="pagos-list">
              <div class="pago-row" style="display: grid; grid-template-columns: 1.5fr 1fr 40px; gap: 8px; align-items: center; margin-bottom: var(--space-xs);">
                <div class="form-group" style="margin-bottom: 0;">
                  <select class="form-control pago-metodo">
                    ${metodosActivos.map(m => `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <input type="number" class="form-control pago-monto" step="0.01" min="0" value="0.00" placeholder="0.00"/>
                </div>
                <!-- Div invisible para mantener el grid alineado con los botones de borrar -->
                <div style="width: 40px;"></div>
                
                <div class="form-group pago-ref-container" style="grid-column: 1 / -1; margin-bottom: 0; display: none;">
                  <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia"/>
                </div>
              </div>
            </div>
            <div class="alert-panel info mt-sm" id="pago-diff-panel" style="display:none; justify-content: space-between; padding: 8px;">
               <span>Abono Extra:</span>
               <strong id="pago-diff-monto">$0.00</strong>
            </div>
          </div>

          <div id="seccion-info-credito" style="display:none; padding: 15px; background: var(--color-bg-secondary); border-radius: var(--radius-md); font-size: 14px; color: var(--color-text-secondary); margin-bottom: 15px;">
            ℹ️ Esta venta se registrará bajo modalidad de <strong id="texto-tipo-venta">Crédito</strong> (sin pago inmediato).
          </div>
          
          <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <button type="button" class="btn btn-primary" id="btn-save-venta-home" style="padding: 10px 20px; font-size: 16px; width: 250px;">Registrar Venta</button>
          </div>
        </div>
      </div>
    </form>
  `;

  const moduloCaudalimetro = store.getConfig('moduloCaudalimetro') || false;
  const unidadCaudalimetro = store.getConfig('unidadCaudalimetro') || 'L';
  const todayStr = Utils.todayISO();
  const lecturaHoy = store.getLecturaCaudalimetro(todayStr);

  const formHtml = `
    <div style="padding: 0 0 20px 0;">
      <div class="page-header" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h1 class="page-title">Punto de Venta</h1>
          <p class="page-subtitle">Registro de recargas y facturación</p>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          ${moduloCaudalimetro ? `
            <div id="widget-caudalimetro-pv" style="display: flex; align-items: center; gap: 10px; background: var(--color-surface, #fff); border: 1.5px solid #10B981; border-radius: 10px; padding: 6px 14px; box-shadow: var(--shadow-sm); cursor: pointer;" title="Haga clic para registrar o actualizar la lectura del reloj">
              <div style="font-size: 22px;">⏱️</div>
              <div>
                <div style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.5px;">
                  Reloj Medidor (${unidadCaudalimetro})
                </div>
                <div style="font-size: 13px; font-weight: 800; color: #0F172A;">
                  ${lecturaHoy.inicial !== null ? `Ini: ${lecturaHoy.inicial.toLocaleString()}` : 'Ini: <span style="color:#DC2626;">Sin registrar</span>'} 
                  ${lecturaHoy.final !== null ? `· Fin: ${lecturaHoy.final.toLocaleString()} (<strong>${lecturaHoy.litrosReloj.toLocaleString()} L</strong>)` : ''}
                </div>
              </div>
              <button type="button" id="btn-abrir-modal-caudalimetro" class="btn btn-xs btn-primary" style="margin-left: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 6px;">
                ${lecturaHoy.inicial === null ? '📝 Abrir Tienda' : (lecturaHoy.final === null ? '📝 Anotar Cierre' : '✏️ Editar')}
              </button>
            </div>
          ` : ''}
        </div>
      </div>
      ${content}
    </div>
  `;
  container.innerHTML = formHtml;
  const modal = container;


  const widgetCaudalimetro = modal.querySelector('#widget-caudalimetro-pv');
  if (widgetCaudalimetro) {
    widgetCaudalimetro.addEventListener('click', () => {
      openModalCaudalimetro(todayStr, () => {
        renderNuevaVentaForm(container);
      });
    });
  }
  
  const inputTasa = modal.querySelector('#input-tasa');
  if (inputTasa) {
    inputTasa.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        store.setConfig('tasaCambio', val);
        if (typeof syncPrecioSeleccionado === 'function') {
          syncPrecioSeleccionado();
        }
        if (typeof renderCarrito === 'function') {
          renderCarrito();
        }
      }
    });
  }
  
  modal.querySelector('#btn-save-venta-home').addEventListener('click', () => {
    const overlay = modal;
      if (carrito.length === 0) {
        showToast('Debe añadir al menos un producto a la venta', 'error');
        return;
      }

      const form = overlay.querySelector('#form-venta');
      const fd = new FormData(form);
      let clienteId = fd.get('clienteId') || hiddenId?.value || searchInput?.dataset?.id || null;
      if (!clienteId && searchInput && searchInput.value.trim()) {
        const val = searchInput.value.toLowerCase().trim();
        const allClients = store.getAll('clientes');
        const match = allClients.find(c => 
          c.nombre.toLowerCase().trim() === val || 
          (c.rif && c.rif.toLowerCase().trim() === val)
        );
        if (match) {
          clienteId = match.id;
        }
      }

      const tipo = fd.get('tipo');

      if (tipo === 'credito' && !clienteId) {
        showToast('Debe seleccionar o registrar un cliente para realizar una venta a Crédito', 'warning');
        return;
      }

      const { totalUSD, totalBs } = calcularTotalesVenta();
      let totalVenta = totalUSD;
      let totalBotellones = 0;
      let totalLitros = 0;

      carrito.forEach(item => {
        if (item.categoria !== 'producto') {
          totalBotellones += item.cantidad;
          totalLitros += item.litros;
        }
      });

      const pagos = [];
      let totalPagadoUSD = 0;
      let totalPagadoBs = 0;
      let saldoFavorUsado = 0;
      if (tipo === 'contado') {
        const tasaActual = parseFloat(modal.querySelector('#input-tasa').value) || (store.getConfig('tasaCambio') || 40);
        overlay.querySelectorAll('.pago-row').forEach(row => {
          const metodo = row.querySelector('.pago-metodo').value;
          const rawMonto = row.querySelector('.pago-monto').value || '0';
          const inputMonto = parseFloat(rawMonto.replace(',', '.')) || 0;
          const isUsd = isUsdMethod(metodo);
          const montoUSD = isUsd ? inputMonto : (tasaActual > 0 ? inputMonto / tasaActual : 0);
          const montoBs = isUsd ? (inputMonto * tasaActual) : inputMonto;
          
          if (metodo === 'saldo_favor') {
            saldoFavorUsado += montoUSD;
          }

          const refEl = row.querySelector('.pago-referencia');
          const referencia = refEl && refEl.value ? refEl.value.trim() : null;
          
          if (montoUSD > 0) {
            pagos.push({ metodo, monto: montoUSD, referencia });
            totalPagadoUSD += montoUSD;
            totalPagadoBs += montoBs;
          }
        });

        if (saldoFavorUsado > 0) {
          if (!clienteId) {
            showToast('Debe seleccionar un cliente para pagar con Saldo a Favor', 'error');
            return;
          }
          const saldoNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(clienteId) : 0;
          const saldoFavorDisponible = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;
          if (saldoFavorUsado > (saldoFavorDisponible + 0.01)) {
            showToast(`El cliente solo dispone de ${Utils.formatCurrency(saldoFavorDisponible)} de saldo a favor`, 'error');
            return;
          }
        }
        
        // Margen de tolerancia inteligente para redondear en Bs o $
        const faltaUSD = totalUSD - totalPagadoUSD;
        const faltaBs = totalBs - totalPagadoBs;
        if (faltaUSD > 0.03 && faltaBs > 1.00) {
            showToast('El pago ingresado no cubre el total de la venta', 'error');
            return;
        }
      }

      const inputFecha = fd.get('fecha');
      let fechaRegistro = Utils.nowISO();
      if (inputFecha !== Utils.todayISO()) {
          fechaRegistro = new Date(inputFecha + 'T12:00:00').toISOString();
      }
      
      const checkDeliv = modal.querySelector('#check-delivery');
      const inputDeliv = modal.querySelector('#monto-delivery');
      const cantDeliv = modal.querySelector('#cant-delivery');
      const repDeliv = modal.querySelector('#repartidor-delivery');
      let delivValue = parseFloat(inputDeliv.value) || 0;
      let cantValue = parseInt(cantDeliv ? cantDeliv.value : 1) || 1;
      const isDelivActive = !!(checkDeliv && checkDeliv.checked);
      const montoDelivery = isDelivActive ? (delivValue * cantValue) : 0;

      let repartidorId = null;
      let repartidorNombre = null;
      if (isDelivActive && repDeliv && repDeliv.value) {
        repartidorId = repDeliv.value;
        const repObj = (store.getConfig('repartidores') || []).find(r => r.id === repartidorId);
        if (repObj) repartidorNombre = repObj.nombre;
      }

      const checkPendiente = modal.querySelector('#check-pendiente-entrega');
      const isPendiente = !!(checkPendiente && checkPendiente.checked);
      const estadoEntrega = isPendiente ? 'pendiente' : 'entregado';
      
      const tasaCambio = parseFloat(modal.querySelector('#input-tasa').value) || (store.getConfig('tasaCambio') || 40);
      store.setConfig('tasaCambio', tasaCambio); // memorizar

      const venta = {
        id: Utils.generateId(),
        tasa: tasaCambio,
        clienteId,
        detalles: [...carrito],
        botellones: totalBotellones,
        litrosTotales: totalLitros,
        delivery: montoDelivery,
        deliveryCant: isDelivActive ? cantValue : 0,
        repartidorId,
        repartidorNombre,
        estadoEntrega,
        fechaEntrega: isPendiente ? null : Utils.nowISO(),
        total: totalVenta,
        tipo,
        pagos,
        fecha: fechaRegistro
      };

      store.save('ventas', venta);
      
      // Descontar inventario de agua
      const inv = store.getInventarioActual();
      inv.litros = Math.max(0, inv.litros - totalLitros);
      store.setConfig('inventario', inv);

      // Descontar inventario de productos físicos
      const allTipos = store.getConfig('tiposBotellon') || [];
      let tiposActualizados = false;
      carrito.forEach(item => {
        if (item.categoria === 'producto' && item.tipoBotellonId) {
          const pIdx = allTipos.findIndex(p => p.id === item.tipoBotellonId);
          if (pIdx !== -1) {
            allTipos[pIdx].stock = Math.max(0, (allTipos[pIdx].stock || 0) - item.cantidad);
            tiposActualizados = true;
          }
        }
      });
      if (tiposActualizados) {
        store.setConfig('tiposBotellon', allTipos);
      }

      if (clienteId && totalPagadoUSD > totalVenta) {
        const excedente = totalPagadoUSD - totalVenta;
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

      syncToCloud();

      // Reset form for continuous selling
      carrito.length = 0;
      renderCarrito();

      // Reset client search and badges
      modal.querySelector('#search-cliente-input').value = '';
      modal.querySelector('#search-cliente-input').dataset.id = '';
      const hId = modal.querySelector('#hidden-cliente-id');
      if (hId) hId.value = '';
      actualizarBalanceBadge();

      // Reset condition to Contado and clear credit banner
      modal.querySelector('input[name="tipo"][value="contado"]').checked = true;
      modal.querySelector('#seccion-pagos').style.display = 'block';
      const seccionInfoCreditoEl = modal.querySelector('#seccion-info-credito');
      if (seccionInfoCreditoEl) {
        seccionInfoCreditoEl.style.display = 'none';
        seccionInfoCreditoEl.innerHTML = '';
      }

      // Reset payment rows & reference inputs
      const extraPagos = modal.querySelectorAll('.pago-row:not(:first-child)');
      extraPagos.forEach(r => r.remove());

      const firstMetodo = modal.querySelector('.pago-metodo');
      if (firstMetodo) firstMetodo.value = 'punto';
      const firstMonto = modal.querySelector('.pago-monto');
      if (firstMonto) firstMonto.value = '0.00';

      modal.querySelectorAll('.pago-referencia').forEach(input => { input.value = ''; });
      modal.querySelectorAll('.pago-ref-container').forEach(cont => { cont.style.display = 'none'; });

      actualizarPagosAutom(0, 0);
      if (typeof actualizarInfoCredito === 'function') {
        actualizarInfoCredito();
      }

      // Reset delivery
      const checkDelivery = modal.querySelector('#check-delivery');
      if (checkDelivery) {
         checkDelivery.checked = false;
         modal.querySelector('#container-monto-delivery').style.display = 'none';
         modal.querySelector('#monto-delivery').value = '0.00';
         const cDeliv = modal.querySelector('#cant-delivery');
         if (cDeliv) cDeliv.value = '1';
         const rDeliv = modal.querySelector('#repartidor-delivery');
         if (rDeliv) rDeliv.value = '';
         const cPend = modal.querySelector('#check-pendiente-entrega');
         if (cPend) cPend.checked = false;
      }
      // Refrescar historial
      if (typeof renderVentasTable === 'function') {
        renderVentasTable();
      }
    });

  const carritoContainer = modal.querySelector('#carrito-container');
  const carritoTbody = modal.querySelector('#carrito-tbody');
  const totalDisplay = modal.querySelector('#total-venta');
  
  function calcularTotalesVenta() {
    const tasa = parseFloat(modal.querySelector('#input-tasa')?.value) || (store.getConfig('tasaCambio') || 40.00);
    let totalUSD = 0;
    let totalBs = 0;

    carrito.forEach(item => {
      if (item.monedaOriginal === 'VES' || item.monedaOriginal === 'Bs') {
        const itemBs = item.cantidad * item.precioBase;
        totalBs += itemBs;
        totalUSD += (tasa > 0 ? (itemBs / tasa) : 0);
      } else {
        const itemUSD = item.cantidad * item.precioUnitario;
        totalUSD += itemUSD;
        totalBs += (itemUSD * tasa);
      }
    });

    // Sumar delivery
    const checkDelivery = modal.querySelector('#check-delivery');
    const inputDeliv = modal.querySelector('#monto-delivery');
    const cantDeliv = modal.querySelector('#cant-delivery');
    if (checkDelivery && checkDelivery.checked && inputDeliv) {
      let dVal = parseFloat(inputDeliv.value) || 0;
      let cVal = parseInt(cantDeliv ? cantDeliv.value : 1) || 1;
      let delivUSD = dVal * cVal;
      totalUSD += delivUSD;
      totalBs += delivUSD * tasa;
    }

    return {
      tasa,
      totalUSD,
      totalBs: +(Math.round(totalBs + "e+2") + "e-2")
    };
  }

  function renderCarrito() {
    if (carrito.length === 0) {
      carritoContainer.style.display = 'none';
      totalDisplay.textContent = '$0.00';
      actualizarPagosAutom(0, 0);
      return;
    }
    
    carritoContainer.style.display = 'block';
    
    carritoTbody.innerHTML = carrito.map((item, index) => {
      const isItemBs = item.monedaOriginal === 'VES' || item.monedaOriginal === 'Bs';
      const precioUnitarioDisplay = isItemBs 
        ? `Bs ${Utils.formatNumber(item.precioBase, true)}`
        : Utils.formatCurrency(item.precioUnitario);
      const subtotalDisplay = isItemBs
        ? `Bs ${Utils.formatNumber(item.cantidad * item.precioBase, true)} <small style="color:var(--color-text-secondary); display:block; font-size:10px;">(~${Utils.formatCurrency(item.subtotal)})</small>`
        : Utils.formatCurrency(item.subtotal);

      return `
        <tr>
          <td>
            <div style="font-weight:600;">${Utils.escapeHtml(item.nombre)}</div>
            ${isItemBs ? '<span style="font-size:10px; color:#2563EB;">(Fijo en Bs)</span>' : ''}
          </td>
          <td style="text-align:center">${item.cantidad}</td>
          <td style="text-align:right">${precioUnitarioDisplay}</td>
          <td style="text-align:right; font-weight:bold;">${subtotalDisplay}</td>
          <td style="text-align:center">
            <button type="button" class="btn-remove-cart" data-index="${index}" style="background:transparent; color:#ef4444; border:none; font-size:18px; font-weight:bold; cursor:pointer; padding:4px;" title="Eliminar">✕</button>
          </td>
        </tr>
      `;
    }).join('');
    
    const { totalUSD, totalBs } = calcularTotalesVenta();
    totalDisplay.innerHTML = `${Utils.formatCurrency(totalUSD)} <br><small style="font-size: 0.6em; font-weight: normal; opacity: 0.8; color: var(--color-text-secondary); line-height:1;">Bs ${Utils.formatNumber(totalBs, true)}</small>`;
    
    carritoTbody.querySelectorAll('.btn-remove-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        carrito.splice(idx, 1);
        renderCarrito();
      });
    });
    
    actualizarPagosAutom(totalUSD, totalBs);
    if (typeof actualizarBotonSaldoFavor === 'function') {
      actualizarBotonSaldoFavor();
    }
  }
  
  function actualizarBalanceBadge() {
    const badge = modal.querySelector('#cliente-balance-badge');
    const cid = hiddenId ? hiddenId.value : null;
    if (!cid) {
      if (badge) badge.innerHTML = '';
      if (typeof actualizarInfoCredito === 'function') {
        actualizarInfoCredito();
      }
      if (typeof actualizarBotonSaldoFavor === 'function') {
        actualizarBotonSaldoFavor();
      }
      if (typeof refrescarSelectsMetodos === 'function') {
        refrescarSelectsMetodos();
      }
      return;
    }
    const saldoNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(cid) : (store.getDeudaCliente(cid) || 0);
    if (badge) {
      if (saldoNeto > 0) {
        badge.innerHTML = `<span style="color:#DC2626; background:#FEE2E2; padding:3px 8px; border-radius:6px; font-weight:700;">⚠️ Debe: ${Utils.formatCurrency(saldoNeto)}</span>`;
      } else if (saldoNeto < 0) {
        badge.innerHTML = `<span style="color:#065F46; background:#D1FAE5; padding:3px 8px; border-radius:6px; font-weight:700;">💰 Saldo a Favor: +${Utils.formatCurrency(Math.abs(saldoNeto))}</span>`;
      } else {
        badge.innerHTML = `<span style="color:#1E40AF; background:#DBEAFE; padding:3px 8px; border-radius:6px; font-weight:700;">✅ Al Día ($0.00)</span>`;
      }
    }
    if (typeof actualizarInfoCredito === 'function') {
      actualizarInfoCredito();
    }
    if (typeof actualizarBotonSaldoFavor === 'function') {
      actualizarBotonSaldoFavor();
    }
    if (typeof refrescarSelectsMetodos === 'function') {
      refrescarSelectsMetodos();
    }
  }

  const btnNewClient = modal.querySelector('#btn-quick-new-cliente');
  if (btnNewClient) {
    btnNewClient.addEventListener('click', () => {
      openClienteModal(null, (nuevoCliente) => {
        if (nuevoCliente && nuevoCliente.id) {
          searchInput.value = nuevoCliente.nombre;
          searchInput.dataset.id = nuevoCliente.id;
          hiddenId.value = nuevoCliente.id;
          actualizarInfoPagos();
          actualizarBalanceBadge();
        }
      });
    });
  }

  const btnQuickAbono = modal.querySelector('#btn-quick-abono');
  if (btnQuickAbono) {
    btnQuickAbono.addEventListener('click', () => {
      const cid = hiddenId ? hiddenId.value : null;
      openAbonoClienteDirecto(cid || null, () => {
        actualizarBalanceBadge();
      });
    });
  }

  const btnQuickPropina = modal.querySelector('#btn-quick-propina');
  if (btnQuickPropina) {
    btnQuickPropina.addEventListener('click', () => {
      openModalPropina(() => {
        showToast('Propina registrada para el cuadre de caja', 'success');
      });
    });
  }

  const searchInput = modal.querySelector('#search-cliente-input');
  const resultsDiv = modal.querySelector('#search-cliente-results');
  const hiddenId = modal.querySelector('#hidden-cliente-id');

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.toLowerCase().trim();
    if (!val) {
      resultsDiv.classList.remove('active');
      hiddenId.value = '';
      searchInput.dataset.id = '';
      actualizarInfoPagos();
      actualizarBalanceBadge();
      return;
    }

    const currentClientes = store.getAll('clientes');
    const filtered = currentClientes.filter(c =>
      c.nombre.toLowerCase().includes(val) ||
      (c.rif && c.rif.toLowerCase().includes(val))
    ).slice(0, 10);

    if (filtered.length === 0) {
      resultsDiv.innerHTML = '<div class="search-item"><span class="search-item-title">No se encontraron clientes</span></div>';
    } else {
      resultsDiv.innerHTML = filtered.map(c => {
        const saldoNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(c.id) : (store.getDeudaCliente(c.id) || 0);
        const deuda = Math.max(0, saldoNeto);
        const saldoFavor = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;
        let balanceMeta = 'Al día ($0.00)';
        if (deuda > 0) balanceMeta = `Deuda: <strong style="color:#DC2626;">${Utils.formatCurrency(deuda)}</strong>`;
        else if (saldoFavor > 0) balanceMeta = `Abono a favor: <strong style="color:#10B981;">+${Utils.formatCurrency(saldoFavor)}</strong>`;
        return `
          <div class="search-item" data-id="${c.id}" data-nombre="${Utils.escapeHtml(c.nombre)}">
            <span class="search-item-title">${Utils.escapeHtml(c.nombre)}</span>
            <span class="search-item-meta">${c.rif || 'Sin RIF'} • ${balanceMeta}</span>
          </div>
        `;
      }).join('');

      resultsDiv.querySelectorAll('.search-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const nombre = item.dataset.nombre;
          searchInput.value = nombre;
          searchInput.dataset.id = id;
          hiddenId.value = id;
          resultsDiv.classList.remove('active');
          actualizarInfoPagos();
          actualizarBalanceBadge();
        });
      });
    }
    resultsDiv.classList.add('active');
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!hiddenId.value && searchInput.value.trim()) {
        const val = searchInput.value.toLowerCase().trim();
        const currentClientes = store.getAll('clientes');
        const match = currentClientes.find(c => 
          c.nombre.toLowerCase().trim() === val || 
          (c.rif && c.rif.toLowerCase().trim() === val)
        );
        if (match) {
          hiddenId.value = match.id;
          searchInput.dataset.id = match.id;
          searchInput.value = match.nombre;
          actualizarInfoPagos();
          actualizarBalanceBadge();
        }
      }
    }, 250);
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.classList.remove('active');
    }
  });

  const selectTipo = modal.querySelector('#select-tipo-botellon');
  const inputBot = modal.querySelector('#input-botellones');
  const inputPrecio = modal.querySelector('#input-precio');
  const diffPanel = modal.querySelector('#pago-diff-panel');
  const diffMonto = modal.querySelector('#pago-diff-monto');

  function syncPrecioSeleccionado() {
    if (!selectTipo || !inputPrecio) return;
    const opt = selectTipo.options[selectTipo.selectedIndex];
    if (!opt) return;
    const isBs = opt.dataset.moneda === 'VES' || opt.dataset.moneda === 'Bs';
    const precioBase = parseFloat(opt.dataset.precio) || 0;
    const tasa = parseFloat(modal.querySelector('#input-tasa')?.value) || (store.getConfig('tasaCambio') || 40.00);
    
    if (isBs) {
      const precioUSD = tasa > 0 ? (precioBase / tasa) : 0;
      inputPrecio.value = precioUSD.toFixed(2);
      inputPrecio.title = `Fijo en Bs (${Utils.formatNumber(precioBase, true)}) convertido a $ a tasa ${Utils.formatNumber(tasa, true)}`;
    } else {
      inputPrecio.value = precioBase.toFixed(2);
      inputPrecio.title = `Fijo en dólares ($)`;
    }
  }

  modal.querySelector('#btn-add-item').addEventListener('click', () => {
    const cantidad = parseInt(inputBot.value);
    const precioInputVal = parseFloat(inputPrecio.value);
    
    if (!cantidad || cantidad < 1 || isNaN(precioInputVal) || precioInputVal < 0) {
      showToast('Cantidad o precio inválido', 'error');
      return;
    }
    
    const opt = selectTipo.options[selectTipo.selectedIndex];
    const tipoBotellonId = opt.value;
    const nombre = opt.dataset.nombre;
    const litrosPorUnidad = parseFloat(opt.dataset.litros) || 20;
    const categoria = opt.dataset.categoria || 'relleno';
    const monedaOriginal = opt.dataset.moneda || 'USD';
    const precioBase = parseFloat(opt.dataset.precio) || 0;
    const tasa = parseFloat(modal.querySelector('#input-tasa')?.value) || (store.getConfig('tasaCambio') || 40.00);

    const isBsProducto = monedaOriginal === 'VES' || monedaOriginal === 'Bs';
    const precioCalculadoUSD = isBsProducto ? (tasa > 0 ? +(precioBase / tasa).toFixed(2) : 0) : precioBase;
    
    // Si el usuario no modificó el precio convertido, mantenemos la moneda fija en Bs exacta
    const esFijoBs = isBsProducto && Math.abs(precioInputVal - precioCalculadoUSD) <= 0.01;
    const finalMonedaOriginal = esFijoBs ? 'VES' : 'USD';
    const finalPrecioBase = esFijoBs ? precioBase : precioInputVal;
    const precioUnitario = esFijoBs ? (tasa > 0 ? (precioBase / tasa) : 0) : precioInputVal;
    
    const existenteIdx = carrito.findIndex(item => item.tipoBotellonId === tipoBotellonId && item.monedaOriginal === finalMonedaOriginal);
    
    if (existenteIdx !== -1) {
      carrito[existenteIdx].cantidad += cantidad;
      carrito[existenteIdx].subtotal = carrito[existenteIdx].cantidad * carrito[existenteIdx].precioUnitario;
      carrito[existenteIdx].litros += (cantidad * litrosPorUnidad);
    } else {
      carrito.push({
        tipoBotellonId,
        categoria,
        nombre,
        cantidad,
        monedaOriginal: finalMonedaOriginal,
        precioBase: finalPrecioBase,
        precioUnitario,
        subtotal: cantidad * precioUnitario,
        litros: cantidad * litrosPorUnidad
      });
    }
    
    inputBot.value = '1';
    renderCarrito();
  });

  function actualizarPagosAutom(totalUSD, totalBs) {
    const pagosMontoInputs = modal.querySelectorAll('.pago-monto');
    if (pagosMontoInputs.length === 1) {
      const isUsd = isUsdMethod(modal.querySelector('.pago-metodo').value);
      pagosMontoInputs[0].value = isUsd ? (totalUSD || 0).toFixed(2) : (totalBs || 0).toFixed(2);
    }
    actualizarInfoPagos();
  }

  function getMetodosParaSelect() {
    const allActivos = store.getMetodosPago(true);
    const cid = hiddenId ? hiddenId.value : null;
    const saldoNeto = cid ? (store.getSaldoNetoCliente ? store.getSaldoNetoCliente(cid) : 0) : 0;
    const tieneSaldoFavor = saldoNeto < 0;

    return allActivos.filter(m => {
      if (m.id === 'saldo_favor') {
        return tieneSaldoFavor;
      }
      return true;
    });
  }

  function refrescarSelectsMetodos() {
    const metodosDisponibles = getMetodosParaSelect();
    modal.querySelectorAll('.pago-metodo').forEach(sel => {
      const currentVal = sel.value;
      sel.innerHTML = metodosDisponibles.map(m => `<option value="${m.id}">${formatMetodoOption(m)}</option>`).join('');
      if (metodosDisponibles.some(m => m.id === currentVal)) {
        sel.value = currentVal;
      } else {
        sel.value = 'punto';
      }
    });
  }

  function actualizarBotonSaldoFavor() {
    const container = modal.querySelector('#container-btn-saldo-favor');
    if (!container) return;

    const cid = hiddenId ? hiddenId.value : null;
    const saldoNeto = cid ? (store.getSaldoNetoCliente ? store.getSaldoNetoCliente(cid) : 0) : 0;
    const saldoFavor = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;
    const { totalUSD, totalBs, tasa } = calcularTotalesVenta();

    if (saldoFavor > 0 && totalUSD > 0) {
      container.style.display = 'block';
      if (saldoFavor < totalUSD) {
        const diffUSD = totalUSD - saldoFavor;
        const diffBs = diffUSD * tasa;
        container.innerHTML = `
          <button type="button" id="btn-aplicar-saldo-favor" style="width:100%; background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%); border: 1.5px solid #10B981; color: #065F46; padding: 9px 12px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s ease;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:700;">
              <span>💰</span>
              <span>Usar Saldo a Favor (${Utils.formatCurrency(saldoFavor)})</span>
            </div>
            <span style="background: #10B981; color: #fff; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
              + Pagar Resto: ${Utils.formatCurrency(diffUSD)} (Bs ${Utils.formatNumber(diffBs, true)}) ➔
            </span>
          </button>
        `;
      } else {
        container.innerHTML = `
          <button type="button" id="btn-aplicar-saldo-favor" style="width:100%; background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%); border: 1.5px solid #10B981; color: #065F46; padding: 9px 12px; border-radius: 8px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s ease;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:700;">
              <span>💰</span>
              <span>Pagar Total con Saldo a Favor</span>
            </div>
            <span style="background: #10B981; color: #fff; font-weight: 700; padding: 4px 10px; border-radius: 6px; font-size: 12px;">
              ${Utils.formatCurrency(totalUSD)} ➔
            </span>
          </button>
        `;
      }

      const btnAplicar = container.querySelector('#btn-aplicar-saldo-favor');
      if (btnAplicar) {
        btnAplicar.addEventListener('click', () => {
          const radioContado = modal.querySelector('input[name="tipo"][value="contado"]');
          if (radioContado) {
            radioContado.checked = true;
            if (seccionPagos) seccionPagos.style.display = 'block';
            if (seccionInfoCredito) seccionInfoCredito.style.display = 'none';
          }

          const pagosList = modal.querySelector('#pagos-list');
          pagosList.innerHTML = '';

          const metodosDisponibles = getMetodosParaSelect();

          if (saldoFavor < totalUSD) {
            const diffUSD = totalUSD - saldoFavor;
            const diffBs = diffUSD * tasa;

            // Fila 1: Saldo a favor ($saldoFavor)
            const row1 = document.createElement('div');
            row1.className = 'pago-row';
            row1.style.display = 'grid';
            row1.style.gridTemplateColumns = '1.5fr 1fr 40px';
            row1.style.gap = '8px';
            row1.style.alignItems = 'center';
            row1.style.marginBottom = 'var(--space-xs)';
            row1.innerHTML = `
              <div class="form-group" style="margin-bottom: 0;">
                <select class="form-control pago-metodo">
                  ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'saldo_favor' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${saldoFavor.toFixed(2)}" placeholder="0.00"/>
              </div>
              <div style="width: 40px;"></div>
              <div class="form-group pago-ref-container" style="grid-column: 1 / -1; margin-bottom: 0; display: none;">
                <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia"/>
              </div>
            `;
            pagosList.appendChild(row1);

            // Fila 2: Resto a pagar (default punto en Bs)
            const row2 = document.createElement('div');
            row2.className = 'pago-row';
            row2.style.display = 'grid';
            row2.style.gridTemplateColumns = '1.5fr 1fr 40px';
            row2.style.gap = '8px';
            row2.style.alignItems = 'center';
            row2.style.marginBottom = 'var(--space-xs)';
            row2.innerHTML = `
              <div class="form-group" style="margin-bottom: 0;">
                <select class="form-control pago-metodo">
                  ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${diffBs.toFixed(2)}" placeholder="0.00"/>
              </div>
              <button type="button" class="btn btn-danger btn-remove-pago" style="height: 38px; width: 40px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 16px;">✕</button>
              <div class="form-group pago-ref-container" style="grid-column: 1 / -1; margin-bottom: 0; display: none;">
                <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia"/>
              </div>
            `;
            pagosList.appendChild(row2);

            row2.querySelector('.btn-remove-pago').addEventListener('click', () => {
              row2.remove();
              actualizarInfoPagos();
            });
            row1.querySelector('.pago-monto').addEventListener('input', actualizarInfoPagos);
            row2.querySelector('.pago-monto').addEventListener('input', actualizarInfoPagos);

          } else {
            // Fila 1: Paga total con saldo a favor
            const row1 = document.createElement('div');
            row1.className = 'pago-row';
            row1.style.display = 'grid';
            row1.style.gridTemplateColumns = '1.5fr 1fr 40px';
            row1.style.gap = '8px';
            row1.style.alignItems = 'center';
            row1.style.marginBottom = 'var(--space-xs)';
            row1.innerHTML = `
              <div class="form-group" style="margin-bottom: 0;">
                <select class="form-control pago-metodo">
                  ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'saldo_favor' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${totalUSD.toFixed(2)}" placeholder="0.00"/>
              </div>
              <div style="width: 40px;"></div>
              <div class="form-group pago-ref-container" style="grid-column: 1 / -1; margin-bottom: 0; display: none;">
                <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia"/>
              </div>
            `;
            pagosList.appendChild(row1);
            row1.querySelector('.pago-monto').addEventListener('input', actualizarInfoPagos);
          }

          showToast('Saldo a favor aplicado a la venta', 'info');
          actualizarInfoPagos();
        });
      }
    } else {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  }

  function actualizarInfoPagos() {
    const { totalUSD, totalBs, tasa } = calcularTotalesVenta();
    
    let totalPagosDolares = 0;
    let totalPagosBs = 0;
    modal.querySelectorAll('.pago-row').forEach(row => {
      const isUsd = isUsdMethod(row.querySelector('.pago-metodo').value);
      const rawVal = row.querySelector('.pago-monto').value || '0';
      const val = parseFloat(rawVal.replace(',', '.')) || 0;
      if (isUsd) {
        totalPagosDolares += val;
        totalPagosBs += val * tasa;
      } else {
        totalPagosBs += val;
        totalPagosDolares += (tasa > 0 ? val / tasa : 0);
      }
    });

    const clienteId = hiddenId.value;
    if (clienteId && (totalPagosDolares > (totalUSD + 0.01) || totalPagosBs > (totalBs + 0.50))) {
      diffMonto.textContent = Utils.formatCurrency(Math.max(0, totalPagosDolares - totalUSD));
      diffPanel.style.display = 'flex';
    } else {
      diffPanel.style.display = 'none';
    }
  }

  modal.querySelector('#btn-add-pago-venta').addEventListener('click', () => {
    const { totalUSD, totalBs, tasa } = calcularTotalesVenta();
    
    let otrosPagosUSD = 0;
    let otrosPagosBs = 0;
    modal.querySelectorAll('.pago-row').forEach(row => {
      const isUsd = isUsdMethod(row.querySelector('.pago-metodo').value);
      const rawVal = row.querySelector('.pago-monto').value || '0';
      const val = parseFloat(rawVal.replace(',', '.')) || 0;
      if (isUsd) {
        otrosPagosUSD += val;
        otrosPagosBs += val * tasa;
      } else {
        otrosPagosBs += val;
        otrosPagosUSD += (tasa > 0 ? val / tasa : 0);
      }
    });
    
    const remanenteBs = Math.max(0, totalBs - otrosPagosBs);
    const defaultVal = remanenteBs > 0 ? remanenteBs.toFixed(2) : "0.00";

    const metodosDisponibles = getMetodosParaSelect();

    const row = document.createElement('div');
    row.className = 'pago-row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1.5fr 1fr 40px';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.marginBottom = 'var(--space-xs)';
    row.innerHTML = `
      <div class="form-group" style="margin-bottom: 0;">
        <select class="form-control pago-metodo">
          ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 0;">
        <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${defaultVal}" placeholder="0.00"/>
      </div>
      <button type="button" class="btn btn-danger btn-remove-pago" style="height: 38px; width: 40px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 16px;">✕</button>
      
      <div class="form-group pago-ref-container" style="grid-column: 1 / -1; margin-bottom: 0; display: none;">
        <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia"/>
      </div>
    `;
    modal.querySelector('#pagos-list').appendChild(row);
    row.querySelector('.btn-remove-pago').addEventListener('click', () => {
      row.remove();
      actualizarInfoPagos();
    });
    row.querySelector('.pago-monto').addEventListener('input', actualizarInfoPagos);
  });

  modal.querySelector('.pago-monto').addEventListener('input', actualizarInfoPagos);

  modal.querySelector('#seccion-pagos').addEventListener('change', (e) => {
    if (e.target.classList.contains('pago-metodo')) {
      const row = e.target.closest('.pago-row');
      if (!row) return;
      const input = row.querySelector('.pago-monto');
      
      const { totalUSD, totalBs, tasa } = calcularTotalesVenta();

      let otrosPagosUSD = 0;
      let otrosPagosBs = 0;
      modal.querySelectorAll('.pago-row').forEach(r => {
        if (r === row) return;
        const isUsd = isUsdMethod(r.querySelector('.pago-metodo').value);
        const rawVal = r.querySelector('.pago-monto').value || '0';
        const val = parseFloat(rawVal.replace(',', '.')) || 0;
        if (isUsd) {
          otrosPagosUSD += val;
          otrosPagosBs += val * tasa;
        } else {
          otrosPagosBs += val;
          otrosPagosUSD += (tasa > 0 ? val / tasa : 0);
        }
      });

      const remanenteUSD = Math.max(0, totalUSD - otrosPagosUSD);
      const remanenteBs = Math.max(0, totalBs - otrosPagosBs);
      
      if (isUsdMethod(e.target.value)) {
        input.value = remanenteUSD > 0 ? remanenteUSD.toFixed(2) : "0.00";
      } else {
        input.value = remanenteBs > 0 ? remanenteBs.toFixed(2) : "0.00";
      }
      
      actualizarInfoPagos();
    }
  });

  selectTipo.addEventListener('change', syncPrecioSeleccionado);
  syncPrecioSeleccionado();

  const radiosTipo = modal.querySelectorAll('input[name="tipo"]');
  const seccionPagos = modal.querySelector('#seccion-pagos');
  const seccionInfoCredito = modal.querySelector('#seccion-info-credito');

  function actualizarInfoCredito() {
    if (!seccionInfoCredito) return;
    const currentTipo = modal.querySelector('input[name="tipo"]:checked')?.value || 'contado';
    if (currentTipo !== 'credito' && currentTipo !== 'convenio') {
      seccionInfoCredito.style.display = 'none';
      return;
    }
    seccionInfoCredito.style.display = 'block';

    if (currentTipo === 'convenio') {
      seccionInfoCredito.innerHTML = `ℹ️ Esta venta se registrará bajo modalidad de <strong>Convenio Institucional / Especial</strong>.`;
      seccionInfoCredito.style.background = 'var(--color-bg-secondary)';
      seccionInfoCredito.style.border = '1px solid var(--color-border)';
      return;
    }

    const cid = hiddenId ? hiddenId.value : null;
    const { totalUSD } = calcularTotalesVenta();
    if (!cid) {
      seccionInfoCredito.innerHTML = `ℹ️ Esta venta se registrará bajo modalidad de <strong>A Crédito / Saldo a Favor</strong> (debe seleccionar un cliente).`;
      seccionInfoCredito.style.background = 'var(--color-bg-secondary)';
      seccionInfoCredito.style.border = '1px solid var(--color-border)';
      return;
    }

    const cliente = store.getById('clientes', cid);
    const saldoNeto = store.getSaldoNetoCliente ? store.getSaldoNetoCliente(cid) : (store.getDeudaCliente(cid) || 0);
    const saldoFavor = saldoNeto < 0 ? Math.abs(saldoNeto) : 0;

    if (saldoFavor > 0) {
      if (saldoFavor >= totalUSD) {
        const restante = saldoFavor - totalUSD;
        seccionInfoCredito.innerHTML = `
          <div style="color: #065F46; line-height: 1.5;">
            <strong>💰 Pago con Saldo a Favor por Adelantado:</strong><br/>
            Se descontarán <strong>${Utils.formatCurrency(totalUSD)}</strong> de los <strong>${Utils.formatCurrency(saldoFavor)}</strong> que ${Utils.escapeHtml(cliente?.nombre || 'el cliente')} tiene a favor.<br/>
            Saldo a favor restante disponible: <strong style="font-size:15px; color:#047857;">+${Utils.formatCurrency(restante)}</strong>
          </div>
        `;
        seccionInfoCredito.style.background = '#ECFDF5';
        seccionInfoCredito.style.border = '1.5px solid #10B981';
      } else {
        const deudaNueva = totalUSD - saldoFavor;
        seccionInfoCredito.innerHTML = `
          <div style="color: #92400E; line-height: 1.5;">
            <strong>⚠️ Uso Parcial de Saldo a Favor:</strong><br/>
            Se consumirá todo el saldo a favor disponible (<strong>+${Utils.formatCurrency(saldoFavor)}</strong>).<br/>
            La diferencia restante de <strong>${Utils.formatCurrency(deudaNueva)}</strong> quedará registrada como <strong>deuda pendiente</strong>.
          </div>
        `;
        seccionInfoCredito.style.background = '#FFFBEB';
        seccionInfoCredito.style.border = '1.5px solid #F59E0B';
      }
    } else {
      const deudaActual = Math.max(0, saldoNeto);
      const deudaTotal = deudaActual + totalUSD;
      seccionInfoCredito.innerHTML = `
        <div style="color: var(--color-text-secondary); line-height: 1.5;">
          ℹ️ Esta venta de <strong>${Utils.formatCurrency(totalUSD)}</strong> se cargará a la cuenta de crédito de <strong>${Utils.escapeHtml(cliente?.nombre || 'el cliente')}</strong>.<br/>
          Deuda total resultante: <strong style="color:#DC2626;">${Utils.formatCurrency(deudaTotal)}</strong>
        </div>
      `;
      seccionInfoCredito.style.background = 'var(--color-bg-secondary)';
      seccionInfoCredito.style.border = '1px solid var(--color-border)';
    }
  }
  
  radiosTipo.forEach(r => {
    r.addEventListener('change', () => {
      const isCreditoConvenio = (r.value === 'credito' || r.value === 'convenio');
      if (seccionPagos) seccionPagos.style.display = isCreditoConvenio ? 'none' : 'block';
      actualizarInfoCredito();
    });
  });
  
  const checkDelivery = modal.querySelector('#check-delivery');
  const containerDelivery = modal.querySelector('#container-monto-delivery');
  const inputDelivery = modal.querySelector('#monto-delivery');
  const cantDelivery = modal.querySelector('#cant-delivery');
  
  if (checkDelivery && containerDelivery && inputDelivery) {
    checkDelivery.addEventListener('change', (e) => {
      containerDelivery.style.display = e.target.checked ? 'flex' : 'none';
      if (e.target.checked) {
        inputDelivery.value = (store.getConfig('precioDelivery') ?? 0.50).toFixed(2);
        if (cantDelivery) cantDelivery.value = '1';
      } else {
        inputDelivery.value = '0.00';
        if (cantDelivery) cantDelivery.value = '1';
      }
      renderCarrito();
    });
    
    inputDelivery.addEventListener('input', () => {
      renderCarrito();
    });
    if (cantDelivery) {
      cantDelivery.addEventListener('input', () => renderCarrito());
    }
  }
  
  // Listener para mostrar u ocultar referencia
  modal.addEventListener('change', (e) => {
    if (e.target.classList.contains('pago-metodo')) {
      const row = e.target.closest('.pago-row');
      const refContainer = row.querySelector('.pago-ref-container');
      if (refContainer) {
        if (e.target.value === 'pago_movil' || e.target.value === 'transferencia') {
          refContainer.style.display = 'block';
        } else {
          refContainer.style.display = 'none';
          refContainer.querySelector('.pago-referencia').value = '';
        }
      }
    }
  });

  renderCarrito();
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

        // Restore stock of physical products
        if (venta.detalles && venta.detalles.length > 0) {
          const allTipos = store.getConfig('tiposBotellon') || [];
          let updated = false;
          venta.detalles.forEach(d => {
            if (d.categoria === 'producto' && d.tipoBotellonId) {
              const pIdx = allTipos.findIndex(p => p.id === d.tipoBotellonId);
              if (pIdx !== -1) {
                allTipos[pIdx].stock = (allTipos[pIdx].stock || 0) + (d.cantidad || 0);
                updated = true;
              }
            }
          });
          if (updated) {
            store.setConfig('tiposBotellon', allTipos);
          }
        }
      }
      store.delete('ventas', id);
      syncToCloud();
      showToast('Venta eliminada e inventario restaurado', 'success');
      closeModal();
      renderVentasTable();
    }
  });
}

export function openModalCaudalimetro(fecha = Utils.todayISO(), onSaved = null) {
  const unidad = store.getConfig('unidadCaudalimetro') || 'L';
  const lectura = store.getLecturaCaudalimetro(fecha);
  
  openModal({
    title: '⏱️ Lectura de Reloj Medidor de Agua',
    content: `
      <form id="form-caudalimetro-modal" style="padding: 10px 0;">
        <p class="text-muted" style="font-size: 13px; margin-bottom: 15px;">
          Ingresa el número marcado en el reloj medidor de flujo físico de la tienda para la fecha <strong>${Utils.formatDate(fecha)}</strong>.
        </p>

        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 12px; font-weight: 700; color: #1E293B;">
              🌅 Lectura Inicial (Apertura)
            </label>
            <div style="position: relative;">
              <input type="number" step="any" class="form-control" name="inicial" id="caud-input-inicial" value="${lectura.inicial !== null ? lectura.inicial : ''}" placeholder="Ej: 124500" style="font-size: 16px; font-weight: 700; padding-right: 35px;" />
              <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--color-text-secondary); font-weight: bold;">${unidad}</span>
            </div>
            <small style="color: var(--color-text-secondary); font-size: 11px;">Al abrir la tienda en la mañana.</small>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 12px; font-weight: 700; color: #1E293B;">
              🌇 Lectura Final (Cierre)
            </label>
            <div style="position: relative;">
              <input type="number" step="any" class="form-control" name="final" id="caud-input-final" value="${lectura.final !== null ? lectura.final : ''}" placeholder="Ej: 126000" style="font-size: 16px; font-weight: 700; padding-right: 35px;" />
              <span style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--color-text-secondary); font-weight: bold;">${unidad}</span>
            </div>
            <small style="color: var(--color-text-secondary); font-size: 11px;">Al terminar la jornada de ventas.</small>
          </div>
        </div>

        <div id="caud-preview-calculo" style="background: var(--color-bg-body, #F8FAFC); border: 1.5px dashed var(--color-border, #CBD5E1); border-radius: 8px; padding: 12px; text-align: center; margin-top: 10px;">
          <div style="font-size: 12px; color: var(--color-text-secondary);">Agua Despachada según Reloj:</div>
          <div id="caud-total-litros-preview" style="font-size: 20px; font-weight: 800; color: #10B981; margin-top: 2px;">
            ${lectura.litrosReloj.toLocaleString()} Litros
          </div>
        </div>
      </form>
    `,
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-caudalimetro-modal');
      const iniVal = form.querySelector('#caud-input-inicial').value.trim();
      const finVal = form.querySelector('#caud-input-final').value.trim();

      const iniNum = iniVal !== '' ? parseFloat(iniVal) : null;
      const finNum = finVal !== '' ? parseFloat(finVal) : null;

      if (iniNum !== null && finNum !== null && finNum < iniNum) {
        showToast('⚠️ La lectura final no puede ser menor a la lectura inicial', 'warning');
        return;
      }

      const saved = store.saveLecturaCaudalimetro(fecha, {
        inicial: iniNum,
        final: finNum
      });

      closeModal();
      showToast('⏱️ Lectura de reloj medidor guardada con éxito', 'success');
      if (onSaved) onSaved(saved);
      if (typeof syncToCloud === 'function') syncToCloud();
    }
  });

  // Cálculo en vivo dentro del modal
  setTimeout(() => {
    const iniInput = document.getElementById('caud-input-inicial');
    const finInput = document.getElementById('caud-input-final');
    const previewEl = document.getElementById('caud-total-litros-preview');

    const updatePreview = () => {
      const ini = parseFloat(iniInput?.value) || 0;
      const fin = parseFloat(finInput?.value) || 0;
      const factor = unidad === 'm3' ? 1000 : 1;
      const diff = Math.max(0, (fin - ini) * factor);
      if (previewEl) {
        if (fin > 0 && ini > 0) {
          previewEl.textContent = `${diff.toLocaleString()} Litros`;
          previewEl.style.color = fin >= ini ? '#10B981' : '#DC2626';
        } else {
          previewEl.textContent = 'Ingrese lecturas para calcular';
          previewEl.style.color = 'var(--color-text-secondary)';
        }
      }
    };

    if (iniInput) iniInput.addEventListener('input', updatePreview);
    if (finInput) finInput.addEventListener('input', updatePreview);
  }, 100);
}

export function openModalPropina(onSuccess) {
  const currentTasa = store.getConfig('tasaCambio') || 40.00;
  const metodosActivos = store.getMetodosPago(true).filter(m => m.id !== 'saldo_favor');

  const content = `
    <form id="form-propina">
      <div style="text-align: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--color-border);">
        <span style="font-size: 32px;">🎁</span>
        <h3 style="margin: 4px 0 0 0; color: var(--color-primary-900); font-size: 17px;">Registrar Propina (Punto / Banco)</h3>
        <p style="margin: 3px 0 0 0; font-size: 13px; color: var(--color-text-secondary);">
          Registra el cobro bancario de propina para que cuadre con el lote del punto y se liquide a los muchachos.
        </p>
      </div>

      <!-- Fila Monto y Moneda -->
      <div class="form-row" style="margin-bottom: 15px;">
        <div class="form-group" style="flex: 1.2;">
          <label class="form-label" style="font-weight: 700;">Monto Cobrado *</label>
          <div style="position: relative;">
            <input type="number" step="0.01" min="0.01" class="form-control" name="monto" id="propina-monto" required placeholder="0.00" style="font-size: 18px; font-weight: 700; padding-left: 12px;"/>
          </div>
        </div>
        <div class="form-group" style="flex: 0.8;">
          <label class="form-label">Moneda</label>
          <select class="form-control" name="moneda" id="propina-moneda" style="font-weight: 600;">
            <option value="Bs" selected>Bs (Bolívares)</option>
            <option value="USD">USD ($ Dólares)</option>
          </select>
        </div>
      </div>

      <!-- Conversión visual en vivo -->
      <div id="propina-conversion" style="background: #F1F5F9; border-radius: 6px; padding: 8px 12px; font-size: 13px; color: var(--color-text-secondary); margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
        <span>Equivalente:</span>
        <strong id="propina-conversion-txt" style="color: var(--color-primary-900); font-size: 14px;">$0.00 (Tasa: ${Utils.formatNumber(currentTasa, true)})</strong>
      </div>

      <!-- Fila Método y Referencia -->
      <div class="form-row" style="margin-bottom: 15px;">
        <div class="form-group" style="flex: 1.2;">
          <label class="form-label" style="font-weight: 700;">Método de Pago *</label>
          <select class="form-control" name="metodo" id="propina-metodo" required>
            ${metodosActivos.map(m => `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${m.icon || '💳'} ${m.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label" style="font-weight: 700;">Nº de Referencia *</label>
          <input type="text" class="form-control" name="referencia" id="propina-referencia" required placeholder="Ej: 4589" style="font-weight: 600;"/>
        </div>
      </div>

      <!-- Fecha y Nota -->
      <div class="form-row" style="margin-bottom: 15px;">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Fecha</label>
          <input type="date" class="form-control" name="fecha" value="${Utils.todayISO()}" required/>
        </div>
        <div class="form-group" style="flex: 1.5;">
          <label class="form-label">Destinatario / Nota (Opcional)</label>
          <input type="text" class="form-control" name="nota" placeholder="Ej: Despachadores de turno"/>
        </div>
      </div>
    </form>
  `;

  openModal({
    title: '🎁 Registro de Propina',
    content,
    saveLabel: 'Guardar Propina',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-propina');
      const fd = new FormData(form);
      const rawMonto = parseFloat(fd.get('monto'));
      const moneda = fd.get('moneda') || 'Bs';
      const metodo = fd.get('metodo') || 'punto';
      const referencia = (fd.get('referencia') || '').trim();
      const inputFecha = fd.get('fecha') || Utils.todayISO();
      const nota = (fd.get('nota') || '').trim();

      if (isNaN(rawMonto) || rawMonto <= 0) {
        showToast('Ingrese un monto de propina válido', 'error');
        return false;
      }

      if (!referencia) {
        showToast('El número de referencia del voucher es requerido', 'warning');
        return false;
      }

      let fechaRegistro = Utils.nowISO();
      if (inputFecha !== Utils.todayISO()) {
        fechaRegistro = new Date(inputFecha + 'T12:00:00').toISOString();
      }

      const tasa = currentTasa;
      let montoUSD = 0;
      let montoBs = 0;
      if (moneda === 'Bs' || moneda === 'VES') {
        montoBs = rawMonto;
        montoUSD = tasa > 0 ? (rawMonto / tasa) : 0;
      } else {
        montoUSD = rawMonto;
        montoBs = rawMonto * tasa;
      }

      const propina = {
        id: Utils.generateId(),
        monto: rawMonto,
        moneda,
        montoUSD,
        montoBs,
        tasa,
        metodo,
        referencia,
        nota,
        fecha: fechaRegistro
      };

      store.save('propinas', propina);
      showToast(`Propina de ${moneda === 'USD' ? Utils.formatCurrency(montoUSD) : 'Bs ' + Utils.formatNumber(montoBs, true)} registrada correctamente`, 'success');
      closeModal();

      if (typeof syncToCloud === 'function') {
        syncToCloud();
      }

      if (typeof onSuccess === 'function') {
        onSuccess(propina);
      }
    }
  });

  // Listener para la conversión en vivo
  setTimeout(() => {
    const inputMonto = document.getElementById('propina-monto');
    const selectMoneda = document.getElementById('propina-moneda');
    const txtConversion = document.getElementById('propina-conversion-txt');

    function updateConversion() {
      if (!inputMonto || !selectMoneda || !txtConversion) return;
      const val = parseFloat(inputMonto.value) || 0;
      const mon = selectMoneda.value;
      if (mon === 'Bs') {
        const usd = currentTasa > 0 ? (val / currentTasa) : 0;
        txtConversion.textContent = `≈ ${Utils.formatCurrency(usd)} (Tasa: ${Utils.formatNumber(currentTasa, true)})`;
      } else {
        const bs = val * currentTasa;
        txtConversion.textContent = `≈ Bs ${Utils.formatNumber(bs, true)} (Tasa: ${Utils.formatNumber(currentTasa, true)})`;
      }
    }

    if (inputMonto) inputMonto.addEventListener('input', updateConversion);
    if (selectMoneda) selectMoneda.addEventListener('change', updateConversion);
  }, 100);
}

export function openModalDetallePropinas(fecha, onUpdate) {
  const targetFecha = fecha || Utils.todayISO();
  const allPropinas = store.getAll('propinas');
  const dayStart = new Date(targetFecha + 'T00:00:00');
  const dayEnd = new Date(targetFecha + 'T23:59:59');
  const currentTasa = store.getConfig('tasaCambio') || 40.00;
  const methods = store.getMetodosPago(false);

  const propinasDia = allPropinas.filter(p => {
    const d = new Date(p.fecha);
    return d >= dayStart && d <= dayEnd;
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  let totalBs = 0;
  let totalUSD = 0;
  propinasDia.forEach(p => {
    const tasa = p.tasa || currentTasa;
    if (p.moneda === 'Bs' || p.moneda === 'VES') {
      const mBs = parseFloat(p.monto) || 0;
      totalBs += mBs;
      totalUSD += (tasa > 0 ? mBs / tasa : 0);
    } else {
      const mUSD = parseFloat(p.monto) || 0;
      totalUSD += mUSD;
      totalBs += mUSD * tasa;
    }
  });

  const content = `
    <div style="margin-bottom: 15px;">
      <div style="display: flex; justify-content: space-between; align-items: center; background: #FFFBEB; border: 1.5px solid #FDE68A; padding: 12px 16px; border-radius: 8px; margin-bottom: 15px;">
        <div>
          <span style="font-size: 11px; font-weight: 700; color: #92400E; text-transform: uppercase;">Total Propinas (${targetFecha})</span>
          <div style="font-size: 20px; font-weight: 800; color: #B45309;">
            Bs ${Utils.formatNumber(totalBs, true)} <span style="font-size: 14px; font-weight: 600; color: #047857;">(~ ${Utils.formatCurrency(totalUSD)})</span>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" id="btn-modal-nueva-propina" style="font-size: 12px; font-weight: 700;">
          + Nueva Propina
        </button>
      </div>

      ${propinasDia.length > 0 ? `
        <div class="table-container" style="max-height: 350px; overflow-y: auto;">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Método</th>
                <th>Voucher / Ref.</th>
                <th>Nota</th>
                <th style="text-align: right;">Monto</th>
                <th style="text-align: center;">Acción</th>
              </tr>
            </thead>
            <tbody>
              ${propinasDia.map(p => {
                const horaStr = new Date(p.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
                const foundMethod = methods.find(m => m.id === p.metodo);
                const metodoStr = foundMethod ? `${foundMethod.icon || '💳'} ${foundMethod.label}` : p.metodo;
                const isBs = p.moneda === 'Bs' || p.moneda === 'VES';
                const montoStr = isBs ? `Bs ${Utils.formatNumber(p.monto, true)}` : Utils.formatCurrency(p.monto);
                return `
                  <tr>
                    <td class="text-muted" style="font-size: 11.5px;">${horaStr}</td>
                    <td style="font-size: 12px;">${metodoStr}</td>
                    <td class="font-semibold" style="font-size: 12.5px; color: #1E40AF;">${Utils.escapeHtml(p.referencia || '-')}</td>
                    <td class="text-muted" style="font-size: 11.5px;">${Utils.escapeHtml(p.nota || '-')}</td>
                    <td style="text-align: right; font-weight: 700; color: #92400E;">${montoStr}</td>
                    <td style="text-align: center;">
                      <button type="button" class="btn btn-xs btn-danger btn-delete-prop-modal" data-id="${p.id}" style="padding: 2px 6px; font-size: 11px;" title="Eliminar registro">🗑️</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state" style="padding: 25px 0; text-align: center; color: var(--color-text-secondary);"><span style="font-size: 28px;">🎁</span><p style="margin-top: 5px; font-size: 13px;">No hay propinas registradas para esta fecha.</p></div>'}
    </div>
  `;

  openModal({
    title: `🎁 Propinas del Día (${Utils.formatDate(targetFecha)})`,
    content,
    showSave: false,
    cancelLabel: 'Cerrar',
    onSave: () => {}
  });

  setTimeout(() => {
    const btnNueva = document.getElementById('btn-modal-nueva-propina');
    if (btnNueva) {
      btnNueva.addEventListener('click', () => {
        closeModal();
        openModalPropina(() => {
          openModalDetallePropinas(targetFecha, onUpdate);
          if (typeof onUpdate === 'function') onUpdate();
        });
      });
    }

    document.querySelectorAll('.btn-delete-prop-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        store.delete('propinas', id);
        showToast('Registro de propina eliminado', 'info');
        closeModal();
        openModalDetallePropinas(targetFecha, onUpdate);
        if (typeof onUpdate === 'function') onUpdate();
      });
    });
  }, 100);
}
