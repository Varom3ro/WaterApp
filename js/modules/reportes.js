// ============================================
// Tu Empresa - Reportes Module
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';

export function renderReportes(container) {
  const today = Utils.todayISO();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Reportes</h1>
        <p class="page-subtitle">Análisis de ventas, cisternas, rendimiento, cartera y deliveries</p>
      </div>
    </div>

    <!-- Tabs y Controles en la misma fila -->
    <div class="flex gap-md mb-lg" style="justify-content: space-between; align-items: center; flex-wrap: wrap;">
      <div class="flex gap-md" style="flex-wrap: wrap;">
        <button class="btn btn-primary tab-btn active" data-tab="ventas_cisternas">📅 Ventas y Cisternas</button>
        <button class="btn btn-secondary tab-btn" data-tab="deliveries">🛵 Deliveries</button>
        <button class="btn btn-secondary tab-btn" data-tab="cartera">💰 Estado de Cartera</button>
        <button class="btn btn-secondary tab-btn" data-tab="rendimiento">📊 Rendimiento del Agua</button>
      </div>
      
      <div id="reportes-controles" class="flex items-center gap-md" style="flex-wrap: wrap;">
        <div class="flex items-center gap-sm">
          <label class="form-label" style="margin:0; font-size:13px; color:var(--color-text-secondary);">Período:</label>
          <select class="form-control" id="filtro-periodo" style="min-width:160px; height:36px; padding:4px 28px 4px 10px; font-size:13px;">
            <option value="diario">Hoy (Diario)</option>
            <option value="semanal" selected>Semanal (7 días)</option>
            <option value="quincenal">Quincenal (15 días)</option>
            <option value="mensual">Mensual (30 días)</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>

        <div id="container-fechas-custom" class="flex items-center gap-sm" style="display: none;">
          <input type="date" class="form-control" id="filtro-desde" style="max-width:130px; height:36px; padding:4px 6px; font-size:12px;"/>
          <span style="font-size:12px; color:var(--color-text-secondary);">a</span>
          <input type="date" class="form-control" id="filtro-hasta" style="max-width:130px; height:36px; padding:4px 6px; font-size:12px;" value="${today}"/>
        </div>

        <button id="btn-generar-pdf" class="btn btn-primary" style="height:36px; padding:0 12px; font-size:13px;">📄 Guardar PDF</button>
        <button id="btn-generar-csv" class="btn btn-secondary" style="height:36px; padding:0 12px; font-size:13px; color:#1B4332; border-color:#1B4332; font-weight:600;">📊 Exportar CSV</button>
      </div>
    </div>

    <div id="tab-content">
    </div>
  `;

  const tabBtns = container.querySelectorAll('.tab-btn');
  const filtroPeriodo = container.querySelector('#filtro-periodo');
  const containerCustom = container.querySelector('#container-fechas-custom');
  const filtroDesde = container.querySelector('#filtro-desde');
  const filtroHasta = container.querySelector('#filtro-hasta');
  const pdfBtn = container.querySelector('#btn-generar-pdf');
  const csvBtn = container.querySelector('#btn-generar-csv');

  function getRange() {
    return getPeriodoRange(filtroPeriodo.value, filtroDesde.value, filtroHasta.value);
  }

  function refreshActiveTab() {
    const activeTab = container.querySelector('.tab-btn.active').dataset.tab;
    renderTab(activeTab, getRange());
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active', 'btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.add('active', 'btn-primary');
      btn.classList.remove('btn-secondary');
      
      refreshActiveTab();
    });
  });

  filtroPeriodo.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      containerCustom.style.display = 'flex';
      if (!filtroDesde.value) filtroDesde.value = today;
    } else {
      containerCustom.style.display = 'none';
    }
    refreshActiveTab();
  });

  filtroDesde.addEventListener('change', refreshActiveTab);
  filtroHasta.addEventListener('change', refreshActiveTab);

  // Generar PDF Consolidado Completo
  pdfBtn.addEventListener('click', () => {
    const range = getRange();
    const periodoLabel = filtroPeriodo.options[filtroPeriodo.selectedIndex].text;
    const htmlPDF = getConsolidatedReportHTML(range, periodoLabel);

    const opt = {
      margin:       0.3,
      filename:     `Reporte_Consolidado_${filtroPeriodo.value}_${range.inicio.toISOString().split('T')[0]}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css'] }
    };
    
    if (window.html2pdf) {
        window.html2pdf().set(opt).from(htmlPDF).save();
    } else {
        alert("La librería PDF no está lista o cargada.");
    }
  });

  // Generar CSV Consolidado Completo
  if (csvBtn) {
    csvBtn.addEventListener('click', () => {
      const range = getRange();
      const periodoLabel = filtroPeriodo.options[filtroPeriodo.selectedIndex].text;
      exportConsolidatedCSV(range, periodoLabel);
    });
  }

  // Render inicial
  renderTab('ventas_cisternas', getRange());
}

function getPeriodoRange(periodo, desdeVal, hastaVal) {
  const now = new Date();
  let fin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let inicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (periodo === 'semanal') {
    inicio.setDate(inicio.getDate() - 6);
  } else if (periodo === 'quincenal') {
    inicio.setDate(inicio.getDate() - 14);
  } else if (periodo === 'mensual') {
    inicio = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  } else if (periodo === 'custom') {
    if (desdeVal) inicio = new Date(desdeVal + 'T00:00:00');
    if (hastaVal) fin = new Date(hastaVal + 'T23:59:59');
  }
  return { inicio, fin };
}

function renderTab(tab, range) {
  const content = document.getElementById('tab-content');
  if (!content) return;

  switch (tab) {
    case 'ventas_cisternas':
      renderVentasYCisternas(content, range);
      break;
    case 'deliveries':
      renderDeliveriesReport(content, range);
      break;
    case 'cartera':
      renderCartera(content);
      break;
    case 'rendimiento':
      renderRendimiento(content, range);
      break;
  }
}

