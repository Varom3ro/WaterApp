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
          <select class="form-control" id="filter-tipo-venta" style="width:145px; height:38px; padding: 4px 8px;">
            <option value="">Todos los tipos</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
            <option value="convenio">🤝 Convenio</option>
            <option value="garantia">🔄 Garantía</option>
            <option value="cortesia">🎁 Cortesía</option>
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
              ${showFichas ? '<th>Acciones</th>' : ''}
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
  const showAcciones = !!fichasContainer;
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
    const isSinCobro = (v.tipo === 'convenio' || v.tipo === 'garantia' || v.tipo === 'cortesia');
    if (!isSinCobro) {
      totales.totalUSD += (v.total || 0);
      totales.totalBs += (v.total || 0) * tasa;
    }

    if (v.tipo === 'credito') {
      totales.credito += (v.total || 0);
    } else if (!isSinCobro && v.pagos && Array.isArray(v.pagos)) {
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
      pagosStr = '<span class="badge badge-info" style="font-size: 0.75em;">🤝 Convenio</span>';
    } else if (v.tipo === 'garantia') {
      pagosStr = '<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size: 0.75em; border:1px solid #FECACA;">🔄 Garantía</span>';
    } else if (v.tipo === 'cortesia') {
      pagosStr = '<span class="badge" style="background:#EDE9FE; color:#5B21B6; font-size: 0.75em; border:1px solid #DDD6FE;">🎁 Cortesía</span>';
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
    const isSinCobro = (v.tipo === 'convenio' || v.tipo === 'garantia' || v.tipo === 'cortesia');
    if (v.detalles && v.detalles.length > 0) {
      detallesHTML = v.detalles.map(d => {
        if (d.categoria === 'servicio') {
          const repNombre = v.repartidorNombre ? ` (${Utils.escapeHtml(v.repartidorNombre)})` : '';
          return `<div style="font-size: 0.9em; margin-bottom: 2px; font-weight: 600; color: #0284C7;">🛵 ${Utils.escapeHtml(d.nombre)}: ${Utils.formatCurrency(d.subtotal || d.precioUnitario)}${repNombre}</div>`;
        }
        const prod = tipos.find(t => t.id === d.tipoBotellonId);
        const prodName = prod ? prod.nombre : (d.nombre || 'Prod.');
        const isFree = isSinCobro || !!d.esCortesia || (d.subtotal === 0);
        const unitPrice = isFree ? '$0.00' : Utils.formatCurrency(d.precioUnitario);
        const cortesiaBadge = d.esCortesia ? '<span style="font-size:10px; color:#7C3AED; font-weight:bold;">(Cortesía)</span>' : '';
        return `<div style="font-size: 0.9em; margin-bottom: 2px;">${d.cantidad}x ${unitPrice} ${prodName} ${cortesiaBadge}</div>`;
      }).join('');
    } else if (v.delivery > 0 || (v.botellones === 0 && v.total > 0)) {
      const repNombre = v.repartidorNombre ? ` (${Utils.escapeHtml(v.repartidorNombre)})` : '';
      const tipoNombre = v.deliveryTipoNombre ? ` (${Utils.escapeHtml(v.deliveryTipoNombre)})` : '';
      detallesHTML = `<div style="font-size: 0.9em; font-weight: 600; color: #0284C7;">🛵 Servicio de Delivery${tipoNombre}: ${Utils.formatCurrency(v.delivery || v.total)}${repNombre}</div>`;
    } else {
      detallesHTML = `<div style="font-size: 0.9em;">${v.botellones || 0} botellones</div>`;
    }

    // Calcular/mostrar delivery adicional si no fue mostrado ya como servicio principal
    const tieneServicioDeliv = v.detalles && v.detalles.some(d => d.categoria === 'servicio');
    if (!tieneServicioDeliv && !(v.botellones === 0 && (v.delivery > 0 || v.total > 0))) {
      const sumaSubtotal = v.detalles ? v.detalles.reduce((acc, d) => acc + d.subtotal, 0) : v.total;
      const delivery = v.delivery !== undefined ? v.delivery : (v.total - sumaSubtotal > 0.01 ? v.total - sumaSubtotal : 0);
      
      if (delivery > 0 && !isSinCobro) {
        const repNombre = v.repartidorNombre ? ` (${Utils.escapeHtml(v.repartidorNombre)})` : '';
        const tipoNombre = v.deliveryTipoNombre ? ` (${Utils.escapeHtml(v.deliveryTipoNombre)})` : '';
        detallesHTML += `<div style="font-size: 0.85em; color: var(--color-text-secondary); margin-top: 2px;">+ Delivery${tipoNombre}: ${Utils.formatCurrency(delivery)}${repNombre}</div>`;
      }
    }

    const totalDisplayHTML = isSinCobro 
      ? '<span class="text-muted" style="font-weight:bold;">$0.00</span>' 
      : `${Utils.formatCurrency(v.total)}${v.tasa ? `<br><small style="font-size: 0.8em; color: var(--color-text-secondary);">Bs ${Utils.formatNumber(v.total * v.tasa, true)}</small>` : ''}`;

    const tipoBadgeHTML = v.tipo === 'credito' 
      ? '<span class="badge badge-warning">Crédito</span>'
      : v.tipo === 'convenio' 
        ? '<span class="badge badge-info">🤝 Convenio</span>'
        : v.tipo === 'garantia' 
          ? '<span class="badge" style="background:#FEE2E2; color:#991B1B; border:1px solid #FECACA;">🔄 Garantía</span>'
          : v.tipo === 'cortesia' 
            ? '<span class="badge" style="background:#EDE9FE; color:#5B21B6; border:1px solid #DDD6FE;">🎁 Cortesía</span>'
            : '<span class="badge badge-success">Contado</span>';

    return `
      <tr>
        <td>${Utils.formatDateTime(v.fecha)}</td>
        <td class="font-semibold">${Utils.escapeHtml(nombre)}</td>
        <td style="line-height: 1.2;">${detallesHTML}</td>
        <td class="font-semibold" style="line-height: 1.2;">${totalDisplayHTML}</td>
        <td>${tipoBadgeHTML}</td>
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
        ${showAcciones ? `
          <td>
            <button class="btn btn-sm btn-secondary btn-delete-venta" data-id="${v.id}" title="Eliminar">🗑️</button>
          </td>
        ` : ''}
      </tr>
    `;
  }).join('');

  if (showAcciones) {
    tbody.querySelectorAll('.btn-delete-venta').forEach(btn => {
      btn.addEventListener('click', () => deleteVenta(btn.dataset.id));
    });
  }

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
  const tarifasDelivery = store.getTarifasDelivery(true);
  const repartidores = store.getConfig('repartidores') || [];
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

      <!-- Estilos para el Catálogo Táctil POS y Split Layout -->
      <style>
        .pos-main-split {
          display: grid;
          grid-template-columns: 1fr 1.22fr;
          gap: 8px;
          align-items: stretch;
        }
        .pos-left-column {
          min-width: 0;
          background: #ffffff;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.03);
          display: flex;
          flex-direction: column;
          height: calc(100vh - 84px);
          min-height: 480px;
          overflow: hidden;
        }
        .pos-right-column {
          min-width: 0;
          background: #ffffff;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.03);
          display: flex;
          flex-direction: column;
          height: calc(100vh - 84px);
          min-height: 480px;
          overflow: hidden;
        }
        .pos-client-bar {
          padding: 10px 12px;
          border-bottom: 1px solid var(--color-border);
          background: #fafafa;
          flex-shrink: 0;
        }
        .pos-order-table-section {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        .pos-catalog-section {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          background: #f8fafc;
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          min-height: 220px;
        }
        .pos-checkout-section {
          flex-shrink: 0;
          background: #ffffff;
          padding: 6px 10px 8px 10px;
          box-shadow: 0 -3px 10px rgba(0,0,0,0.03);
        }
        .pos-checkout-section .form-check {
          min-height: auto;
          margin-bottom: 0;
          gap: 4px;
        }
        .pos-checkout-section .form-check input[type="checkbox"],
        .pos-checkout-section .form-check input[type="radio"] {
          width: 16px;
          height: 16px;
          margin: 0;
        }
        .pos-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
          flex-shrink: 0;
        }
        .pos-category-tabs {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .pos-cat-pill {
          border: 1.5px solid #CBD5E1;
          background: #ffffff;
          color: #334155;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          user-select: none;
          height: 36px;
          box-sizing: border-box;
        }
        .pos-cat-pill span {
          font-size: 15px;
        }
        .pos-cat-pill:hover {
          background: #F1F5F9;
          border-color: #94A3B8;
        }
        .pos-cat-pill.active {
          background: var(--color-primary-900, #1B4332);
          color: #ffffff;
          border-color: var(--color-primary-900, #1B4332);
          box-shadow: 0 2px 6px rgba(27, 67, 50, 0.22);
        }
        .pos-products-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          overflow-y: auto;
          padding: 8px 6px 4px 6px;
          flex: 1;
          align-content: start;
        }
        .pos-product-card {
          background: #ffffff;
          border: 1.5px solid #E2E8F0;
          border-radius: 10px;
          padding: 9px;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          position: relative;
          transition: transform 0.12s ease, box-shadow 0.15s ease, border-color 0.15s ease;
          user-select: none;
          min-height: 115px;
        }
        .pos-product-card:hover {
          transform: translateY(-2px);
          border-color: #2D6A4F;
          box-shadow: 0 4px 12px rgba(45, 106, 79, 0.12);
        }
        .pos-product-card.in-cart {
          border-color: #2D6A4F;
          background: #F7FEFA;
        }
        .pos-product-card.is-agotado {
          opacity: 0.52;
          cursor: not-allowed;
          background: #fdf2f2;
          border-color: #fecaca !important;
        }
        .pos-product-card.is-agotado:hover {
          transform: none !important;
          box-shadow: none !important;
          border-color: #f87171 !important;
        }
        .pos-product-card.is-agotado:active {
          transform: none !important;
        }
        .pos-product-card.is-agotado .pos-card-add-btn {
          background: #fee2e2;
          color: #dc2626;
          border-color: #fca5a5;
          cursor: not-allowed;
        }
        .pos-card-qty-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #10B981;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 800;
          border-radius: 10px;
          padding: 1px 7px;
          box-shadow: 0 2px 6px rgba(16, 185, 129, 0.45);
          z-index: 2;
          animation: pulseScale 0.2s ease;
        }
        @keyframes pulseScale {
          0% { transform: scale(0.6); }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
        .pos-card-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-bottom: 6px;
        }
        .pos-card-icon {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          background: #EBF7F0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          margin-bottom: 0;
          flex-shrink: 0;
        }
        .pos-card-icon.producto {
          background: #EFF6FF;
        }
        .pos-card-title {
          font-size: 12.5px;
          font-weight: 700;
          color: #1E293B;
          line-height: 1.3;
          margin: auto 0;
          padding: 6px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pos-tag-litros {
          background: #E0F2FE;
          color: #0369A1;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 5px;
          line-height: 1.2;
          display: inline-flex;
          align-items: center;
        }
        .pos-tag-stock {
          background: #F1F5F9;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 5px;
          line-height: 1.2;
          display: inline-flex;
          align-items: center;
        }
        .pos-tag-stock.low {
          background: #FEF3C7;
          color: #92400E;
        }
        .pos-tag-stock.empty {
          background: #FEE2E2;
          color: #991B1B;
        }
        .pos-tag-cortesia {
          background: #EDE9FE;
          color: #6D28D9;
          font-size: 9.5px;
          font-weight: 700;
          padding: 2px 5px;
          border-radius: 4px;
          line-height: 1.2;
          white-space: nowrap;
        }
        .pos-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: auto;
          padding-top: 6px;
          border-top: 1px dashed #E2E8F0;
        }
        .pos-card-price-primary {
          font-size: 13px;
          font-weight: 800;
          color: #1B4332;
          line-height: 1.1;
        }
        .pos-card-price-secondary {
          font-size: 10px;
          color: #64748B;
          font-weight: 600;
        }
        .pos-card-add-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #EBF7F0;
          color: #2D6A4F;
          border: 1px solid #B7E4C7;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          transition: all 0.15s ease;
          cursor: pointer;
          flex-shrink: 0;
        }
        .pos-product-card:hover .pos-card-add-btn {
          background: #2D6A4F;
          color: #ffffff;
          border-color: #2D6A4F;
        }
        .pos-empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 24px;
          color: var(--color-text-secondary);
          background: #ffffff;
          border-radius: 8px;
          border: 1px dashed #CBD5E1;
        }

        @media (max-width: 960px) and (min-width: 701px) {
          .pos-main-split {
            gap: 8px;
          }
          .pos-left-column, .pos-right-column {
            height: calc(100vh - 84px);
          }
          .pos-products-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 700px) {
          .pos-main-split {
            grid-template-columns: 1fr;
          }
          .pos-left-column, .pos-right-column {
            height: auto;
            min-height: 0;
          }
          .pos-products-grid {
            grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            max-height: 350px;
          }
        }
      </style>

      <div class="pos-main-split">
        <!-- COLUMNA IZQUIERDA: Clientes y Productos en Pedido (Arriba) -->
        <div class="pos-left-column">
          <!-- Barra Cliente -->
          <div class="pos-client-bar">
            <div style="display: grid; grid-template-columns: 1fr auto auto auto; gap: 6px; align-items: center;">
              <div class="search-container" style="position: relative; display: flex; align-items: center;">
                <input type="text" class="form-control" id="search-cliente-input" placeholder="🔍 Cliente: Nombre o RIF (o General)..." autocomplete="off" style="height: 36px; font-size: 12.5px; padding-right: 90px; border-radius: 6px;"/>
                <span id="cliente-balance-badge" style="position: absolute; right: 6px; font-size: 11px; pointer-events: none; z-index: 2;"></span>
                <input type="hidden" name="clienteId" id="hidden-cliente-id" value=""/>
                <div id="search-cliente-results" class="search-results"></div>
              </div>
              <button type="button" class="btn" id="btn-quick-new-cliente" style="height: 36px; white-space: nowrap; padding: 0 9px; font-size: 12px; background: var(--color-success-light); color: var(--color-success); border: 1px solid var(--color-success-light); font-weight: 700; border-radius: 6px;" title="Registrar nuevo cliente">+ Nuevo</button>
              <button type="button" class="btn btn-secondary" id="btn-quick-abono" style="height: 36px; white-space: nowrap; padding: 0 9px; font-size: 12px; font-weight: 700; border-radius: 6px;" title="Registrar abono de cliente">💵 Abono</button>
              <button type="button" class="btn btn-secondary" id="btn-quick-propina" style="height: 36px; white-space: nowrap; padding: 0 9px; font-size: 12px; font-weight: 700; border-radius: 6px; background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A;" title="Registrar propina">🎁</button>
            </div>
          </div>

          <!-- Productos en Pedido (Scrollable) -->
          <div class="pos-order-table-section">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 700; font-size: 13px; color: #1E293B;">🛒 Productos en Pedido</span>
              <button type="button" id="btn-vaciar-carrito" style="background: transparent; border: none; color: #EF4444; font-size: 11.5px; font-weight: 700; cursor: pointer; display: none; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 4px;" title="Vaciar todos los productos del pedido">
                🗑️ Vaciar
              </button>
            </div>
            
            <div class="table-container mb-sm" id="carrito-container" style="border: 1px solid var(--color-border); border-radius: 8px; background: #fff;">
              <table class="table table-sm" style="margin-bottom: 0;">
                <thead>
                  <tr style="background: #f8fafc;">
                    <th style="padding-left: 8px; font-size: 11px;">Producto</th>
                    <th style="text-align:center; width: 115px; font-size: 11px;">Cant.</th>
                    <th style="text-align:right; width: 80px; font-size: 11px;">Subtotal</th>
                    <th style="text-align:right; width: 28px; padding-right: 6px;"></th>
                  </tr>
                </thead>
                <tbody id="carrito-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- COLUMNA DERECHA: Catálogo Arriba (Máx 3 Columnas) + Delivery a Registro Abajo Fijo -->
        <div class="pos-right-column">
          <!-- Catálogo de Productos (Arriba) -->
          <div class="pos-catalog-section">
            <div class="pos-header">
              <div class="pos-category-tabs" id="pos-category-tabs">
                <button type="button" class="pos-cat-pill active" data-cat="recarga">
                  <span>💧</span> Recargas
                </button>
                <button type="button" class="pos-cat-pill" data-cat="producto">
                  <span>📦</span> Productos
                </button>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                <input type="text" id="pos-search-input" class="form-control" placeholder="🔍 Buscar..." style="height: 36px; font-size: 12.5px; width: 135px; max-width: 150px; padding: 4px 10px; border-radius: 18px; border: 1.5px solid #CBD5E1; background: #fff; box-sizing: border-box; outline: none;"/>
              </div>
            </div>

            <div class="pos-products-grid" id="pos-products-grid">
              <!-- Renderizado dinámico de fichas (3 columnas) -->
            </div>
          </div>

          <!-- De Delivery hasta Registro (Abajo Fijo) -->
          <div class="pos-checkout-section">
            <!-- Delivery en una sola fila -->
            <div style="background: #ffffff; border: 1px solid var(--color-border); border-radius: 8px; padding: 2px 8px; margin-bottom: 4px; min-height: 26px; display: flex; align-items: center;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: nowrap; width: 100%;">
                <label class="form-check" style="margin: 0; min-height: auto; cursor: pointer; white-space: nowrap; flex-shrink: 0;">
                  <input type="checkbox" id="check-delivery"/>
                  <span style="font-weight: 700; font-size: 12px;">🚚 Delivery</span>
                </label>

                <div id="container-monto-delivery" style="display: none; align-items: center; gap: 5px; flex: 1; min-width: 0;">
                  <select class="form-control" id="tipo-tarifa-delivery" style="flex: 1.2; min-width: 95px; font-size: 11px; height: 28px; padding: 2px 6px;" title="Zona">
                    ${tarifasDelivery.map((t, idx) => `
                      <option value="${t.id}" data-precio="${t.precio}" ${idx === 0 ? 'selected' : ''}>
                        ${t.id === 'local' ? '📍' : (t.id === 'afuera' ? '🚗' : '🚚')} ${Utils.escapeHtml(t.nombre)} ($${Utils.formatNumber(t.precio, true)})
                      </option>
                    `).join('')}
                  </select>
                  <div style="position: relative; width: 44px; flex-shrink: 0;">
                    <input type="number" class="form-control" id="cant-delivery" value="1" min="1" step="1" title="Viajes" style="padding-left: 14px; padding-right: 2px; font-size: 11px; height: 28px; text-align: center;"/>
                    <span style="position: absolute; left: 3px; top: 50%; transform: translateY(-50%); font-size: 9.5px; color: var(--color-text-secondary);">x</span>
                  </div>
                  <div style="position: relative; width: 62px; flex-shrink: 0;">
                    <input type="number" class="form-control" id="monto-delivery" step="0.01" min="0" placeholder="0.00" title="Precio por viaje" style="padding-left: 13px; padding-right: 2px; font-size: 11px; height: 28px; text-align: center;"/>
                    <span style="position: absolute; left: 4px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--color-text-secondary);">$</span>
                  </div>
                  <select class="form-control" id="repartidor-delivery" style="flex: 1.1; min-width: 95px; font-size: 11px; height: 28px; padding: 2px 6px;" title="Repartidor">
                    <option value="">Sin repartidor</option>
                    ${repartidores.map(r => `<option value="${r.id}">${Utils.escapeHtml(r.nombre)}</option>`).join('')}
                  </select>
                </div>

                <label class="form-check" style="margin: 0; min-height: auto; cursor: pointer; white-space: nowrap; flex-shrink: 0; margin-left: auto;">
                  <input type="checkbox" id="check-pendiente-entrega"/>
                  <span style="color: var(--color-warning-dark); font-weight: 600; font-size: 11.5px;">⏳ Pendiente</span>
                </label>
              </div>
            </div>

            <!-- Condición de Operación -->
            <div style="margin-bottom: 4px;">
              <div class="flex gap-sm" style="flex-wrap: wrap; align-items: center;">
                <label class="form-check" style="cursor: pointer; font-size: 11.5px; margin-bottom: 0;">
                  <input type="radio" name="tipo" value="contado" checked/>
                  <span>Contado</span>
                </label>
                <label class="form-check" style="cursor: pointer; font-size: 11.5px; margin-bottom: 0;">
                  <input type="radio" name="tipo" value="credito"/>
                  <span>Crédito</span>
                </label>
                <label class="form-check" style="cursor: pointer; font-size: 11.5px; margin-bottom: 0;">
                  <input type="radio" name="tipo" value="convenio"/>
                  <span>Convenio</span>
                </label>
                <label class="form-check" style="cursor: pointer; font-size: 11.5px; margin-bottom: 0;">
                  <input type="radio" name="tipo" value="garantia"/>
                  <span>Garantía</span>
                </label>
                <label class="form-check" style="cursor: pointer; font-size: 11.5px; margin-bottom: 0;">
                  <input type="radio" name="tipo" value="cortesia"/>
                  <span>Cortesía</span>
                </label>
              </div>
            </div>

            <!-- Métodos de Pago -->
            <div id="seccion-pagos">
              <div id="container-btn-saldo-favor" style="display:none; margin-bottom: 6px;"></div>
              <div id="pagos-list">
                <div class="pago-row" style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap;">
                  <label class="form-label" style="margin: 0; font-size: 11.5px; font-weight: 700; white-space: nowrap; flex-shrink: 0;">Métodos de Pago:</label>
                  <div class="form-group" style="margin-bottom: 0; flex: 1.2; min-width: 130px;">
                    <select class="form-control pago-metodo" style="height: 32px; font-size: 11.5px;">
                      ${metodosActivos.map(m => `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 80px;">
                    <input type="number" class="form-control pago-monto" step="0.01" min="0" value="0.00" placeholder="0.00" style="height: 32px; font-size: 12px;"/>
                  </div>
                  <button type="button" class="btn btn-xs btn-secondary" id="btn-add-pago-venta" style="font-size: 11px; height: 32px; padding: 0 9px; white-space: nowrap; flex-shrink: 0;" title="Añadir otro método de pago">+ Añadir</button>
                  <div class="form-group pago-ref-container" style="width: 100%; margin-top: 4px; display: none;">
                    <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia" style="height: 30px; font-size: 11px;"/>
                  </div>
                </div>
              </div>

              <!-- Calculadora de Vuelto -->
              <div id="panel-vuelto-calculadora" style="display:none; background: #ECFDF5; border: 1.5px dashed #10B981; border-radius: 6px; padding: 5px 10px; margin-top: 4px; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 14px;">💵</span>
                  <div>
                    <div style="font-size: 10px; font-weight: 700; color: #065F46; text-transform: uppercase;">Vuelto a Entregar:</div>
                    <div style="font-size: 9.5px; color: #047857;">Monto recibido supera total</div>
                  </div>
                </div>
                <div style="text-align: right;">
                  <div id="txt-vuelto-usd" style="font-size: 15px; font-weight: 800; color: #065F46; line-height: 1.1;">$0.00</div>
                  <div id="txt-vuelto-bs" style="font-size: 10.5px; font-weight: 700; color: #047857; line-height: 1.1;">Bs 0,00</div>
                </div>
              </div>

              <div class="alert-panel info mt-xs" id="pago-diff-panel" style="display:none; justify-content: space-between; padding: 4px 8px; font-size: 11px;">
                 <span>Abono Extra a cuenta:</span>
                 <strong id="pago-diff-monto">$0.00</strong>
              </div>
            </div>

            <div id="seccion-info-credito" style="display:none; padding: 8px; background: var(--color-bg-secondary); border-radius: var(--radius-md); font-size: 11.5px; color: var(--color-text-secondary); margin-bottom: 6px;">
              ℹ️ Esta venta se registrará bajo modalidad de <strong id="texto-tipo-venta">Crédito</strong> (sin cobro inmediato).
            </div>

            <!-- Total a Cobrar y Botón Registrar Venta -->
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1.5px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <div>
                <span style="font-size: 11px; font-weight: 700; color: var(--color-text-secondary); display: block; line-height: 1;">Total a Cobrar:</span>
                <div id="total-venta" style="display: flex; align-items: baseline; gap: 6px; margin-top: 2px;">
                  <span style="font-size: 22px; font-weight: 800; color: #065f46; line-height: 1;">Bs 0,00</span>
                  <span style="font-size: 13px; font-weight: 600; opacity: 0.85; color: var(--color-text-secondary); line-height: 1;">$0.00</span>
                </div>
              </div>
              <button type="button" class="btn btn-primary" id="btn-save-venta-home" style="flex: 1; max-width: 220px; height: 42px; font-size: 14.5px; font-weight: 800; border-radius: 8px; box-shadow: 0 4px 12px rgba(45,106,79,0.25);">Registrar Venta</button>
            </div>
          </div>
        </div>
      </div>
  `;

  const moduloCaudalimetro = store.getConfig('moduloCaudalimetro') || false;
  const unidadCaudalimetro = store.getConfig('unidadCaudalimetro') || 'L';
  const todayStr = Utils.todayISO();
  const lecturaHoy = store.getLecturaCaudalimetro(todayStr);

  const formHtml = `
    <div style="padding: 0 0 8px 0;">
      <form id="form-venta">
        <div class="page-header" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <h1 class="page-title" style="margin-bottom: 0;">Punto de Venta</h1>
          </div>
          
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <!-- Tasa de Cambio -->
            <div style="display: flex; align-items: center; gap: 6px; background: #ffffff; border: 1px solid var(--color-border); padding: 4px 10px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <label for="input-tasa" style="margin: 0; font-size: 11.5px; font-weight: 700; color: var(--color-text-secondary); white-space: nowrap; cursor: pointer;">Tasa (Bs/$):</label>
              <input type="text" class="form-control" id="input-tasa" value="${Utils.formatNumber(store.getConfig('tasaCambio') || 40.00, true)}" style="width: 105px; height: 32px; font-size: 13.5px; font-weight: 700; padding: 2px 6px; text-align: center; border-radius: 6px;" required/>
            </div>

            <!-- Fecha de Venta -->
            <div style="display: flex; align-items: center; gap: 6px; background: #ffffff; border: 1px solid var(--color-border); padding: 4px 10px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <label for="input-fecha" style="margin: 0; font-size: 11.5px; font-weight: 700; color: var(--color-text-secondary); white-space: nowrap; cursor: pointer;">Fecha:</label>
              <input type="date" class="form-control" name="fecha" id="input-fecha" value="${Utils.todayISO()}" style="width: 135px; height: 32px; font-size: 12.5px; font-weight: 600; padding: 2px 6px; border-radius: 6px;" required/>
            </div>

            <!-- Disponibilidad del Agua -->
            <div class="alert-panel info" style="margin: 0; padding: 4px 12px; border-radius: 8px; display: flex; align-items: center; gap: 6px; height: 42px;" title="Litros de agua disponibles en tanque">
              <span style="font-size: 14px;">💧 Disp:</span>
              <strong style="font-size: 16px; margin-left: 2px;">${Utils.formatNumber(inventario.litros)} L</strong>
            </div>

            <!-- Botón Pantalla Completa -->
            <button type="button" id="btn-toggle-fullscreen" class="btn" style="width: 42px; height: 42px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; font-weight: 700; background: #ffffff; border: 1.5px solid var(--color-primary, #2D6A4F); color: var(--color-primary, #2D6A4F); cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.03); transition: all 0.2s ease;" title="Alternar Pantalla Completa">
              <span class="fs-icon" style="display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              </span>
            </button>

            ${moduloCaudalimetro ? `
              <div id="widget-caudalimetro-pv" style="display: flex; align-items: center; gap: 8px; background: var(--color-surface, #fff); border: 1.5px solid #10B981; border-radius: 10px; padding: 4px 12px; height: 42px; box-shadow: var(--shadow-sm); cursor: pointer;" title="Haga clic para registrar o actualizar la lectura del reloj">
                <div style="font-size: 18px;">⏱️</div>
                <div>
                  <div style="font-size: 10px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.5px; line-height: 1;">
                    Reloj (${unidadCaudalimetro})
                  </div>
                  <div style="font-size: 12px; font-weight: 800; color: #0F172A; line-height: 1.2;">
                    ${lecturaHoy.inicial !== null ? `Ini: ${lecturaHoy.inicial.toLocaleString()}` : 'Ini: <span style="color:#DC2626;">Sin reg</span>'} 
                    ${lecturaHoy.final !== null ? `· Fin: ${lecturaHoy.final.toLocaleString()} (<strong>${lecturaHoy.litrosReloj.toLocaleString()} L</strong>)` : ''}
                  </div>
                </div>
                <button type="button" id="btn-abrir-modal-caudalimetro" class="btn btn-xs btn-primary" style="margin-left: 4px; padding: 3px 8px; font-size: 11px; font-weight: 700; border-radius: 6px;">
                  ${lecturaHoy.inicial === null ? 'Abrir' : (lecturaHoy.final === null ? 'Cierre' : 'Editar')}
                </button>
              </div>
            ` : ''}
          </div>
        </div>
        ${content}
      </form>
    </div>
  `;
  container.innerHTML = formHtml;
  const modal = container;

  const btnFs = modal.querySelector('#btn-toggle-fullscreen');
  if (btnFs) {
    function isFullScreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }
    function updateBtnState() {
      const fs = isFullScreen();
      const icon = btnFs.querySelector('.fs-icon');
      if (icon) {
        icon.innerHTML = fs
          ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M10 14l-7 7"/></svg>`
          : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;
      }
      btnFs.title = fs ? 'Salir de pantalla completa' : 'Ver a pantalla completa';
      if (fs) {
        btnFs.style.background = '#e8f5e9';
      } else {
        btnFs.style.background = '#ffffff';
      }
    }

    btnFs.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isFullScreen()) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(err => console.log('Exit fullscreen error:', err));
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    });

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
      document.addEventListener(evt, updateBtnState);
    });
    updateBtnState();
  }

  const widgetCaudalimetro = modal.querySelector('#widget-caudalimetro-pv');
  if (widgetCaudalimetro) {
    widgetCaudalimetro.addEventListener('click', () => {
      openModalCaudalimetro(todayStr, () => {
        renderNuevaVentaForm(container);
      });
    });
  }
  
  function parseTasaValue(valStr) {
    if (typeof valStr === 'number') return valStr;
    if (!valStr) return 0;
    let s = String(valStr).trim().replace(/\s+/g, '');
    if (s.includes('.') && s.includes(',')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  }

  function getTasaActual() {
    const el = modal.querySelector('#input-tasa');
    const val = el ? parseTasaValue(el.value) : 0;
    return val > 0 ? val : (store.getConfig('tasaCambio') || 40.00);
  }

  const inputTasa = modal.querySelector('#input-tasa');
  if (inputTasa) {
    inputTasa.addEventListener('focus', () => {
      inputTasa.select();
    });

    inputTasa.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        inputTasa.blur();
      }
    });

    inputTasa.addEventListener('input', () => {
      const val = parseTasaValue(inputTasa.value);
      if (val > 0) {
        store.setConfig('tasaCambio', val);
        if (typeof renderPosFichas === 'function') {
          renderPosFichas();
        }
        if (typeof renderCarrito === 'function') {
          renderCarrito();
        }
      }
    });

    inputTasa.addEventListener('blur', () => {
      const val = parseTasaValue(inputTasa.value);
      if (val > 0) {
        store.setConfig('tasaCambio', val);
        inputTasa.value = Utils.formatNumber(val, true);
        if (typeof renderPosFichas === 'function') {
          renderPosFichas();
        }
        if (typeof renderCarrito === 'function') {
          renderCarrito();
        }
        if (typeof actualizarInfoPagos === 'function') {
          actualizarInfoPagos();
        }
      } else {
        const fallback = store.getConfig('tasaCambio') || 40.00;
        inputTasa.value = Utils.formatNumber(fallback, true);
      }
    });
  }
  
  modal.querySelector('#btn-save-venta-home').addEventListener('click', () => {
    const overlay = modal;
    const checkDeliv = modal.querySelector('#check-delivery');
    const selectTipoTarifa = modal.querySelector('#tipo-tarifa-delivery');
    const inputDeliv = modal.querySelector('#monto-delivery');
    const cantDeliv = modal.querySelector('#cant-delivery');
    const repDeliv = modal.querySelector('#repartidor-delivery');
    let delivValue = parseFloat(inputDeliv ? inputDeliv.value : 0) || 0;
    let cantValue = parseInt(cantDeliv ? cantDeliv.value : 1) || 1;
    const isDelivActive = !!(checkDeliv && checkDeliv.checked);
    const montoDelivery = isDelivActive ? (delivValue * cantValue) : 0;
    const isSoloDelivery = (carrito.length === 0 && isDelivActive && montoDelivery > 0);

    let deliveryTipo = null;
    let deliveryTipoNombre = null;
    if (isDelivActive && selectTipoTarifa) {
      deliveryTipo = selectTipoTarifa.value;
      const opt = selectTipoTarifa.options[selectTipoTarifa.selectedIndex];
      deliveryTipoNombre = opt ? opt.textContent.replace(/^[\s📍🚗🚚]+/, '').split('($')[0].trim() : 'Local';
    }

    if (carrito.length === 0 && !isSoloDelivery) {
      showToast('Debe añadir al menos un producto o activar un servicio de Delivery', 'error');
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

      const tipo = fd.get('tipo') || 'contado';
      const isSinCobro = isTipoSinCobro(tipo);

      if (tipo === 'credito' && !clienteId) {
        showToast('Debe seleccionar o registrar un cliente para realizar una venta a Crédito', 'warning');
        return;
      }

      // 🛑 Validación de stock para productos físicos
      const allTiposStock = store.getConfig('tiposBotellon') || [];
      for (const item of carrito) {
        if (item.categoria === 'producto' && item.tipoBotellonId) {
          const prod = allTiposStock.find(p => String(p.id) === String(item.tipoBotellonId));
          if (prod && prod.stock !== undefined && prod.stock !== null) {
            const stockActual = parseInt(prod.stock) || 0;
            if (stockActual <= 0) {
              showToast(`El producto "${item.nombre}" está agotado y no puede ser procesado`, 'error');
              return;
            }
            if (item.cantidad > stockActual) {
              showToast(`Stock insuficiente para "${item.nombre}". Pedido: ${item.cantidad}, Disponible: ${stockActual}`, 'error');
              return;
            }
          }
        }
      }

      const { totalUSD, totalBs } = calcularTotalesVenta();
      let totalVenta = isSinCobro ? 0 : totalUSD;
      let totalBotellones = 0;
      let totalLitros = 0;

      carrito.forEach(item => {
        if (item.categoria !== 'producto') {
          totalBotellones += item.cantidad;
          totalLitros += item.litros;
        } else if (item.esBotellonFisico && item.aguaCortesia) {
          totalBotellones += item.cantidad;
          totalLitros += (item.litros || (item.cantidad * (item.litrosAguaPorUnidad || 20)));
        }
      });

      const pagos = [];
      let totalPagadoUSD = 0;
      let totalPagadoBs = 0;
      let saldoFavorUsado = 0;
      if (tipo === 'contado') {
        const tasaActual = getTasaActual();
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
      
      const tasaCambio = getTasaActual();
      store.setConfig('tasaCambio', tasaCambio); // memorizar

      let detallesFinales = [];
      if (isSoloDelivery) {
        const tipoLabel = deliveryTipoNombre ? ` - ${deliveryTipoNombre}` : '';
        detallesFinales = [{
          id: 'delivery_servicio',
          tipoBotellonId: 'delivery',
          nombre: `Servicio de Delivery${tipoLabel} (${cantValue} viaje${cantValue > 1 ? 's' : ''})`,
          cantidad: cantValue,
          precioUnitario: isSinCobro ? 0 : delivValue,
          subtotal: isSinCobro ? 0 : montoDelivery,
          categoria: 'servicio',
          litros: 0
        }];
      } else {
        detallesFinales = carrito.map(it => ({
          ...it,
          precioUnitario: isSinCobro ? 0 : it.precioUnitario,
          subtotal: isSinCobro ? 0 : it.subtotal
        }));
      }

      const venta = {
        id: Utils.generateId(),
        tasa: tasaCambio,
        clienteId,
        detalles: detallesFinales,
        botellones: totalBotellones,
        litrosTotales: totalLitros,
        delivery: isSinCobro ? 0 : montoDelivery,
        deliveryCant: isDelivActive && !isSinCobro ? cantValue : 0,
        deliveryTipo: isDelivActive && !isSinCobro ? deliveryTipo : null,
        deliveryTipoNombre: isDelivActive && !isSinCobro ? deliveryTipoNombre : null,
        repartidorId: isSinCobro ? null : repartidorId,
        repartidorNombre: isSinCobro ? null : repartidorNombre,
        estadoEntrega,
        fechaEntrega: isPendiente ? null : Utils.nowISO(),
        total: totalVenta,
        tipo,
        pagos: isSinCobro ? [] : pagos,
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

      if (tipo === 'convenio') {
        showToast('Convenio registrado con éxito ($0.00)', 'success');
      } else if (tipo === 'garantia') {
        showToast('Garantía por reposición registrada ($0.00)', 'success');
      } else if (tipo === 'cortesia') {
        showToast('Cortesía registrada con éxito ($0.00)', 'success');
      } else if (clienteId && totalPagadoUSD > totalVenta) {
        const excedente = totalPagadoUSD - totalVenta;
        if (excedente >= 0.01) {
          const abono = {
            id: Utils.generateId(),
            ventaId: venta.id,
            clienteId,
            monto: Math.round(excedente * 100) / 100,
            metodo: pagos[0]?.metodo || 'efectivo_usd',
            tasa: tasaCambio,
            referencia: 'Excedente de venta',
            fecha: Utils.nowISO()
          };
          store.save('abonos', abono);
          showToast(`Venta registrada y abono de ${Utils.formatCurrency(excedente)} acreditado`, 'success');
        } else {
          showToast(isSoloDelivery ? '🛵 Servicio de Delivery registrado con éxito' : 'Venta registrada con éxito', 'success');
        }
      } else {
        showToast(isSoloDelivery ? '🛵 Servicio de Delivery registrado con éxito' : 'Venta registrada con éxito', 'success');
      }

      syncToCloud();

      // Reset delivery FIRST before clearing cart
      const checkDelivery = modal.querySelector('#check-delivery');
      if (checkDelivery) {
        checkDelivery.checked = false;
        const contDeliv = modal.querySelector('#container-monto-delivery');
        if (contDeliv) contDeliv.style.display = 'none';
        const inputDeliv = modal.querySelector('#monto-delivery');
        if (inputDeliv) inputDeliv.value = '0.00';
        const cDeliv = modal.querySelector('#cant-delivery');
        if (cDeliv) cDeliv.value = '1';
        const rDeliv = modal.querySelector('#repartidor-delivery');
        if (rDeliv) rDeliv.value = '';
        const cPend = modal.querySelector('#check-pendiente-entrega');
        if (cPend) cPend.checked = false;
        const selTarifa = modal.querySelector('#tipo-tarifa-delivery');
        if (selTarifa) selTarifa.selectedIndex = 0;
      }

      // Reset form for continuous selling
      carrito.length = 0;
      renderCarrito();

      // Reset client search and badges
      modal.querySelector('#search-cliente-input').value = '';
      modal.querySelector('#search-cliente-input').dataset.id = '';
      const hId = modal.querySelector('#hidden-cliente-id');
      if (hId) hId.value = '';
      actualizarBalanceBadge();

      // Reset fichas y badges
      if (typeof actualizarBadgesFichas === 'function') {
        actualizarBadgesFichas();
      }

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

      // Refrescar historial
      if (typeof renderVentasTable === 'function') {
        renderVentasTable();
      }
    });

  const carritoContainer = modal.querySelector('#carrito-container');
  const carritoTbody = modal.querySelector('#carrito-tbody');
  const totalDisplay = modal.querySelector('#total-venta');
  const diffPanel = modal.querySelector('#pago-diff-panel');
  const diffMonto = modal.querySelector('#pago-diff-monto');
  
  function isTipoSinCobro(tipoVal) {
    return tipoVal === 'convenio' || tipoVal === 'garantia' || tipoVal === 'cortesia';
  }

  function calcularTotalesVenta() {
    const currentTipo = modal.querySelector('input[name="tipo"]:checked')?.value || 'contado';
    const tasa = getTasaActual();

    if (isTipoSinCobro(currentTipo)) {
      return { tasa, totalUSD: 0, totalBs: 0 };
    }

    let totalUSD = 0;
    let totalBs = 0;

    carrito.forEach(item => {
      if (item.esCortesia || item.precioUnitario === 0) return;
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

    // Sumar delivery si no es sin cobro
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
    const checkDelivery = modal.querySelector('#check-delivery');
    const inputDeliv = modal.querySelector('#monto-delivery');
    const cantDeliv = modal.querySelector('#cant-delivery');
    const isDelivChecked = !!(checkDelivery && checkDelivery.checked);
    let delivMontoTotal = 0;
    if (isDelivChecked && inputDeliv) {
      const dVal = parseFloat(inputDeliv.value) || 0;
      const cVal = parseInt(cantDeliv ? cantDeliv.value : 1) || 1;
      delivMontoTotal = dVal * cVal;
    }

    const btnVaciar = modal.querySelector('#btn-vaciar-carrito');
    if (btnVaciar) {
      btnVaciar.style.display = (carrito.length > 0) ? 'inline-flex' : 'none';
      if (!btnVaciar._hasListener) {
        btnVaciar._hasListener = true;
        btnVaciar.addEventListener('click', () => {
          if (carrito.length === 0) return;
          openModal({
            title: 'Vaciar Pedido',
            content: `
              <div style="text-align: center; padding: 10px 0;">
                <div style="font-size: 36px; margin-bottom: 8px;">🗑️</div>
                <p style="font-size: 14.5px; font-weight: 700; color: #1E293B; margin-bottom: 6px;">¿Desea vaciar todos los productos del pedido?</p>
                <p style="font-size: 12px; color: var(--color-text-secondary); margin: 0;">Se quitarán los productos agregados a la lista actual.</p>
              </div>
            `,
            saveLabel: 'Sí, vaciar',
            onSave: () => {
              carrito.length = 0;
              closeModal();
              renderCarrito();
              actualizarBadgesFichas();
            }
          });
        });
      }
    }

    if (carrito.length === 0) {
      if (isDelivChecked && delivMontoTotal > 0) {
        const { totalUSD, totalBs } = calcularTotalesVenta();
        const selTarifaEl = modal.querySelector('#tipo-tarifa-delivery');
        let selTarifaNombre = 'Local';
        if (selTarifaEl && selTarifaEl.selectedIndex >= 0) {
          const opt = selTarifaEl.options[selTarifaEl.selectedIndex];
          selTarifaNombre = opt ? opt.textContent.replace(/^[\s📍🚗🚚]+/, '').split('($')[0].trim() : 'Local';
        }
        carritoContainer.style.display = 'block';
        carritoTbody.innerHTML = `
          <tr style="background: rgba(2, 132, 199, 0.05); border-bottom: 1.5px dashed #BAE6FD;">
            <td style="padding: 6px 6px 6px 8px; vertical-align: middle;">
              <div style="font-weight: 700; color: #0284C7; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                <span>🛵</span> Delivery (${Utils.escapeHtml(selTarifaNombre)})
              </div>
              <div style="color: var(--color-text-secondary); font-size: 10.5px;">${cantDeliv ? cantDeliv.value : 1} viaje(s) a ${Utils.formatCurrency(parseFloat(inputDeliv.value) || 0)}</div>
            </td>
            <td style="text-align: center; width: 115px; font-weight: 700; color: #0369A1; font-size: 12px; vertical-align: middle;">${cantDeliv ? cantDeliv.value : 1}</td>
            <td style="text-align: right; width: 75px; font-weight: 800; color: #0284C7; font-size: 12px; vertical-align: middle;">${Utils.formatCurrency(totalUSD)}</td>
            <td style="text-align: right; width: 28px; padding-right: 6px; vertical-align: middle;">
              <button type="button" id="btn-cancel-deliv-solo" style="background:transparent; color:#ef4444; border:none; font-size:16px; font-weight:bold; cursor:pointer; padding:0; line-height:1;" title="Quitar Delivery">✕</button>
            </td>
          </tr>
        `;
        const btnCancelDeliv = carritoTbody.querySelector('#btn-cancel-deliv-solo');
        if (btnCancelDeliv) {
          btnCancelDeliv.addEventListener('click', () => {
            checkDelivery.checked = false;
            modal.querySelector('#container-monto-delivery').style.display = 'none';
            inputDeliv.value = '0.00';
            renderCarrito();
          });
        }
        totalDisplay.innerHTML = `
          <span style="font-size: 26px; font-weight: 800; line-height: 1.1; color: #065f46;">Bs ${Utils.formatNumber(totalBs, true)}</span>
          <span style="font-size: 13.5px; font-weight: 600; opacity: 0.85; color: var(--color-text-secondary); line-height: 1.1;">${Utils.formatCurrency(totalUSD)}</span>
        `;
        actualizarPagosAutom(totalUSD, totalBs);
        if (typeof actualizarBotonSaldoFavor === 'function') {
          actualizarBotonSaldoFavor();
        }
        return;
      }

      carritoContainer.style.display = 'block';
      carritoTbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 26px 10px; color: var(--color-text-secondary);">
            <div style="font-size: 24px; margin-bottom: 4px; opacity: 0.5;">🛒</div>
            <div style="font-size: 12px; font-weight: 600; color: #475569;">El pedido está vacío</div>
            <div style="font-size: 11px; opacity: 0.75;">Toque los productos a la izquierda para agregarlos</div>
          </td>
        </tr>
      `;
      totalDisplay.innerHTML = `
        <span style="font-size: 26px; font-weight: 800; line-height: 1.1; color: #065f46;">Bs 0,00</span>
        <span style="font-size: 13.5px; font-weight: 600; opacity: 0.85; color: var(--color-text-secondary); line-height: 1.1;">$0.00</span>
      `;
      actualizarPagosAutom(0, 0);
      actualizarInfoPagos();
      return;
    }
    
    carritoContainer.style.display = 'block';
    
    carritoTbody.innerHTML = carrito.map((item, index) => {
      const isItemBs = item.monedaOriginal === 'VES' || item.monedaOriginal === 'Bs';
      const isBotellonFisico = !!item.esBotellonFisico;
      const isFree = item.esCortesia || item.precioUnitario === 0;
      const precioUnitarioDisplay = isFree 
        ? '<span class="text-muted" style="font-weight:600;">$0.00</span>'
        : (isItemBs 
            ? `Bs ${Utils.formatNumber(item.precioBase, true)}`
            : Utils.formatCurrency(item.precioUnitario));
      const subtotalDisplay = isFree
        ? '<span class="badge" style="background:#EDE9FE; color:#6D28D9; font-weight:700;">$0.00</span>'
        : (isItemBs
            ? `Bs ${Utils.formatNumber(item.cantidad * item.precioBase, true)} <small style="color:var(--color-text-secondary); display:block; font-size:10px;">(~${Utils.formatCurrency(item.subtotal)})</small>`
            : Utils.formatCurrency(item.subtotal));

      const cortesiaActiva = store.getConfig('cortesiaBotellonNuevo') === true;
      let badgeInfoHTML = '';
      if (isBotellonFisico && (cortesiaActiva || item.aguaCortesia)) {
        if (item.aguaCortesia) {
          badgeInfoHTML = `
            <div style="margin-top: 3px; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;">
              <span class="badge" style="background:#EDE9FE; color:#6D28D9; border: 1px solid #DDD6FE; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px;">
                🎁 Agua Gratis (${item.litrosAguaPorUnidad || 20}L)
              </span>
              <button type="button" class="btn-toggle-cortesia" data-index="${index}" 
                style="background: #ffffff; border: 1px solid #CBD5E1; color: #475569; border-radius: 4px; font-size: 10px; font-weight: 600; padding: 0 5px; cursor: pointer;" 
                title="Haga clic para desmarcar el agua y vender solo el envase">
                ✕ Quitar
              </button>
            </div>
          `;
        } else if (cortesiaActiva) {
          badgeInfoHTML = `
            <div style="margin-top: 3px; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;">
              <span class="badge" style="background:#F1F5F9; color:#64748B; border: 1px solid #CBD5E1; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px;">
                ⚠️ Solo envase
              </span>
              <button type="button" class="btn-toggle-cortesia" data-index="${index}" 
                style="background: #EDE9FE; border: 1px solid #C4B5FD; color: #6D28D9; border-radius: 4px; font-size: 10px; font-weight: 700; padding: 0 5px; cursor: pointer;" 
                title="Haga clic para marcar e incluir agua de cortesía gratis">
                🎁 +Agua
              </button>
            </div>
          `;
        }
      } else if (item.esCortesia) {
        badgeInfoHTML = '<div style="margin-top: 2px;"><span class="badge" style="background:#EDE9FE; color:#6D28D9; font-size: 10px; padding: 1px 5px; border-radius: 4px;">🎁 Cortesía</span></div>';
      }

      return `
        <tr>
          <td style="padding: 6px 6px 6px 8px; vertical-align: middle;">
            <div style="font-weight: 600; font-size: 12px; line-height: 1.25; color: #1e293b;">
              ${Utils.escapeHtml(item.nombre)}
            </div>
            <div style="font-size: 10.5px; color: var(--color-text-secondary); margin-top: 2px;">
              ${precioUnitarioDisplay} c/u ${isItemBs && !item.esCortesia ? '<span style="color:#2563EB;">(Fijo en Bs)</span>' : ''}
            </div>
            ${badgeInfoHTML}
          </td>
          <td style="text-align:center; width: 115px; vertical-align: middle; padding: 4px 2px;">
            <div style="display:inline-flex; align-items:center; gap:3px; justify-content:center;">
              <button type="button" class="btn-qty-minus" data-index="${index}" style="width:24px; height:26px; border-radius:4px; border:1px solid #CBD5E1; background:#fff; cursor:pointer; font-weight:bold; font-size:13px; line-height:1; display:flex; align-items:center; justify-content:center; color:#334155; padding:0;" title="Restar 1">-</button>
              <input type="number" class="input-qty-direct" data-index="${index}" value="${item.cantidad}" min="1" step="1" style="width: 52px; height: 26px; text-align: center; font-weight: 700; font-size: 13px; border: 1px solid #CBD5E1; border-radius: 4px; padding: 0 4px; color: #1e293b; outline: none; -moz-appearance: textfield;" />
              <button type="button" class="btn-qty-plus" data-index="${index}" style="width:24px; height:26px; border-radius:4px; border:1px solid #CBD5E1; background:#fff; cursor:pointer; font-weight:bold; font-size:13px; line-height:1; display:flex; align-items:center; justify-content:center; color:#334155; padding:0;" title="Sumar 1">+</button>
            </div>
          </td>
          <td style="text-align:right; width: 75px; vertical-align: middle; font-weight:bold; font-size: 12px; padding: 4px 4px;">
            ${subtotalDisplay}
          </td>
          <td style="text-align:right; width: 28px; padding-right: 6px; vertical-align: middle; white-space:nowrap;">
            <button type="button" class="btn-remove-cart" data-index="${index}" style="background:transparent; color:#ef4444; border:none; font-size:16px; font-weight:bold; cursor:pointer; padding:0; line-height:1; display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:4px;" title="Eliminar">✕</button>
          </td>
        </tr>
      `;
    }).join('');
    
    const { totalUSD, totalBs } = calcularTotalesVenta();
    totalDisplay.innerHTML = `
      <span style="font-size: 26px; font-weight: 800; line-height: 1.1; color: #065f46;">Bs ${Utils.formatNumber(totalBs, true)}</span>
      <span style="font-size: 13.5px; font-weight: 600; opacity: 0.85; color: var(--color-text-secondary); line-height: 1.1;">${Utils.formatCurrency(totalUSD)}</span>
    `;
    
    carritoTbody.querySelectorAll('.btn-remove-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index);
        carrito.splice(idx, 1);
        renderCarrito();
        actualizarBadgesFichas();
      });
    });

    carritoTbody.querySelectorAll('.btn-qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        modificarCantidadCarrito(idx, -1);
      });
    });

    carritoTbody.querySelectorAll('.btn-qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        modificarCantidadCarrito(idx, 1);
      });
    });

    carritoTbody.querySelectorAll('.input-qty-direct').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.index);
        fijarCantidadCarrito(idx, input.value);
      });
      input.addEventListener('focus', () => {
        input.select();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        }
      });
    });

    carritoTbody.querySelectorAll('.btn-toggle-cortesia').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        const it = carrito[idx];
        if (it && it.esBotellonFisico) {
          it.aguaCortesia = !it.aguaCortesia;
          it.litros = it.aguaCortesia ? (it.cantidad * (it.litrosAguaPorUnidad || 20)) : 0;
          renderCarrito();
        }
      });
    });
    
    actualizarPagosAutom(totalUSD, totalBs);
    if (typeof actualizarBotonSaldoFavor === 'function') {
      actualizarBotonSaldoFavor();
    }
    actualizarBadgesFichas();
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

  function extraerLitrosDeNombre(nombre) {
    const match = (nombre || '').match(/(\d+)\s*(?:l|lt|lts|litro|litros)?/i);
    return match ? parseFloat(match[1]) : 20;
  }

  function modificarCantidadCarrito(idx, delta) {
    if (!carrito[idx]) return;
    const item = carrito[idx];
    if (delta > 0 && item.categoria === 'producto' && item.tipoBotellonId) {
      const allTipos = store.getConfig('tiposBotellon') || [];
      const t = allTipos.find(p => String(p.id) === String(item.tipoBotellonId));
      if (t && t.stock !== undefined && t.stock !== null) {
        const stockDisp = parseInt(t.stock) || 0;
        if ((item.cantidad || 0) + delta > stockDisp) {
          showToast(`Stock máximo alcanzado para "${item.nombre}": ${stockDisp} unidad(es)`, 'warning');
          return;
        }
      }
    }
    const nuevo = (item.cantidad || 0) + delta;
    if (nuevo <= 0) {
      carrito.splice(idx, 1);
    } else {
      item.cantidad = nuevo;
      item.subtotal = item.cantidad * item.precioUnitario;
      if (item.esBotellonFisico) {
        item.litros = item.aguaCortesia ? (item.cantidad * (item.litrosAguaPorUnidad || 20)) : 0;
      } else {
        item.litros = item.cantidad * (item.litrosAguaPorUnidad || 20);
      }
    }
    renderCarrito();
    actualizarBadgesFichas();
  }

  function fijarCantidadCarrito(idx, cantidadExacta) {
    if (!carrito[idx]) return;
    const item = carrito[idx];
    let cant = parseInt(cantidadExacta);
    if (isNaN(cant) || cant <= 0) {
      carrito.splice(idx, 1);
    } else {
      if (item.categoria === 'producto' && item.tipoBotellonId) {
        const allTipos = store.getConfig('tiposBotellon') || [];
        const t = allTipos.find(p => String(p.id) === String(item.tipoBotellonId));
        if (t && t.stock !== undefined && t.stock !== null) {
          const stockDisp = parseInt(t.stock) || 0;
          if (stockDisp <= 0) {
            showToast(`El producto "${item.nombre}" está agotado`, 'warning');
            carrito.splice(idx, 1);
            renderCarrito();
            actualizarBadgesFichas();
            return;
          }
          if (cant > stockDisp) {
            showToast(`Cantidad supera el stock disponible (${stockDisp}). Se ajustó al máximo.`, 'warning');
            cant = stockDisp;
          }
        }
      }
      item.cantidad = cant;
      item.subtotal = cant * item.precioUnitario;
      if (item.esBotellonFisico) {
        item.litros = item.aguaCortesia ? (cant * (item.litrosAguaPorUnidad || 20)) : 0;
      } else {
        item.litros = cant * (item.litrosAguaPorUnidad || 20);
      }
    }
    renderCarrito();
    actualizarBadgesFichas();
  }

  function actualizarBadgesFichas() {
    const cards = modal.querySelectorAll('.pos-product-card');
    if (!cards.length) return;

    const qtyMap = {};
    carrito.forEach(item => {
      qtyMap[item.tipoBotellonId] = (qtyMap[item.tipoBotellonId] || 0) + item.cantidad;
    });

    cards.forEach(card => {
      const id = card.dataset.id;
      const qty = qtyMap[id] || 0;
      let badge = card.querySelector('.pos-card-qty-badge');
      if (qty > 0) {
        card.classList.add('in-cart');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'pos-card-qty-badge';
          card.appendChild(badge);
        }
        badge.textContent = qty;
      } else {
        card.classList.remove('in-cart');
        if (badge) badge.remove();
      }
    });
  }

  function agregarItemPorFicha(tipoId, cantidad = 1) {
    const tiposBotellon = store.getConfig('tiposBotellon') || [];
    const t = tiposBotellon.find(item => String(item.id) === String(tipoId));
    if (!t) return;

    const cortesiaActiva = store.getConfig('cortesiaBotellonNuevo') === true;
    const tipoBotellonId = t.id;
    const rawNombre = t.nombre || '';
    const categoria = t.categoria === 'producto' ? 'producto' : 'relleno';

    // 🛑 Verificación de stock para productos físicos
    if (categoria === 'producto' && t.stock !== undefined && t.stock !== null) {
      const stockDisp = parseInt(t.stock) || 0;
      if (stockDisp <= 0) {
        showToast(`El producto "${rawNombre}" está agotado`, 'warning');
        return;
      }
      const existente = carrito.find(item => String(item.tipoBotellonId) === String(tipoBotellonId));
      const cantActual = existente ? (existente.cantidad || 0) : 0;
      if (cantActual + cantidad > stockDisp) {
        showToast(`Stock insuficiente para "${rawNombre}". Disponible: ${stockDisp} (en pedido: ${cantActual})`, 'warning');
        return;
      }
    }
    const esBotellonFisico = (categoria === 'producto') && /(?:botell[oó]n|botellones)/i.test(rawNombre);
    const tieneCortesia = cortesiaActiva && esBotellonFisico;
    const litrosCapacidad = esBotellonFisico 
      ? extraerLitrosDeNombre(rawNombre) 
      : (parseFloat(t.litros) || 20);

    const isBsProducto = (t.moneda === 'VES' || t.moneda === 'Bs');
    const monedaOriginal = isBsProducto ? 'VES' : 'USD';
    const precioBase = parseFloat(t.precio) || 0;
    const tasa = getTasaActual();

    const precioUnitario = isBsProducto ? (tasa > 0 ? (precioBase / tasa) : 0) : precioBase;

    const existenteIdx = carrito.findIndex(item => 
      String(item.tipoBotellonId) === String(tipoBotellonId) && 
      item.monedaOriginal === monedaOriginal
    );

    if (existenteIdx !== -1) {
      carrito[existenteIdx].cantidad += cantidad;
      carrito[existenteIdx].subtotal = carrito[existenteIdx].cantidad * carrito[existenteIdx].precioUnitario;
      if (carrito[existenteIdx].esBotellonFisico) {
        carrito[existenteIdx].litros = carrito[existenteIdx].aguaCortesia ? (carrito[existenteIdx].cantidad * litrosCapacidad) : 0;
      } else {
        carrito[existenteIdx].litros += (cantidad * litrosCapacidad);
      }
    } else {
      carrito.push({
        tipoBotellonId,
        categoria,
        nombre: rawNombre,
        cantidad,
        esBotellonFisico,
        aguaCortesia: tieneCortesia,
        litrosAguaPorUnidad: litrosCapacidad,
        monedaOriginal,
        precioBase,
        precioUnitario,
        subtotal: cantidad * precioUnitario,
        litros: tieneCortesia ? (litrosCapacidad * cantidad) : (esBotellonFisico ? 0 : cantidad * litrosCapacidad)
      });
    }

    renderCarrito();
    actualizarBadgesFichas();
  }

  let currentCategoriaFiltro = 'recarga';
  let currentSearchQuery = '';

  function renderPosFichas() {
    const grid = modal.querySelector('#pos-products-grid');
    if (!grid) return;

    const tiposBotellon = store.getConfig('tiposBotellon') || [];
    const tasa = getTasaActual();
    const cortesiaActiva = store.getConfig('cortesiaBotellonNuevo') === true;

    let filtered = tiposBotellon;
    if (currentCategoriaFiltro === 'recarga') {
      filtered = filtered.filter(t => t.categoria !== 'producto');
    } else if (currentCategoriaFiltro === 'producto') {
      filtered = filtered.filter(t => t.categoria === 'producto');
    }

    if (currentSearchQuery.trim()) {
      const q = currentSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(t => (t.nombre || '').toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="pos-empty-state">
          <div style="font-size: 28px; margin-bottom: 6px;">🔍</div>
          <div style="font-weight: 600; font-size: 14px;">No se encontraron productos</div>
          <div style="font-size: 12px; margin-top: 4px; color: var(--color-text-secondary);">Prueba seleccionando otra categoría o cambiando la búsqueda</div>
        </div>
      `;
      return;
    }

    const qtyMap = {};
    carrito.forEach(item => {
      qtyMap[item.tipoBotellonId] = (qtyMap[item.tipoBotellonId] || 0) + item.cantidad;
    });

    grid.innerHTML = filtered.map(t => {
      const isProducto = t.categoria === 'producto';
      const isBs = t.moneda === 'VES' || t.moneda === 'Bs';
      const precioBase = parseFloat(t.precio) || 0;
      const rawNombre = t.nombre || '';
      const esBotellonFisico = isProducto && /(?:botell[oó]n|botellones)/i.test(rawNombre);
      const tieneCortesia = cortesiaActiva && esBotellonFisico;
      const litros = esBotellonFisico ? extraerLitrosDeNombre(rawNombre) : (parseFloat(t.litros) || 20);
      const qtyInCart = qtyMap[t.id] || 0;
      const stock = isProducto && t.stock !== undefined && t.stock !== null ? parseInt(t.stock) : null;
      const isAgotado = isProducto && stock !== null && stock <= 0;

      let precioPrimario = '';
      let precioSecundario = '';
      if (isBs) {
        const precioUSD = tasa > 0 ? (precioBase / tasa) : 0;
        precioPrimario = `Bs ${Utils.formatNumber(precioBase, true)}`;
        precioSecundario = `$ ${Utils.formatNumber(precioUSD, true)}`;
      } else {
        const precioBs = precioBase * tasa;
        precioPrimario = `$ ${Utils.formatNumber(precioBase, true)}`;
        precioSecundario = `Bs ${Utils.formatNumber(precioBs, true)}`;
      }

      return `
        <div class="pos-product-card ${qtyInCart > 0 ? 'in-cart' : ''} ${isAgotado ? 'is-agotado' : ''}" data-id="${t.id}" title="${Utils.escapeHtml(rawNombre)}${isAgotado ? ' (Agotado)' : ''}">
          ${qtyInCart > 0 ? `<span class="pos-card-qty-badge">${qtyInCart}</span>` : ''}
          <div class="pos-card-top-row">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <div class="pos-card-icon ${isProducto ? 'producto' : 'recarga'}">
                ${isProducto ? '📦' : '💧'}
              </div>
              ${!isProducto ? `<span class="pos-tag-litros">${litros}L</span>` : ''}
              ${esBotellonFisico ? `<span class="pos-tag-litros">${litros}L</span>` : ''}
              ${isProducto && stock !== null ? `
                <span class="pos-tag-stock ${stock === 0 ? 'empty' : (stock <= 5 ? 'low' : '')}">
                  ${stock === 0 ? 'Agotado' : `Stock: ${stock}`}
                </span>
              ` : ''}
            </div>
            ${tieneCortesia ? `<span class="pos-tag-cortesia" title="Incluye primera recarga de agua gratis">🎁 Agua Gratis</span>` : ''}
          </div>
          <div class="pos-card-title" title="${Utils.escapeHtml(rawNombre)}">${Utils.escapeHtml(rawNombre)}</div>
          <div class="pos-card-footer">
            <div>
              <div class="pos-card-price-primary">${precioPrimario}</div>
              <div class="pos-card-price-secondary">${precioSecundario}</div>
            </div>
            <div class="pos-card-add-btn" title="${isAgotado ? 'Producto agotado' : 'Agregar al pedido'}">${isAgotado ? '🚫' : '+'}</div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.pos-product-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (card.classList.contains('is-agotado')) {
          const tiposBotellon = store.getConfig('tiposBotellon') || [];
          const t = tiposBotellon.find(item => String(item.id) === String(id));
          showToast(`El producto "${t?.nombre || 'seleccionado'}" está agotado y no tiene stock disponible`, 'warning');
          return;
        }
        agregarItemPorFicha(id, 1);
      });
    });
  }

  // Configuración de pestañas de categoría y buscador
  const catPills = modal.querySelectorAll('.pos-cat-pill');
  catPills.forEach(pill => {
    pill.addEventListener('click', () => {
      catPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategoriaFiltro = pill.dataset.cat || 'recarga';
      renderPosFichas();
    });
  });

  const searchFichasInput = modal.querySelector('#pos-search-input');
  if (searchFichasInput) {
    searchFichasInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value || '';
      renderPosFichas();
    });
  }

  // Render inicial de fichas POS
  renderPosFichas();

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
            row1.style.display = 'flex';
            row1.style.alignItems = 'center';
            row1.style.gap = '6px';
            row1.style.marginBottom = '4px';
            row1.style.flexWrap = 'wrap';
            row1.innerHTML = `
              <label class="form-label" style="margin: 0; font-size: 11.5px; font-weight: 700; white-space: nowrap; flex-shrink: 0;">Métodos de Pago:</label>
              <div class="form-group" style="margin-bottom: 0; flex: 1.2; min-width: 130px;">
                <select class="form-control pago-metodo" style="height: 32px; font-size: 11.5px;">
                  ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'saldo_favor' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 80px;">
                <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${saldoFavor.toFixed(2)}" placeholder="0.00" style="height: 32px; font-size: 12px;"/>
              </div>
              <div style="width: 32px; flex-shrink: 0;"></div>
              <div class="form-group pago-ref-container" style="width: 100%; margin-top: 4px; display: none;">
                <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia" style="height: 30px; font-size: 11px;"/>
              </div>
            `;
            pagosList.appendChild(row1);

            // Fila 2: Resto a pagar (default punto en Bs)
            const row2 = document.createElement('div');
            row2.className = 'pago-row';
            row2.style.display = 'flex';
            row2.style.alignItems = 'center';
            row2.style.gap = '6px';
            row2.style.marginBottom = '4px';
            row2.style.flexWrap = 'wrap';
            row2.innerHTML = `
              <div style="width: 110px; flex-shrink: 0; font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-align: right; padding-right: 2px;">+ Resto:</div>
              <div class="form-group" style="margin-bottom: 0; flex: 1.2; min-width: 130px;">
                <select class="form-control pago-metodo" style="height: 32px; font-size: 11.5px;">
                  ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 80px;">
                <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${diffBs.toFixed(2)}" placeholder="0.00" style="height: 32px; font-size: 12px;"/>
              </div>
              <button type="button" class="btn btn-danger btn-remove-pago" style="height: 32px; width: 32px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0;">✕</button>
              <div class="form-group pago-ref-container" style="width: 100%; margin-top: 4px; display: none;">
                <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia" style="height: 30px; font-size: 11px;"/>
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
            row1.style.display = 'flex';
            row1.style.alignItems = 'center';
            row1.style.gap = '6px';
            row1.style.marginBottom = '4px';
            row1.style.flexWrap = 'wrap';
            row1.innerHTML = `
              <label class="form-label" style="margin: 0; font-size: 11.5px; font-weight: 700; white-space: nowrap; flex-shrink: 0;">Métodos de Pago:</label>
              <div class="form-group" style="margin-bottom: 0; flex: 1.2; min-width: 130px;">
                <select class="form-control pago-metodo" style="height: 32px; font-size: 11.5px;">
                  ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'saldo_favor' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 80px;">
                <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${totalUSD.toFixed(2)}" placeholder="0.00" style="height: 32px; font-size: 12px;"/>
              </div>
              <div style="width: 32px; flex-shrink: 0;"></div>
              <div class="form-group pago-ref-container" style="width: 100%; margin-top: 4px; display: none;">
                <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia" style="height: 30px; font-size: 11px;"/>
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

    // Calculadora de Vuelto / Cambio dinámico ($ y Bs)
    const panelVuelto = modal.querySelector('#panel-vuelto-calculadora');
    const txtVueltoUSD = modal.querySelector('#txt-vuelto-usd');
    const txtVueltoBs = modal.querySelector('#txt-vuelto-bs');
    const hayExceso = (totalUSD > 0) && (totalPagosDolares > (totalUSD + 0.009) || totalPagosBs > (totalBs + 0.1));

    if (hayExceso) {
      const vueltoUSD = Math.max(0, totalPagosDolares - totalUSD);
      const vueltoBs = tasa > 0 ? vueltoUSD * tasa : Math.max(0, totalPagosBs - totalBs);
      if (panelVuelto) panelVuelto.style.display = 'flex';
      if (txtVueltoUSD) txtVueltoUSD.textContent = Utils.formatCurrency(vueltoUSD);
      if (txtVueltoBs) txtVueltoBs.textContent = `Bs ${Utils.formatNumber(vueltoBs, true)}`;
    } else {
      if (panelVuelto) panelVuelto.style.display = 'none';
    }

    const clienteId = hiddenId.value;
    if (clienteId && hayExceso) {
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
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.marginBottom = '4px';
    row.style.flexWrap = 'wrap';
    row.innerHTML = `
      <div style="width: 110px; flex-shrink: 0; font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-align: right; padding-right: 2px;">+ Pago:</div>
      <div class="form-group" style="margin-bottom: 0; flex: 1.2; min-width: 130px;">
        <select class="form-control pago-metodo" style="height: 32px; font-size: 11.5px;">
          ${metodosDisponibles.map(m => `<option value="${m.id}" ${m.id === 'punto' ? 'selected' : ''}>${formatMetodoOption(m)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 80px;">
        <input type="number" class="form-control pago-monto" step="0.01" min="0" value="${defaultVal}" placeholder="0.00" style="height: 32px; font-size: 12px;"/>
      </div>
      <button type="button" class="btn btn-danger btn-remove-pago" style="height: 32px; width: 32px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0;" title="Quitar pago">✕</button>
      
      <div class="form-group pago-ref-container" style="width: 100%; margin-top: 4px; display: none;">
        <input type="text" class="form-control pago-referencia" placeholder="Nº de Referencia" style="height: 30px; font-size: 11px;"/>
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

  const radiosTipo = modal.querySelectorAll('input[name="tipo"]');
  const seccionPagos = modal.querySelector('#seccion-pagos');
  const seccionInfoCredito = modal.querySelector('#seccion-info-credito');

  function actualizarInfoCredito() {
    if (!seccionInfoCredito) return;
    const currentTipo = modal.querySelector('input[name="tipo"]:checked')?.value || 'contado';
    if (currentTipo !== 'credito' && !isTipoSinCobro(currentTipo)) {
      seccionInfoCredito.style.display = 'none';
      return;
    }
    seccionInfoCredito.style.display = 'block';

    if (isTipoSinCobro(currentTipo)) {
      let icon = '🤝';
      let title = 'Convenio Institucional / Especial';
      if (currentTipo === 'garantia') {
        icon = '🔄';
        title = 'Garantía / Reposición (Agua Sucia / Reclamo de Calidad)';
      } else if (currentTipo === 'cortesia') {
        icon = '🎁';
        title = 'Cortesía / Obsequio / Promoción';
      }
      seccionInfoCredito.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; line-height: 1.4;">
          <span style="font-size: 24px;">${icon}</span>
          <div>
            <strong style="color: var(--color-primary-900);">${title} ($0.00)</strong><br/>
            <span style="font-size: 12px; color: var(--color-text-secondary);">Esta operación no genera cobro en caja ($0.00). Los litros de agua y envases se descontarán automáticamente del inventario.</span>
          </div>
        </div>
      `;
      seccionInfoCredito.style.background = 'var(--color-bg-secondary)';
      seccionInfoCredito.style.border = '1.5px solid var(--color-border)';
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
      const isSinCobro = isTipoSinCobro(r.value);
      const isCredito = (r.value === 'credito');
      if (seccionPagos) seccionPagos.style.display = (isSinCobro || isCredito) ? 'none' : 'block';
      actualizarInfoCredito();
      renderCarrito();
    });
  });
  
  const checkDelivery = modal.querySelector('#check-delivery');
  const containerDelivery = modal.querySelector('#container-monto-delivery');
  const selectTipoTarifa = modal.querySelector('#tipo-tarifa-delivery');
  const inputDelivery = modal.querySelector('#monto-delivery');
  const cantDelivery = modal.querySelector('#cant-delivery');
  
  if (checkDelivery && containerDelivery && inputDelivery) {
    const updatePrecioFromTarifa = () => {
      if (selectTipoTarifa && selectTipoTarifa.selectedIndex >= 0) {
        const opt = selectTipoTarifa.options[selectTipoTarifa.selectedIndex];
        const pVal = opt ? parseFloat(opt.dataset.precio) : 0.50;
        inputDelivery.value = (!isNaN(pVal) ? pVal : 0.50).toFixed(2);
      } else {
        inputDelivery.value = (store.getConfig('precioDelivery') ?? 0.50).toFixed(2);
      }
    };

    checkDelivery.addEventListener('change', (e) => {
      containerDelivery.style.display = e.target.checked ? 'flex' : 'none';
      if (e.target.checked) {
        updatePrecioFromTarifa();
        if (cantDelivery) cantDelivery.value = '1';
      } else {
        inputDelivery.value = '0.00';
        if (cantDelivery) cantDelivery.value = '1';
      }
      renderCarrito();
    });

    if (selectTipoTarifa) {
      selectTipoTarifa.addEventListener('change', () => {
        updatePrecioFromTarifa();
        renderCarrito();
      });
    }
    
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

        // Eliminar abonos/excedentes asociados a esta venta
        const abonosAsociados = (store.getAll('abonos') || []).filter(a => {
          if (a.ventaId === id) return true;
          // Respaldo para ventas previas: coincidencia por cliente, fecha similar (+- 2 min) y 'Excedente de venta'
          if (venta.clienteId && a.clienteId === venta.clienteId && a.referencia === 'Excedente de venta') {
            const diffMs = Math.abs(new Date(a.fecha) - new Date(venta.fecha));
            if (diffMs < 120000) return true;
          }
          return false;
        });
        abonosAsociados.forEach(a => {
          store.delete('abonos', a.id);
        });
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
          <label class="form-label" id="lbl-propina-referencia" style="font-weight: 700;">Nº de Referencia *</label>
          <input type="text" class="form-control" name="referencia" id="propina-referencia" placeholder="Ej: 4589" style="font-weight: 600;"/>
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

      const requiereRef = ['punto', 'pago_movil', 'transferencia'].includes(metodo);
      if (requiereRef && !referencia) {
        showToast('El número de referencia es requerido para este método de pago', 'warning');
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

  // Listener para la conversión en vivo y requerimiento dinámico de referencia
  setTimeout(() => {
    const inputMonto = document.getElementById('propina-monto');
    const selectMoneda = document.getElementById('propina-moneda');
    const txtConversion = document.getElementById('propina-conversion-txt');
    const selectMetodo = document.getElementById('propina-metodo');
    const inputRef = document.getElementById('propina-referencia');
    const lblRef = document.getElementById('lbl-propina-referencia');

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

    function updateMetodoState() {
      if (!selectMetodo || !inputRef || !lblRef) return;
      const met = selectMetodo.value;
      const requiereRef = ['punto', 'pago_movil', 'transferencia'].includes(met);

      if (requiereRef) {
        lblRef.innerHTML = 'Nº de Referencia *';
        inputRef.required = true;
        inputRef.placeholder = 'Ej: 4589';
      } else {
        lblRef.innerHTML = 'Nº de Referencia <span style="font-weight: normal; font-size: 11.5px; color: var(--color-text-secondary);">(Opcional)</span>';
        inputRef.required = false;
        inputRef.placeholder = 'No requerido en efectivo';
      }

      // Auto-selección de moneda conveniente si se selecciona efectivo
      if (met === 'efectivo_usd' && selectMoneda) {
        selectMoneda.value = 'USD';
        updateConversion();
      } else if (met === 'efectivo_bs' && selectMoneda) {
        selectMoneda.value = 'Bs';
        updateConversion();
      }
    }

    if (inputMonto) inputMonto.addEventListener('input', updateConversion);
    if (selectMoneda) selectMoneda.addEventListener('change', updateConversion);
    if (selectMetodo) selectMetodo.addEventListener('change', updateMetodoState);

    // Ejecutar al inicio para reflejar el estado del método inicial
    updateMetodoState();
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
