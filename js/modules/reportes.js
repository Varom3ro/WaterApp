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

  // Generar PDF
  pdfBtn.addEventListener('click', () => {
    const range = getRange();
    const activeTab = container.querySelector('.tab-btn.active').dataset.tab;
    const tabName = container.querySelector('.tab-btn.active').innerText.trim();
    
    const periodoLabel = filtroPeriodo.options[filtroPeriodo.selectedIndex].text;
    const fechaTexto = `${Utils.formatDate(range.inicio)} al ${Utils.formatDate(range.fin)}`;

    const contentEl = document.getElementById('tab-content');

    const htmlPDF = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1B4332; padding-bottom: 10px; margin-bottom: 20px;">
          <div>
            <h1 style="margin: 0; color: #1B4332; font-size: 24px;">Tu Empresa - Reporte Oficial</h1>
            <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">${tabName} (${periodoLabel})</p>
          </div>
          <div style="text-align: right; font-size: 12px; color: #666;">
            <div><strong>Rango:</strong> ${fechaTexto}</div>
            <div><strong>Generado:</strong> ${Utils.formatDateTime(Utils.nowISO())}</div>
          </div>
        </div>
        ${contentEl.innerHTML}
      </div>
    `;

    const opt = {
      margin:       0.4,
      filename:     `Reporte_${activeTab}_${filtroPeriodo.value}.pdf`,
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