function renderVentasYCisternas(content, range) {
  const ventas = store.getAll('ventas') || [];
  const cisternas = store.getAll('cisternas') || [];
  const tipos = store.getConfig('tiposBotellon') || [];

  const ventasFiltradas = ventas.filter(v => {
    const f = new Date(v.fecha);
    return f >= range.inicio && f <= range.fin;
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const cisternasFiltradas = cisternas.filter(c => {
    const f = new Date(c.fecha);
    return f >= range.inicio && f <= range.fin;
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // Consolidado por producto
  const productoResumen = {};
  let totalDeliveriesCant = 0;
  let totalDeliveriesMonto = 0;

  ventasFiltradas.forEach(v => {
    if (v.detalles && Array.isArray(v.detalles)) {
      v.detalles.forEach(d => {
        const prod = tipos.find(t => t.id === d.tipoBotellonId);
        const prodName = d.nombre || (prod ? prod.nombre : 'Producto');
        if (!productoResumen[prodName]) {
          productoResumen[prodName] = { cantidad: 0, monto: 0 };
        }
        productoResumen[prodName].cantidad += (d.cantidad || 1);
        productoResumen[prodName].monto += (d.subtotal || 0);
      });
    } else if (v.botellones) {
      const prodName = 'Botellón (General)';
      if (!productoResumen[prodName]) productoResumen[prodName] = { cantidad: 0, monto: 0 };
      productoResumen[prodName].cantidad += v.botellones;
      productoResumen[prodName].monto += v.total;
    }

    if (v.delivery > 0) {
      totalDeliveriesCant += (v.deliveryCant || 1);
      totalDeliveriesMonto += v.delivery;
    }
  });

  const listProdResumen = Object.entries(productoResumen);

  const totalVentasMonto = ventasFiltradas.reduce((s, v) => s + v.total, 0);
  const totalLitrosCisternas = cisternasFiltradas.reduce((s, c) => s + c.capacidad, 0);

  content.innerHTML = `
    <div class="metrics-grid mb-lg" style="grid-template-columns: repeat(3, 1fr);">
      <div class="metric-card">
        <div class="metric-label">Ventas Recaudadas ($)</div>
        <div class="metric-value text-success">${Utils.formatCurrency(totalVentasMonto)}</div>
        <div class="metric-change">En el período seleccionado</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Transacciones / Facturas</div>
        <div class="metric-value">${ventasFiltradas.length}</div>
        <div class="metric-change">Ventas procesadas</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Agua Comprada</div>
        <div class="metric-value text-info">${Utils.formatNumber(totalLitrosCisternas)} L</div>
        <div class="metric-change">${cisternasFiltradas.length} cisternas ingresadas</div>
      </div>
    </div>

    <!-- Resumen Consolidado por Producto -->
    ${listProdResumen.length > 0 ? `
      <div class="card mb-lg">
        <div class="card-header">
          <h3 class="card-title">📦 Totales Vendidos por Producto</h3>
        </div>
        <div class="table-container mt-md">
          <table class="table">
            <thead>
              <tr>
                <th>Producto / Servicio</th>
                <th style="text-align:center;">Unidades / Cantidad</th>
                <th style="text-align:right;">Monto Total ($)</th>
              </tr>
            </thead>
            <tbody>
              ${listProdResumen.map(([nombre, info]) => `
                <tr>
                  <td class="font-semibold">${Utils.escapeHtml(nombre)}</td>
                  <td style="text-align:center;"><span class="badge badge-info">${info.cantidad} unid.</span></td>
                  <td style="text-align:right;" class="font-semibold text-success">${Utils.formatCurrency(info.monto)}</td>
                </tr>
              `).join('')}
              ${totalDeliveriesMonto > 0 ? `
                <tr>
                  <td class="font-semibold">🛵 Servicios de Delivery</td>
                  <td style="text-align:center;"><span class="badge badge-info">${totalDeliveriesCant} viaje(s)</span></td>
                  <td style="text-align:right;" class="font-semibold text-success">${Utils.formatCurrency(totalDeliveriesMonto)}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- Tabla Detallada de Operaciones de Venta -->
    <div class="card mb-lg">
      <div class="card-header">
        <h3 class="card-title">📋 Detalle de Operaciones de Venta</h3>
      </div>
      <div class="table-container mt-md">
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
            </tr>
          </thead>
          <tbody>
            ${ventasFiltradas.length === 0 ? `
              <tr><td colspan="7" class="text-center text-muted" style="padding:20px;">No hay ventas registradas en el período seleccionado.</td></tr>
            ` : ventasFiltradas.map(v => {
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
                  return `<div style="font-size: 0.8em; white-space: nowrap; line-height: 1.2;">${icon} ${name}: <b>${Utils.formatCurrency(p.monto)}</b></div>`;
                }).join('');
              }

              let detallesHTML = '';
              if (v.detalles && v.detalles.length > 0) {
                detallesHTML = v.detalles.map(d => {
                  const prod = tipos.find(t => t.id === d.tipoBotellonId);
                  const prodName = d.nombre || (prod ? prod.nombre : 'Prod.');
                  return `<div style="font-size: 0.9em; margin-bottom: 2px;">${d.cantidad}x ${Utils.formatCurrency(d.precioUnitario)} ${prodName}</div>`;
                }).join('');
              } else {
                detallesHTML = `<div style="font-size: 0.9em;">${v.botellones || 0} botellones</div>`;
              }

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
                    <span class="badge ${(v.estadoEntrega === 'pendiente') ? 'badge-warning' : 'badge-success'}" style="font-size: 0.75em;">
                      ${(v.estadoEntrega === 'pendiente') ? '⏳ Pendiente' : '✅ Entregado'}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tabla Historial Cisternas -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">🚚 Historial de Recargas de Cisternas</h3>
      </div>
      <div class="table-container mt-md">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha y Hora</th>
              <th style="text-align:center;">Litros Ingresados</th>
              <th>Nota / Observación</th>
            </tr>
          </thead>
          <tbody>
            ${cisternasFiltradas.length === 0 ? `
              <tr><td colspan="3" class="text-center text-muted" style="padding:20px;">No se registraron entradas de cisternas en el período seleccionado.</td></tr>
            ` : cisternasFiltradas.map(c => `
              <tr>
                <td class="font-semibold">${Utils.formatDateTime(c.fecha)}</td>
                <td style="text-align:center;"><span class="badge badge-success font-semibold" style="font-size: 13px;">${Utils.formatNumber(c.capacidad)} L</span></td>
                <td class="text-muted">${Utils.escapeHtml(c.nota || 'Sin observaciones')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDeliveriesReport(content, range) {
  const ventas = store.getAll('ventas') || [];
  const repartidores = store.getConfig('repartidores') || [];
  
  const ventasFiltradas = range ? ventas.filter(v => {
    const f = new Date(v.fecha);
    return f >= range.inicio && f <= range.fin;
  }) : ventas;

  const stats = {};
  
  repartidores.forEach(r => {
    stats[r.id] = { nombre: r.nombre, viajes: 0, montoTotal: 0 };
  });
  
  stats['sin_asignar'] = { nombre: 'Sin Asignar / General', viajes: 0, montoTotal: 0 };

  ventasFiltradas.forEach(v => {
    const deliveryMonto = v.delivery || 0;
    if (deliveryMonto > 0) {
      const cant = v.deliveryCant || 1;
      const repId = v.repartidorId || 'sin_asignar';
      
      if (!stats[repId]) {
        stats[repId] = { nombre: v.repartidorNombre || 'Desconocido', viajes: 0, montoTotal: 0 };
      }
      
      stats[repId].viajes += cant;
      stats[repId].montoTotal += deliveryMonto;
    }
  });

  const listStats = Object.values(stats).filter(s => s.viajes > 0 || repartidores.some(r => r.nombre === s.nombre));

  let totalViajesGlobal = 0;
  let totalMontoGlobal = 0;

  listStats.forEach(s => {
    totalViajesGlobal += s.viajes;
    totalMontoGlobal += s.montoTotal;
  });

  content.innerHTML = `
    <div class="metrics-grid mb-lg" style="grid-template-columns: repeat(2, 1fr);">
      <div class="metric-card">
        <div class="metric-label">Total Entregas / Viajes</div>
        <div class="metric-value">${totalViajesGlobal}</div>
        <div class="metric-change">Viajes completados</div>
      </div>
      <div class="metric-card accent">
        <div class="metric-label">Total Recaudado por Envíos</div>
        <div class="metric-value">${Utils.formatCurrency(totalMontoGlobal)}</div>
        <div class="metric-change">En el período seleccionado</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">📋 Rendimiento por Repartidor</h3>
      </div>
      <div class="table-container mt-md">
        <table class="table">
          <thead>
            <tr>
              <th>Repartidor</th>
              <th style="text-align:center;">Viajes / Entregas</th>
              <th style="text-align:right;">Monto Recaudado ($)</th>
            </tr>
          </thead>
          <tbody>
            ${listStats.length === 0 ? `
              <tr><td colspan="3" class="text-center text-muted" style="padding:20px;">No se registran deliveries en el período seleccionado.</td></tr>
            ` : listStats.map(s => `
              <tr>
                <td class="font-semibold">${Utils.escapeHtml(s.nombre)}</td>
                <td style="text-align:center;"><span class="badge badge-info">${s.viajes} viaje(s)</span></td>
                <td style="text-align:right;" class="font-semibold text-success">${Utils.formatCurrency(s.montoTotal)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRendimiento(content, range) {
  const cisternasAll = store.getAll('cisternas') || [];
  const ventasAll = store.getAll('ventas') || [];
  const mermasAll = store.getAll('mermas') || [];

  const cisternas = range ? cisternasAll.filter(c => {
    const f = new Date(c.fecha);
    return f >= range.inicio && f <= range.fin;
  }) : cisternasAll;

  const ventas = range ? ventasAll.filter(v => {
    const f = new Date(v.fecha);
    return f >= range.inicio && f <= range.fin;
  }) : ventasAll;

  const mermas = range ? mermasAll.filter(m => {
    const f = new Date(m.fecha);
    return f >= range.inicio && f <= range.fin;
  }) : mermasAll;

  const totalComprado = cisternas.reduce((sum, c) => sum + c.capacidad, 0);
  const totalVendido = ventas.reduce((sum, v) => sum + (v.botellones * 20), 0);
  const totalMerma = mermas.reduce((sum, m) => sum + m.litros, 0);
  const eficiencia = totalComprado > 0 ? Math.round((totalVendido / totalComprado) * 100) : 0;

  content.innerHTML = `
    <div class="metrics-grid mb-lg" style="grid-template-columns:repeat(4,1fr)">
      <div class="metric-card">
        <div class="metric-label">Total Comprado</div>
        <div class="metric-value" style="font-size:var(--font-size-xl)">${Utils.formatNumber(totalComprado)}</div>
        <div class="metric-change">Litros</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Vendido</div>
        <div class="metric-value" style="font-size:var(--font-size-xl)">${Utils.formatNumber(totalVendido)}</div>
        <div class="metric-change">Litros</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Merma Total</div>
        <div class="metric-value" style="font-size:var(--font-size-xl)">${Utils.formatNumber(totalMerma)}</div>
        <div class="metric-change">Litros (lavado)</div>
      </div>
      <div class="metric-card accent">
        <div class="metric-label">Eficiencia</div>
        <div class="metric-value" style="font-size:var(--font-size-xl)">${eficiencia}%</div>
        <div class="metric-change">Vendido / Comprado</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Comprado vs Vendido (Últimos 7 días)</h3>
      </div>
      <div class="chart-container" style="height:280px">
        <canvas id="chart-rendimiento"></canvas>
      </div>
    </div>
  `;

  drawRendimientoChart();
}

function drawRendimientoChart() {
  const canvas = document.getElementById('chart-rendimiento');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;

  // Last 7 days data
  const days = [];
  const comprado = [];
  const vendido = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);

    days.push(Utils.weekDays[d.getDay() === 0 ? 6 : d.getDay() - 1]);

    const dayCisternas = store.getAll('cisternas').filter(c => {
      const cd = new Date(c.fecha);
      return cd >= d && cd < next;
    });
    comprado.push(dayCisternas.reduce((s, c) => s + c.capacidad, 0));

    const dayVentas = store.getAll('ventas').filter(v => {
      const vd = new Date(v.fecha);
      return vd >= d && vd < next;
    });
    vendido.push(dayVentas.reduce((s, v) => s + v.botellones * 20, 0));
  }

  const maxVal = Math.max(...comprado, ...vendido, 100);
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();

    const val = Math.round(maxVal * (1 - i / 4));
    ctx.fillStyle = '#A0AEC0';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Utils.formatNumber(val), padding - 8, y + 3);
  }

  const step = chartWidth / (days.length - 1);
  days.forEach((day, i) => {
    const x = padding + i * step;
    ctx.fillStyle = '#A0AEC0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(day, x, height - 10);
  });

  function drawLine(data, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    data.forEach((val, i) => {
      const x = padding + i * step;
      const y = padding + chartHeight - (val / maxVal) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();

    data.forEach((val, i) => {
      const x = padding + i * step;
      const y = padding + chartHeight - (val / maxVal) * chartHeight;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawLine(comprado, '#3B82F6');
  drawLine(vendido, '#10B981');
}

function renderCartera(content) {
  const clientes = store.getAll('clientes');
  const deudores = clientes.filter(c => c.deuda > 0);
  const totalDeuda = deudores.reduce((sum, c) => sum + c.deuda, 0);

  content.innerHTML = `
    <div class="metrics-grid mb-lg" style="grid-template-columns:repeat(2,1fr)">
      <div class="metric-card">
        <div class="metric-label">Total de Clientes</div>
        <div class="metric-value">${clientes.length}</div>
        <div class="metric-change">${deudores.length} con saldo pendiente</div>
      </div>
      <div class="metric-card accent">
        <div class="metric-label">Total Cuentas por Cobrar</div>
        <div class="metric-value text-danger">${Utils.formatCurrency(totalDeuda)}</div>
        <div class="metric-change">En mora / crédito</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Cuentas por Cobrar Pendientes</h3>
      </div>
      ${deudores.length > 0 ? `
        <div class="table-container mt-md">
          <table class="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Ubicación</th>
                <th>Deuda</th>
                <th>Días</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              ${deudores.map(c => {
                const estatus = store.calcularEstatusCliente(c.id);
                const statusInfo = Utils.clientStatus[estatus];
                const ubicacion = c.tipoUbicacion === 'externo'
                  ? [c.municipio, c.urbanizacion, c.calle, c.edificio].filter(Boolean).join(', ')
                  : [c.sector, c.nivel, c.local, c.nombreLocal].filter(Boolean).join(' / ');
                return `
                  <tr>
                    <td class="font-semibold">${Utils.escapeHtml(c.nombre)}</td>
                    <td class="text-muted">${Utils.escapeHtml(ubicacion || '-')}</td>
                    <td class="font-bold text-danger">${Utils.formatCurrency(c.deuda)}</td>
                    <td>${c.dias || 0} días</td>
                    <td><span class="badge ${statusInfo.class}">${statusInfo.label}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state"><span class="empty-state-icon">🎉</span><span class="empty-state-text">¡No hay deudores! Todos los clientes están al día.</span></div>'}
    </div>
  `;
}

function getConsolidatedReportHTML(range, periodoLabel) {
  const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
  const empresaLogo = store.getConfig('empresaLogo') || './img/logo.png';
  const fechaTexto = `${Utils.formatDate(range.inicio)} al ${Utils.formatDate(range.fin)}`;
  const currentTasa = store.getConfig('tasaCambio') || 40.00;

  const ventasAll = store.getAll('ventas') || [];
  const cisternasAll = store.getAll('cisternas') || [];
  const clientes = store.getAll('clientes') || [];
  const repartidores = store.getConfig('repartidores') || [];
  const tipos = store.getConfig('tiposBotellon') || [];
  const mermasAll = store.getAll('mermas') || [];

  const ventas = ventasAll.filter(v => {
    const f = new Date(v.fecha);
    return f >= range.inicio && f <= range.fin;
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const cisternas = cisternasAll.filter(c => {
    const f = new Date(c.fecha);
    return f >= range.inicio && f <= range.fin;
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const mermas = mermasAll.filter(m => {
    const f = new Date(m.fecha);
    return f >= range.inicio && f <= range.fin;
  });

  // Métricas de ventas y productos
  const productoResumen = {};
  let totalLitrosVendidos = 0;
  let totalVentasMonto = 0;
  let totalVentasBs = 0;
  let totalDeliveriesCant = 0;
  let totalDeliveriesMonto = 0;

  ventas.forEach(v => {
    totalVentasMonto += v.total;
    const tasa = v.tasa || currentTasa;
    totalVentasBs += v.total * tasa;

    if (v.detalles && Array.isArray(v.detalles)) {
      v.detalles.forEach(d => {
        const prod = tipos.find(t => t.id === d.tipoBotellonId);
        const prodName = d.nombre || (prod ? prod.nombre : 'Producto');
        const cap = d.capacidad || (prod ? prod.capacidad : 20);
        if (!productoResumen[prodName]) {
          productoResumen[prodName] = { cantidad: 0, monto: 0, litros: 0 };
        }
        productoResumen[prodName].cantidad += (d.cantidad || 1);
        productoResumen[prodName].monto += (d.subtotal || 0);
        productoResumen[prodName].litros += (d.cantidad || 1) * cap;
        totalLitrosVendidos += (d.cantidad || 1) * cap;
      });
    } else if (v.botellones) {
      const prodName = 'Botellón (20L)';
      if (!productoResumen[prodName]) productoResumen[prodName] = { cantidad: 0, monto: 0, litros: 0 };
      productoResumen[prodName].cantidad += v.botellones;
      productoResumen[prodName].monto += v.total;
      productoResumen[prodName].litros += v.botellones * 20;
      totalLitrosVendidos += v.botellones * 20;
    }

    if (v.delivery > 0) {
      totalDeliveriesCant += (v.deliveryCant || 1);
      totalDeliveriesMonto += v.delivery;
    }
  });

  // Stats deliveries
  const deliveryStats = {};
  repartidores.forEach(r => { deliveryStats[r.id] = { nombre: r.nombre, viajes: 0, monto: 0 }; });
  deliveryStats['sin_asignar'] = { nombre: 'Sin Asignar / General', viajes: 0, monto: 0 };

  ventas.forEach(v => {
    if (v.delivery > 0) {
      const repId = v.repartidorId || 'sin_asignar';
      if (!deliveryStats[repId]) deliveryStats[repId] = { nombre: v.repartidorNombre || 'Desconocido', viajes: 0, monto: 0 };
      deliveryStats[repId].viajes += (v.deliveryCant || 1);
      deliveryStats[repId].monto += v.delivery;
    }
  });
  const listDeliveryStats = Object.values(deliveryStats).filter(s => s.viajes > 0);

  // Stats cartera
  const deudores = clientes.filter(c => c.deuda > 0);
  const totalDeuda = deudores.reduce((sum, c) => sum + c.deuda, 0);

  // Stats agua
  const totalCompradoAgua = cisternas.reduce((sum, c) => sum + c.capacidad, 0);
  const totalMerma = mermas.reduce((sum, m) => sum + m.litros, 0);
  const eficiencia = totalCompradoAgua > 0 ? Math.round((totalLitrosVendidos / totalCompradoAgua) * 100) : 0;

  const listProdResumen = Object.entries(productoResumen);

  return `
    <div style="font-family: Arial, sans-serif; color: #111; padding: 25px; line-height: 1.4; font-size: 12px; max-width: 900px; margin: 0 auto; background: #fff;">
      <!-- Encabezado Institucional -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1B4332; padding-bottom: 12px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 15px;">
          <img src="${empresaLogo}" alt="Logo" style="max-height: 60px; max-width: 140px; object-fit: contain;" onerror="this.style.display='none'"/>
          <div>
            <h1 style="margin: 0; color: #1B4332; font-size: 22px; font-weight: bold; text-transform: uppercase;">${Utils.escapeHtml(empresaNombre)}</h1>
            <div style="font-size: 13px; color: #4B5563; font-weight: bold; margin-top: 2px;">REPORTE EJECUTIVO INTEGRAL CONSOLIDADO</div>
          </div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #4B5563;">
          <div><strong>Período:</strong> ${periodoLabel}</div>
          <div><strong>Rango:</strong> ${fechaTexto}</div>
          <div><strong>Emisión:</strong> ${Utils.formatDateTime(Utils.nowISO())}</div>
        </div>
      </div>

      <!-- Resumen General en Cuadrícula -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 25px;">
        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 10px; border-radius: 6px;">
          <div style="font-size: 10px; color: #166534; font-weight: bold; text-transform: uppercase;">Ventas Totales ($)</div>
          <div style="font-size: 18px; font-weight: bold; color: #15803D; margin-top: 4px;">${Utils.formatCurrency(totalVentasMonto)}</div>
          <div style="font-size: 10px; color: #166534;">Bs ${Utils.formatNumber(totalVentasBs, true)}</div>
        </div>
        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 10px; border-radius: 6px;">
          <div style="font-size: 10px; color: #1E40AF; font-weight: bold; text-transform: uppercase;">Litros Vendidos</div>
          <div style="font-size: 18px; font-weight: bold; color: #1D4ED8; margin-top: 4px;">${Utils.formatNumber(totalLitrosVendidos)} L</div>
          <div style="font-size: 10px; color: #1E40AF;">${ventas.length} transacciones</div>
        </div>
        <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 10px; border-radius: 6px;">
          <div style="font-size: 10px; color: #92400E; font-weight: bold; text-transform: uppercase;">Total Deliveries</div>
          <div style="font-size: 18px; font-weight: bold; color: #B45309; margin-top: 4px;">${Utils.formatCurrency(totalDeliveriesMonto)}</div>
          <div style="font-size: 10px; color: #92400E;">${totalDeliveriesCant} envíos realizados</div>
        </div>
        <div style="background: #FEF2F2; border: 1px solid #FECACA; padding: 10px; border-radius: 6px;">
          <div style="font-size: 10px; color: #991B1B; font-weight: bold; text-transform: uppercase;">Cuentas por Cobrar</div>
          <div style="font-size: 18px; font-weight: bold; color: #B91C1C; margin-top: 4px;">${Utils.formatCurrency(totalDeuda)}</div>
          <div style="font-size: 10px; color: #991B1B;">${deudores.length} clientes con saldo</div>
        </div>
      </div>

      <!-- SECCIÓN 1: RESUMEN DE PRODUCTOS VENDIDOS -->
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #1B4332; border-bottom: 1.5px solid #1B4332; padding-bottom: 4px;">
          1. 📦 RESUMEN DE VENTAS POR PRODUCTO
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #F3F4F6; border-bottom: 1px solid #D1D5DB;">
              <th style="text-align: left; padding: 6px 8px;">Producto / Servicio</th>
              <th style="text-align: center; padding: 6px 8px;">Unidades Vendidas</th>
              <th style="text-align: right; padding: 6px 8px;">Litros Totales</th>
              <th style="text-align: right; padding: 6px 8px;">Monto Total ($)</th>
            </tr>
          </thead>
          <tbody>
            ${listProdResumen.length === 0 ? `
              <tr><td colspan="4" style="text-align:center; padding:10px; color:#6B7280;">No hay ventas registradas en este período.</td></tr>
            ` : listProdResumen.map(([nombre, info]) => `
              <tr style="border-bottom: 1px solid #E5E7EB;">
                <td style="padding: 6px 8px; font-weight: bold;">${Utils.escapeHtml(nombre)}</td>
                <td style="text-align: center; padding: 6px 8px;">${info.cantidad} unid.</td>
                <td style="text-align: right; padding: 6px 8px;">${Utils.formatNumber(info.litros)} L</td>
                <td style="text-align: right; padding: 6px 8px; font-weight: bold; color: #15803D;">${Utils.formatCurrency(info.monto)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 2: DETALLE DE VENTAS DEL PERÍODO -->
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #1B4332; border-bottom: 1.5px solid #1B4332; padding-bottom: 4px;">
          2. 📋 HISTÓRICO DETALLADO DE VENTAS (${ventas.length} Transacciones)
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
          <thead>
            <tr style="background: #F3F4F6; border-bottom: 1px solid #D1D5DB;">
              <th style="text-align: left; padding: 5px 6px;">Fecha/Hora</th>
              <th style="text-align: left; padding: 5px 6px;">Cliente</th>
              <th style="text-align: left; padding: 5px 6px;">Productos / Detalles</th>
              <th style="text-align: right; padding: 5px 6px;">Total ($)</th>
              <th style="text-align: center; padding: 5px 6px;">Método</th>
              <th style="text-align: center; padding: 5px 6px;">Entrega</th>
            </tr>
          </thead>
          <tbody>
            ${ventas.length === 0 ? `
              <tr><td colspan="6" style="text-align:center; padding:10px; color:#6B7280;">Sin ventas en el rango seleccionado.</td></tr>
            ` : ventas.map(v => {
              const cli = clientes.find(c => c.id === v.clienteId);
              const cliNombre = cli ? cli.nombre : (v.clienteNombre || 'Cliente General');
              let prodsStr = '';
              if (v.detalles && Array.isArray(v.detalles)) {
                prodsStr = v.detalles.map(d => `${d.cantidad}x ${d.nombre || 'Prod'}`).join(', ');
              } else {
                prodsStr = `${v.botellones}x Botellón`;
              }
              if (v.delivery > 0) prodsStr += ` + Deliv ($${Utils.formatNumber(v.delivery, true)})`;
              const metodoStr = v.tipo === 'credito' ? 'Crédito' : (v.pagos && v.pagos.length > 1 ? 'Mixto' : (v.pagos && v.pagos[0] ? v.pagos[0].metodo : 'Contado'));
              const entregaStr = v.estadoEntrega === 'pendiente' ? '⏳ Pendiente' : '✅ Entregado';
              return `
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 4px 6px; color: #4B5563;">${new Date(v.fecha).toLocaleDateString('es-VE')} ${new Date(v.fecha).toLocaleTimeString('es-VE', {hour:'2-digit', minute:'2-digit', hour12:true})}</td>
                  <td style="padding: 4px 6px; font-weight: bold;">${Utils.escapeHtml(cliNombre)}</td>
                  <td style="padding: 4px 6px;">${Utils.escapeHtml(prodsStr)}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: bold; color: #15803D;">${Utils.formatCurrency(v.total)}</td>
                  <td style="padding: 4px 6px; text-align: center; text-transform: capitalize;">${metodoStr}</td>
                  <td style="padding: 4px 6px; text-align: center;">${entregaStr}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 3: CONTROL DE DELIVERIES -->
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #1B4332; border-bottom: 1.5px solid #1B4332; padding-bottom: 4px;">
          3. 🛵 CONTROL DE DELIVERIES Y REPARTIDORES
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #F3F4F6; border-bottom: 1px solid #D1D5DB;">
              <th style="text-align: left; padding: 6px 8px;">Repartidor</th>
              <th style="text-align: center; padding: 6px 8px;">Viajes / Entregas Realizadas</th>
              <th style="text-align: right; padding: 6px 8px;">Monto Total Envíos ($)</th>
            </tr>
          </thead>
          <tbody>
            ${listDeliveryStats.length === 0 ? `
              <tr><td colspan="3" style="text-align:center; padding:10px; color:#6B7280;">No se registraron deliveries en este período.</td></tr>
            ` : listDeliveryStats.map(s => `
              <tr style="border-bottom: 1px solid #E5E7EB;">
                <td style="padding: 6px 8px; font-weight: bold;">${Utils.escapeHtml(s.nombre)}</td>
                <td style="text-align: center; padding: 6px 8px;">${s.viajes} entrega(s)</td>
                <td style="text-align: right; padding: 6px 8px; font-weight: bold; color: #15803D;">${Utils.formatCurrency(s.monto)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 4: ESTADO DE CARTERA (CUENTAS POR COBRAR) -->
      <div style="margin-bottom: 25px;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #1B4332; border-bottom: 1.5px solid #1B4332; padding-bottom: 4px;">
          4. 💰 ESTADO DE CARTERA - CUENTAS POR COBRAR
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #F3F4F6; border-bottom: 1px solid #D1D5DB;">
              <th style="text-align: left; padding: 6px 8px;">Cliente</th>
              <th style="text-align: left; padding: 6px 8px;">Ubicación</th>
              <th style="text-align: right; padding: 6px 8px;">Saldo Pendiente ($)</th>
              <th style="text-align: center; padding: 6px 8px;">Días Mora</th>
              <th style="text-align: center; padding: 6px 8px;">Estatus</th>
            </tr>
          </thead>
          <tbody>
            ${deudores.length === 0 ? `
              <tr><td colspan="5" style="text-align:center; padding:10px; color:#166534; font-weight:bold;">🎉 ¡Excelente! No hay cuentas pendientes por cobrar. Todos los clientes están al día.</td></tr>
            ` : deudores.map(c => {
              const estatus = store.calcularEstatusCliente(c.id);
              const statusInfo = Utils.clientStatus[estatus] || { label: estatus };
              const ubicacion = c.tipoUbicacion === 'externo'
                ? [c.municipio, c.urbanizacion, c.calle].filter(Boolean).join(', ')
                : [c.sector, c.nivel, c.local].filter(Boolean).join(' / ');
              return `
                <tr style="border-bottom: 1px solid #E5E7EB;">
                  <td style="padding: 6px 8px; font-weight: bold;">${Utils.escapeHtml(c.nombre)}</td>
                  <td style="padding: 6px 8px; color: #4B5563;">${Utils.escapeHtml(ubicacion || '-')}</td>
                  <td style="text-align: right; padding: 6px 8px; font-weight: bold; color: #DC2626;">${Utils.formatCurrency(c.deuda)}</td>
                  <td style="text-align: center; padding: 6px 8px;">${c.dias || 0} días</td>
                  <td style="text-align: center; padding: 6px 8px; font-weight: bold;">${statusInfo.label}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- SECCIÓN 5: RENDIMIENTO Y BALANCE DE AGUA -->
      <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #1B4332; border-bottom: 1.5px solid #1B4332; padding-bottom: 4px;">
          5. 💧 BALANCE Y RENDIMIENTO DEL AGUA
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #F3F4F6; border-bottom: 1px solid #D1D5DB;">
              <th style="text-align: left; padding: 6px 8px;">Concepto</th>
              <th style="text-align: right; padding: 6px 8px;">Litros</th>
              <th style="text-align: right; padding: 6px 8px;">Detalles</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #E5E7EB;">
              <td style="padding: 6px 8px; font-weight: bold;">Total Agua Comprada (Cisternas)</td>
              <td style="text-align: right; padding: 6px 8px; font-weight: bold; color: #2563EB;">${Utils.formatNumber(totalCompradoAgua)} L</td>
              <td style="text-align: right; padding: 6px 8px;">${cisternas.length} cisternas recibidas</td>
            </tr>
            <tr style="border-bottom: 1px solid #E5E7EB;">
              <td style="padding: 6px 8px; font-weight: bold;">Total Agua Despachada (Ventas)</td>
              <td style="text-align: right; padding: 6px 8px; font-weight: bold; color: #16A34A;">${Utils.formatNumber(totalLitrosVendidos)} L</td>
              <td style="text-align: right; padding: 6px 8px;">${ventas.length} ventas procesadas</td>
            </tr>
            <tr style="border-bottom: 1px solid #E5E7EB;">
              <td style="padding: 6px 8px; font-weight: bold;">Merma Registrada (Lavado de botellones)</td>
              <td style="text-align: right; padding: 6px 8px; font-weight: bold; color: #D97706;">${Utils.formatNumber(totalMerma)} L</td>
              <td style="text-align: right; padding: 6px 8px;">Lavado y purgas</td>
            </tr>
            <tr style="background: #F9FAFB; font-weight: bold;">
              <td style="padding: 6px 8px;">Eficiencia Operativa Estimada</td>
              <td style="text-align: right; padding: 6px 8px; color: #1B4332; font-size: 13px;">${eficiencia}%</td>
              <td style="text-align: right; padding: 6px 8px;">(Agua Vendida / Agua Comprada)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pie de página -->
      <div style="border-top: 1px dashed #9CA3AF; padding-top: 10px; margin-top: 20px; text-align: center; font-size: 10px; color: #6B7280;">
        Reporte generado automáticamente por el sistema de gestión de ${Utils.escapeHtml(empresaNombre)} • Documento Confidencial
      </div>
    </div>
  `;
}

function exportConsolidatedCSV(range, periodoLabel) {
  const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
  const fechaTexto = `${Utils.formatDate(range.inicio)} al ${Utils.formatDate(range.fin)}`;
  const currentTasa = store.getConfig('tasaCambio') || 40.00;

  const ventasAll = store.getAll('ventas') || [];
  const cisternasAll = store.getAll('cisternas') || [];
  const clientes = store.getAll('clientes') || [];
  const repartidores = store.getConfig('repartidores') || [];
  const tipos = store.getConfig('tiposBotellon') || [];
  const mermasAll = store.getAll('mermas') || [];

  const ventas = ventasAll.filter(v => {
    const f = new Date(v.fecha);
    return f >= range.inicio && f <= range.fin;
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const cisternas = cisternasAll.filter(c => {
    const f = new Date(c.fecha);
    return f >= range.inicio && f <= range.fin;
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const mermas = mermasAll.filter(m => {
    const f = new Date(m.fecha);
    return f >= range.inicio && f <= range.fin;
  });

  let csv = '\uFEFF'; // UTF-8 BOM para Excel

  // Cabecera
  csv += `REPORTE CONSOLIDADO INTEGRAL DE GESTIÓN\n`;
  csv += `Empresa;${empresaNombre}\n`;
  csv += `Período;${periodoLabel}\n`;
  csv += `Rango de Fechas;${fechaTexto}\n`;
  csv += `Fecha de Emisión;${new Date().toLocaleString('es-VE')}\n\n`;

  // SECCION 1: PRODUCTOS VENDIDOS
  csv += `=== 1. RESUMEN DE VENTAS POR PRODUCTO ===\n`;
  csv += `Producto;Cantidad Vendida;Monto Total ($)\n`;

  const productoResumen = {};
  let totalLitrosVendidos = 0;
  ventas.forEach(v => {
    if (v.detalles && Array.isArray(v.detalles)) {
      v.detalles.forEach(d => {
        const prod = tipos.find(t => t.id === d.tipoBotellonId);
        const prodName = d.nombre || (prod ? prod.nombre : 'Producto');
        const cap = d.capacidad || (prod ? prod.capacidad : 20);
        if (!productoResumen[prodName]) productoResumen[prodName] = { cantidad: 0, monto: 0 };
        productoResumen[prodName].cantidad += (d.cantidad || 1);
        productoResumen[prodName].monto += (d.subtotal || 0);
        totalLitrosVendidos += (d.cantidad || 1) * cap;
      });
    } else if (v.botellones) {
      const prodName = 'Botellón (20L)';
      if (!productoResumen[prodName]) productoResumen[prodName] = { cantidad: 0, monto: 0 };
      productoResumen[prodName].cantidad += v.botellones;
      productoResumen[prodName].monto += v.total;
      totalLitrosVendidos += v.botellones * 20;
    }
  });

  Object.entries(productoResumen).forEach(([prod, info]) => {
    csv += `"${prod}";${info.cantidad};${info.monto.toFixed(2).replace('.', ',')}\n`;
  });
  csv += `\n`;

  // SECCION 2: DETALLE DE VENTAS
  csv += `=== 2. DETALLE DE VENTAS DEL PERÍODO ===\n`;
  csv += `Fecha;Hora;Cliente;Teléfono;Productos;Total ($);Total (Bs);Método de Pago;Estado Entrega\n`;

  ventas.forEach(v => {
    const d = new Date(v.fecha);
    const fechaFmt = d.toLocaleDateString('es-VE');
    const horaFmt = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
    const cli = clientes.find(c => c.id === v.clienteId);
    const cliNombre = cli ? cli.nombre : (v.clienteNombre || 'Cliente General');
    const cliTlf = cli ? (cli.telefono || '-') : '-';
    
    let prodsStr = '';
    if (v.detalles && Array.isArray(v.detalles)) {
      prodsStr = v.detalles.map(det => `${det.cantidad}x ${det.nombre || 'Prod'}`).join(', ');
    } else {
      prodsStr = `${v.botellones}x Botellón`;
    }
    if (v.delivery > 0) prodsStr += ` + Delivery ($${v.delivery.toFixed(2)})`;

    const tasa = v.tasa || currentTasa;
    const totalBs = (v.total * tasa).toFixed(2).replace('.', ',');
    const totalUsd = v.total.toFixed(2).replace('.', ',');
    const metodo = v.tipo === 'credito' ? 'Crédito' : (v.pagos && v.pagos.length > 1 ? 'Mixto' : (v.pagos && v.pagos[0] ? v.pagos[0].metodo : 'Contado'));
    const entrega = v.estadoEntrega === 'pendiente' ? 'Pendiente' : 'Entregado';

    csv += `"${fechaFmt}";"${horaFmt}";"${cliNombre.replace(/"/g, '""')}";"${cliTlf}";"${prodsStr.replace(/"/g, '""')}";${totalUsd};${totalBs};"${metodo}";"${entrega}"\n`;
  });
  csv += `\n`;

  // SECCION 3: CONTROL DE DELIVERIES
  csv += `=== 3. CONTROL DE DELIVERIES Y REPARTIDORES ===\n`;
  csv += `Repartidor;Viajes / Entregas;Monto Recaudado ($)\n`;
  const deliveryStats = {};
  repartidores.forEach(r => { deliveryStats[r.id] = { nombre: r.nombre, viajes: 0, monto: 0 }; });
  deliveryStats['sin_asignar'] = { nombre: 'Sin Asignar / General', viajes: 0, monto: 0 };

  ventas.forEach(v => {
    if (v.delivery > 0) {
      const repId = v.repartidorId || 'sin_asignar';
      if (!deliveryStats[repId]) deliveryStats[repId] = { nombre: v.repartidorNombre || 'Desconocido', viajes: 0, monto: 0 };
      deliveryStats[repId].viajes += (v.deliveryCant || 1);
      deliveryStats[repId].monto += v.delivery;
    }
  });

  Object.values(deliveryStats).filter(s => s.viajes > 0).forEach(s => {
    csv += `"${s.nombre}";${s.viajes};${s.monto.toFixed(2).replace('.', ',')}\n`;
  });
  csv += `\n`;

  // SECCION 4: CUENTAS POR COBRAR
  csv += `=== 4. ESTADO DE CARTERA - CUENTAS POR COBRAR ===\n`;
  csv += `Cliente;Teléfono;Ubicación;Deuda ($);Días de Mora;Estatus\n`;
  const deudores = clientes.filter(c => c.deuda > 0);
  deudores.forEach(c => {
    const estatus = store.calcularEstatusCliente(c.id);
    const ubicacion = c.tipoUbicacion === 'externo'
      ? [c.municipio, c.urbanizacion, c.calle].filter(Boolean).join(', ')
      : [c.sector, c.nivel, c.local].filter(Boolean).join(' / ');
    csv += `"${c.nombre.replace(/"/g, '""')}";"${c.telefono || '-'}";"${ubicacion.replace(/"/g, '""')}";${c.deuda.toFixed(2).replace('.', ',')};${c.dias || 0};"${estatus}"\n`;
  });
  csv += `\n`;

  // SECCION 5: BALANCE DE AGUA
  csv += `=== 5. BALANCE Y RENDIMIENTO DEL AGUA ===\n`;
  csv += `Concepto;Litros;Detalles\n`;
  const totalCompradoAgua = cisternas.reduce((sum, c) => sum + c.capacidad, 0);
  const totalMerma = mermas.reduce((sum, m) => sum + m.litros, 0);
  const eficiencia = totalCompradoAgua > 0 ? Math.round((totalLitrosVendidos / totalCompradoAgua) * 100) : 0;
  csv += `Total Agua Comprada (Cisternas);${totalCompradoAgua};${cisternas.length} cisternas recibidas\n`;
  csv += `Total Agua Despachada (Ventas);${totalLitrosVendidos};${ventas.length} ventas procesadas\n`;
  csv += `Merma Registrada (Lavado);${totalMerma};Lavado y purgas\n`;
  csv += `Eficiencia Operativa;${eficiencia}%;(Agua Vendida / Agua Comprada)\n`;

  // Descarga del archivo
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reporte_Consolidado_${range.inicio.toISOString().split('T')[0]}_al_${range.fin.toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}