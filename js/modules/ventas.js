import { openClienteModal } from './clientes.js';
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

  if (fichasContainer) {
    fichasContainer.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; overflow-x: auto; padding-bottom: 2px;">
        <!-- Ficha Efectivo USD -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #10B981; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 105px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #065F46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            💵 Efectivo $
          </div>
          <div class="metric-value" style="font-size: 13.5px; font-weight: 700; color: #10B981; margin: 2px 0 0 0; white-space: nowrap;">
            ${Utils.formatCurrency(totales.efectivo_usd)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            En caja USD
          </div>
        </div>

        <!-- Ficha Efectivo Bs -->
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #3B82F6; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 105px;">
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
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #8B5CF6; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 105px;">
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
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #06B6D4; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 105px;">
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
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #F59E0B; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 105px;">
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
        <div class="metric-card" style="padding: 8px 10px; border-radius: 6px; border-left: 3px solid #EF4444; background: var(--color-surface); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-width: 105px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: #991B1B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            📋 A Crédito
          </div>
          <div class="metric-value" style="font-size: 13.5px; font-weight: 700; color: #DC2626; margin: 2px 0 0 0; white-space: nowrap;">
            ${Utils.formatCurrency(totales.credito)}
          </div>
          <div style="font-size: 8.5px; color: var(--color-text-secondary); margin-top: 1px; white-space: nowrap;">
            ${ventas.filter(v => v.tipo === 'credito').length} operaciones
          </div>
        </div>

        <!-- Ficha Total Facturado -->
        <div class="metric-card accent" style="padding: 8px 10px; border-radius: 6px; background: var(--color-primary-900, #1B4332); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-width: 105px;">
          <div class="metric-label" style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            💰 Total Facturado
          </div>
          <div class="metric-value" style="font-size: 14px; font-weight: 700; color: #fff; margin: 2px 0 0 0; white-space: nowrap;">
            ${Utils.formatCurrency(totales.totalUSD)}
          </div>
          <div style="font-size: 8.5px; color: rgba(255,255,255,0.8); margin-top: 1px; white-space: nowrap;">
            Bs ${Utils.formatNumber(totales.totalBs, true)} (${ventas.length})
          </div>
        </div>
      </div>
    `;
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
    let pagosStr = '-';
    if (v.tipo === 'credito') {
      pagosStr = '<span class="badge badge-warning" style="font-size: 0.75em;">A Crédito</span>';
    } else if (v.tipo === 'convenio') {
      pagosStr = '<span class="badge badge-info" style="font-size: 0.75em;">Convenio</span>';
    } else if (v.pagos && v.pagos.length > 0) {
      pagosStr = v.pagos.map(p => {
        const method = Utils.paymentMethods.find(m => m.id === p.metodo);
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

      <!-- Fila 2: Nuevo Cliente y Buscar Cliente -->
      <div style="display: grid; grid-template-columns: 250px 1fr; gap: 15px; align-items: flex-end; margin-bottom: 15px;">
        <div class="form-group" style="margin-bottom: 0;">
          <button type="button" class="btn" id="btn-quick-new-cliente" style="height: 38px; width: 100%; white-space: nowrap; padding: 0 20px; font-size: 16px; background: var(--color-success-light); color: var(--color-success); border: 1px solid var(--color-success-light); font-weight: 600; border-radius: 6px;">+ Nuevo Cliente</button>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Cliente (Nombre o RIF)</label>
          <div class="search-container">
            <input type="text" class="form-control" id="search-cliente-input" placeholder="Buscar o dejar vacío para Cliente General" autocomplete="off"/>
            <input type="hidden" name="clienteId" id="hidden-cliente-id" value=""/>
            <div id="search-cliente-results" class="search-results"></div>
          </div>
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
              <span>A Crédito</span>
            </label>
            <label class="form-check">
              <input type="radio" name="tipo" value="convenio"/>
              <span>Convenio</span>
            </label>
          </div>
        </div>
        
        <div class="form-group" style="flex: 2; border-left: 1px solid var(--color-border); padding-left: var(--space-md);">
          <div id="seccion-pagos">
            <div class="flex items-center justify-between mb-sm" style="margin-bottom: 15px;">
              <label class="form-label" style="margin:0">Métodos de Pago</label>
              <button type="button" class="btn btn-xs btn-secondary" id="btn-add-pago-venta">+ Añadir</button>
            </div>
            <div id="pagos-list">
              <div class="pago-row" style="display: grid; grid-template-columns: 1.5fr 1fr 40px; gap: 8px; align-items: center; margin-bottom: var(--space-xs);">
                <div class="form-group" style="margin-bottom: 0;">
                  <select class="form-control pago-metodo">
                    ${Utils.paymentMethods.map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('')}
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

  const formHtml = `
    <div style="padding: 0 0 20px 0;">
      <div class="page-header" style="margin-bottom: 20px;">
        <div>
          <h1 class="page-title">Punto de Venta</h1>
          <p class="page-subtitle">Registro de recargas y facturación</p>
        </div>
      </div>
      ${content}
    </div>
  `;
  container.innerHTML = formHtml;
  const modal = container;
  
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
      const clienteId = fd.get('clienteId') || null;
      const tipo = fd.get('tipo');

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
      if (tipo === 'contado') {
        const tasaActual = parseFloat(modal.querySelector('#input-tasa').value) || (store.getConfig('tasaCambio') || 40);
        overlay.querySelectorAll('.pago-row').forEach(row => {
          const metodo = row.querySelector('.pago-metodo').value;
          const rawMonto = row.querySelector('.pago-monto').value || '0';
          const inputMonto = parseFloat(rawMonto.replace(',', '.')) || 0;
          const isUsd = (metodo === 'efectivo_usd');
          const montoUSD = isUsd ? inputMonto : (tasaActual > 0 ? inputMonto / tasaActual : 0);
          const montoBs = isUsd ? (inputMonto * tasaActual) : inputMonto;
          
          const refEl = row.querySelector('.pago-referencia');
          const referencia = refEl && refEl.value ? refEl.value.trim() : null;
          
          if (montoUSD > 0) {
            pagos.push({ metodo, monto: montoUSD, referencia });
            totalPagadoUSD += montoUSD;
            totalPagadoBs += montoBs;
          }
        });
        
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
      modal.querySelector('#search-cliente-input').value = '';
      modal.querySelector('#search-cliente-input').dataset.id = '';
      modal.querySelector('input[name="tipo"][value="contado"]').checked = true;
      modal.querySelector('#seccion-pagos').style.display = 'block';
      const firstMetodo = modal.querySelector('.pago-metodo');
      if (firstMetodo) firstMetodo.value = 'punto';
      const firstMonto = modal.querySelector('.pago-monto');
      if (firstMonto) firstMonto.value = '0.00';
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
      
      const extraPagos = modal.querySelectorAll('.pago-row:not(:first-child)');
      extraPagos.forEach(r => r.remove());
      actualizarPagosAutom(0, 0);
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
  }
  
  const btnNewClient = modal.querySelector('#btn-quick-new-cliente');
  if (btnNewClient) {
    btnNewClient.addEventListener('click', () => {
      openClienteModal(null, (nuevoCliente) => {
        // Callback when client is saved
        searchInput.value = nuevoCliente.nombre;
        searchInput.dataset.id = nuevoCliente.id;
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
          <span class="search-item-meta">${c.rif || 'Sin RIF'} • Deuda: ${Utils.formatCurrency(store.getDeudaCliente(c.id))}</span>
        </div>
      `).join('');

      resultsDiv.querySelectorAll('.search-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const nombre = item.dataset.nombre;
          searchInput.value = nombre;
          searchInput.dataset.id = id;
          hiddenId.value = id;
          resultsDiv.classList.remove('active');
          actualizarInfoPagos();
        });
      });
    }
    resultsDiv.classList.add('active');
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
      resultsDiv.classList.remove('active');
    }
  }, { once: true });

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
      const isUsd = modal.querySelector('.pago-metodo').value === 'efectivo_usd';
      pagosMontoInputs[0].value = isUsd ? (totalUSD || 0).toFixed(2) : (totalBs || 0).toFixed(2);
    }
    actualizarInfoPagos();
  }

  function actualizarInfoPagos() {
    const { totalUSD, totalBs, tasa } = calcularTotalesVenta();
    
    let totalPagosDolares = 0;
    let totalPagosBs = 0;
    modal.querySelectorAll('.pago-row').forEach(row => {
      const isUsd = row.querySelector('.pago-metodo').value === 'efectivo_usd';
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
      const isUsd = row.querySelector('.pago-metodo').value === 'efectivo_usd';
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
          ${Utils.paymentMethods.map(m => `<option value="${m.id}">${m.icon} ${m.label}</option>`).join('')}
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
        const isUsd = r.querySelector('.pago-metodo').value === 'efectivo_usd';
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
      
      if (e.target.value === 'efectivo_usd') {
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
  const textoTipoVenta = modal.querySelector('#texto-tipo-venta');
  
  radiosTipo.forEach(r => {
    r.addEventListener('change', () => {
      const isCreditoConvenio = (r.value === 'credito' || r.value === 'convenio');
      if (seccionPagos) seccionPagos.style.display = isCreditoConvenio ? 'none' : 'block';
      if (seccionInfoCredito) {
        seccionInfoCredito.style.display = isCreditoConvenio ? 'block' : 'none';
        if (textoTipoVenta) textoTipoVenta.innerText = (r.value === 'credito') ? 'A Crédito' : 'Convenio';
      }
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
