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
        <p class="page-subtitle">Análisis de rendimiento, cartera y caja</p>
      </div>
    </div>

    <!-- Tabs y Controles en la misma fila -->
    <div class="flex gap-md mb-lg" style="justify-content: space-between; align-items: center; flex-wrap: wrap;">
      <div class="flex gap-md">
        <button class="btn btn-primary tab-btn active" data-tab="cierre">🧾 Cierre de Caja</button>
        <button class="btn btn-secondary tab-btn" data-tab="cartera">💰 Estado de Cartera</button>
        <button class="btn btn-secondary tab-btn" data-tab="rendimiento">📊 Rendimiento del Agua</button>
      </div>
      
      <div id="reportes-cierre-controles" class="flex items-center gap-md">
        <div class="flex items-center gap-sm">
          <label class="form-label" style="margin:0; font-size:13px; color:var(--color-text-secondary);">Fecha:</label>
          <input type="date" class="form-control" id="cierre-fecha" style="max-width:160px; height:36px; padding:4px 8px; font-size:14px;" value="${today}"/>
        </div>
        <button id="btn-generar-pdf" class="btn btn-primary" style="height:36px; padding:0 12px; font-size:13px;">📄 Guardar PDF</button>
      </div>
    </div>

    <div id="tab-content">
    </div>
  `;

  // Tab events
  const tabBtns = container.querySelectorAll('.tab-btn');
  const cierreControles = container.querySelector('#reportes-cierre-controles');
  const fechaInput = container.querySelector('#cierre-fecha');
  const pdfBtn = container.querySelector('#btn-generar-pdf');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active', 'btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.add('active', 'btn-primary');
      btn.classList.remove('btn-secondary');
      
      if (btn.dataset.tab === 'cierre') {
        cierreControles.style.display = 'flex';
      } else {
        cierreControles.style.display = 'none';
      }
      renderTab(btn.dataset.tab, fechaInput.value);
    });
  });

  // Evento para cambiar de fecha
  fechaInput.addEventListener('change', () => {
    const activeTab = container.querySelector('.tab-btn.active').dataset.tab;
    if (activeTab === 'cierre') {
      renderTab('cierre', fechaInput.value);
    }
  });

  // Evento para PDF
  pdfBtn.addEventListener('click', () => {
    const htmlMatricial = getMatricialReportHTML(fechaInput.value);

    const opt = {
      margin:       0.5,
      filename:     `Cierre_Caja_${fechaInput.value}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css'] }
    };
    
    if (window.html2pdf) {
        window.html2pdf().set(opt).from(htmlMatricial).save();
    } else {
        alert("La librería PDF no está lista o cargada.");
    }
  });

  renderTab('cierre', today);
}

function renderTab(tab, fecha) {
  const content = document.getElementById('tab-content');
  if (!content) return;

  switch (tab) {
    case 'rendimiento':
      renderRendimiento(content);
      break;
    case 'cartera':
      renderCartera(content);
      break;
    case 'cierre':
      renderCierre(content, fecha);
      break;
  }
}

function renderRendimiento(content) {
  const cisternas = store.getAll('cisternas');
  const ventas = store.getAll('ventas');
  const mermas = store.getAll('mermas');

  const totalComprado = cisternas.reduce((sum, c) => sum + c.capacidad, 0);
  const totalVendido = ventas.reduce((sum, v) => sum + (v.botellones * 20), 0);
  const totalMerma = mermas.reduce((sum, m) => sum + m.litros, 0);
  const eficiencia = totalComprado > 0 ? Math.round((totalVendido / totalComprado) * 100) : 0;

  content.innerHTML = `
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr)">
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
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const barGroupWidth = chartW / 7;
  const barWidth = barGroupWidth * 0.3;

  // Grid lines
  ctx.strokeStyle = 'rgba(142, 149, 169, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = '#8E95A9';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const val = Math.round(maxVal - (maxVal / 4) * i);
    ctx.fillText(Utils.formatNumber(val), padding.left - 8, y + 4);
  }

  for (let i = 0; i < 7; i++) {
    const groupX = padding.left + i * barGroupWidth;

    // Comprado bar
    const bh1 = (comprado[i] / maxVal) * chartH;
    const x1 = groupX + (barGroupWidth - barWidth * 2 - 4) / 2;
    const gradient1 = ctx.createLinearGradient(x1, padding.top + chartH - bh1, x1, padding.top + chartH);
    gradient1.addColorStop(0, '#52B788');
    gradient1.addColorStop(1, '#2D6A4F');
    ctx.fillStyle = gradient1;
    ctx.beginPath();
    
    // Fallback if roundRect is not supported
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x1, padding.top + chartH - bh1, barWidth, bh1, [4, 4, 0, 0]);
    } else {
        ctx.rect(x1, padding.top + chartH - bh1, barWidth, bh1);
    }
    ctx.fill();

    // Vendido bar
    const bh2 = (vendido[i] / maxVal) * chartH;
    const x2 = x1 + barWidth + 4;
    const gradient2 = ctx.createLinearGradient(x2, padding.top + chartH - bh2, x2, padding.top + chartH);
    gradient2.addColorStop(0, '#74C69D');
    gradient2.addColorStop(1, '#95D5B2');
    ctx.fillStyle = gradient2;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x2, padding.top + chartH - bh2, barWidth, bh2, [4, 4, 0, 0]);
    } else {
        ctx.rect(x2, padding.top + chartH - bh2, barWidth, bh2);
    }
    ctx.fill();

    // Day label
    ctx.fillStyle = '#8E95A9';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(days[i], groupX + barGroupWidth / 2, height - 10);
  }

  // Legend
  ctx.fillStyle = '#2D6A4F';
  ctx.fillRect(padding.left, 5, 12, 12);
  ctx.fillStyle = '#1A1D26';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Comprado', padding.left + 16, 15);

  ctx.fillStyle = '#95D5B2';
  ctx.fillRect(padding.left + 100, 5, 12, 12);
  ctx.fillStyle = '#1A1D26';
  ctx.fillText('Vendido', padding.left + 116, 15);
}

function renderCartera(content) {
  const clientes = store.getAll('clientes');
  const deudores = clientes.map(c => {
    const deuda = store.getDeudaCliente(c.id);
    const estatus = store.calcularEstatusCliente(c.id);
    const ventas = store.getAll('ventas').filter(v => v.clienteId === c.id && v.tipo === 'credito');
    const ultimaVenta = ventas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
    const dias = ultimaVenta ? Utils.daysBetween(ultimaVenta.fecha, new Date()) : 0;
    return { ...c, deuda, estatus, dias };
  }).filter(c => c.deuda > 0).sort((a, b) => b.dias - a.dias);

  const totalDeuda = deudores.reduce((sum, c) => sum + c.deuda, 0);

  content.innerHTML = `
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="metric-card">
        <div class="metric-label">Total Deudores</div>
        <div class="metric-value" style="font-size:var(--font-size-xl)">${deudores.length}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total por Cobrar</div>
        <div class="metric-value text-danger" style="font-size:var(--font-size-xl)">${Utils.formatCurrency(totalDeuda)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Morosos</div>
        <div class="metric-value text-danger" style="font-size:var(--font-size-xl)">${deudores.filter(d => d.estatus === 'moroso').length}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Clientes Deudores (por antigüedad)</h3>
      </div>
      ${deudores.length > 0 ? `
        <div class="table-container">
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
                const statusInfo = Utils.clientStatus[c.estatus];
                const ubicacion = c.tipoUbicacion === 'externo'
                  ? [c.municipio, c.urbanizacion, c.calle, c.edificio].filter(Boolean).join(', ')
                  : [c.sector, c.nivel, c.local, c.nombreLocal].filter(Boolean).join(' / ');
                return `
                  <tr>
                    <td class="font-semibold">${Utils.escapeHtml(c.nombre)}</td>
                    <td class="text-muted">${Utils.escapeHtml(ubicacion || '-')}</td>
                    <td class="font-bold text-danger">${Utils.formatCurrency(c.deuda)}</td>
                    <td>${c.dias} deudor/a</td>
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

function renderCierre(content, fecha) {
  content.innerHTML = `
    <div id="cierre-content" style="padding: 20px; background: var(--color-surface); border-radius: 12px;"></div>
  `;

  renderCierreContent(fecha);
}

function renderCierreContent(fecha) {
  const container = document.getElementById('cierre-content');
  if (!container) return;

  const cierre = store.getCierreCaja(fecha);
  const methods = [
    { key: 'efectivo_usd', label: 'Efectivo (USD)', icon: '💵', color: '#2D6A4F' },
    { key: 'efectivo_bs', label: 'Efectivo (Bs)', icon: '💴', color: '#40916C' },
    { key: 'punto', label: 'Punto de Venta', icon: '💳', color: '#52B788' },
    { key: 'pago_movil', label: 'Pago Móvil', icon: '📱', color: '#74C69D' },
    { key: 'transferencia', label: 'Transferencia', icon: '🏦', color: '#95D5B2' },
    { key: 'credito', label: 'A Crédito (Ventas)', icon: '📋', color: '#E9A820' }
  ];

  container.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid var(--color-border); padding-bottom: 15px;">
      <h2 style="margin: 0; color: var(--color-primary-900); font-size: 24px;">Tu Empresa</h2>
      <p style="margin: 5px 0 0 0; color: var(--color-text-secondary); font-size: 16px;">Reporte de Cierre de Caja - ${fecha}</p>
    </div>
    
    <!-- Métricas Principales de Caja y Ventas -->
    <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
      <!-- Tarjeta 1: Ingreso Real -->
      <div class="metric-card accent" style="padding: 15px; border-radius: 8px;">
        <div class="metric-label">Ingreso Real en Caja</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); margin: 0;">${Utils.formatCurrency(cierre.real_ingresado)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block;">Bs ${Utils.formatNumber(cierre.bs && cierre.bs.real_ingresado ? cierre.bs.real_ingresado : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px; color: rgba(255,255,255,0.85);">(Contado + Abonos de hoy)</div>
      </div>

      <!-- Tarjeta 2: Total Ventas -->
      <div class="metric-card" style="padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
        <div class="metric-label">Total Ventas (Valor)</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); margin: 0;">${Utils.formatCurrency(cierre.total)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block; color:var(--color-text-secondary);">Bs ${Utils.formatNumber(cierre.bs && cierre.bs.total ? cierre.bs.total : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px;">(Contado + Crédito de hoy)</div>
      </div>

      <!-- Tarjeta 3: Crédito Nuevo (Deuda hoy) -->
      <div class="metric-card" style="padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
        <div class="metric-label">Crédito Nuevo (Hoy)</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); color: var(--color-danger); margin: 0;">${Utils.formatCurrency(cierre.credito)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block;">Bs ${Utils.formatNumber(cierre.bs && cierre.bs.credito ? cierre.bs.credito : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px;">(Por cobrar hoy)</div>
      </div>

      <!-- Tarjeta 4: Crédito Cobrado (Abonos hoy) -->
      <div class="metric-card" style="padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
        <div class="metric-label">Crédito Cobrado (Abonos)</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); color: var(--color-success); margin: 0;">${Utils.formatCurrency(cierre.cobros_credito)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block;">Bs ${Utils.formatNumber(cierre.bs && cierre.bs.cobros_credito ? cierre.bs.cobros_credito : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px;">(Recuperado hoy)</div>
      </div>
    </div>

    <!-- Métricas Operativas -->
    <div class="metrics-grid" style="grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">
      <div class="metric-card" style="padding: 12px 15px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: var(--color-bg);">
        <span class="metric-label" style="margin: 0;">Ventas del Día (Operaciones)</span>
        <span class="metric-value" style="font-size: var(--font-size-md); font-weight: bold; margin: 0;">${cierre.cantidadVentas}</span>
      </div>
      <div class="metric-card" style="padding: 12px 15px; border-radius: 8px; border: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: var(--color-bg);">
        <span class="metric-label" style="margin: 0;">Botellones Entregados</span>
        <span class="metric-value" style="font-size: var(--font-size-md); font-weight: bold; margin: 0;">${cierre.botellones}</span>
      </div>
    </div>

    <div class="card" style="margin-bottom: 20px;">
      <div class="card-header">
        <h3 class="card-title">Desglose de Ingresos Físicos (Método de Pago + Abonos)</h3>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-md)">
        ${methods.map(m => `
          <div style="padding:var(--space-lg);background:var(--color-bg);border-radius:var(--radius-md);text-align:center">
            <div style="font-size:1.5rem;margin-bottom:var(--space-sm)">${m.icon}</div>
            <div class="font-bold" style="font-size:var(--font-size-lg);color:${m.color}; line-height:1.2;">${Utils.formatCurrency(cierre[m.key] || 0)}<br><small style="font-size:0.5em; opacity:0.7; font-weight:normal;">Bs ${Utils.formatNumber((cierre.bs && cierre.bs[m.key], true) || 0)}</small></div>
            <div class="text-muted" style="font-size:var(--font-size-xs)">${m.label}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Detalle de Abonos/Cobros Recibidos Hoy -->
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-header">
        <h3 class="card-title">📖 Detalle de Cobros / Abonos Recibidos (${cierre.abonosDetalle ? cierre.abonosDetalle.length : 0})</h3>
      </div>
      ${cierre.abonosDetalle && cierre.abonosDetalle.length > 0 ? `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Monto Recibido</th>
                <th>Método de Pago</th>
                <th>Referencia</th>
              </tr>
            </thead>
            <tbody>
              ${cierre.abonosDetalle.map(a => {
                const cli = store.getById('clientes', a.clienteId);
                const nombreCliente = cli ? cli.nombre : 'Cliente Desconocido';
                const horaStr = new Date(a.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
                const foundMethod = methods.find(m => m.key === a.metodo);
                const metodoStr = foundMethod ? `${foundMethod.icon} ${foundMethod.label}` : a.metodo;
                return `
                  <tr>
                    <td class="text-muted">${horaStr}</td>
                    <td class="font-semibold">${Utils.escapeHtml(nombreCliente)}</td>
                    <td class="font-bold text-success">${Utils.formatCurrency(a.monto)}</td>
                    <td>${metodoStr}</td>
                    <td class="text-muted">${Utils.escapeHtml(a.referencia || '-')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--color-text-muted);">No se registraron abonos el día de hoy.</div>'}
    </div>

    <!-- Detalle de Ventas del Día -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">📦 Detalle de Ventas Realizadas (${cierre.ventasDetalle ? cierre.ventasDetalle.length : 0})</h3>
      </div>
      ${cierre.ventasDetalle && cierre.ventasDetalle.length > 0 ? `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Detalles</th>
                <th>Total Venta</th>
                <th>Tipo</th>
                <th>Métodos de Pago / Detalle</th>
              </tr>
            </thead>
            <tbody>
              ${cierre.ventasDetalle.map(v => {
                const cli = store.getById('clientes', v.clienteId);
                const nombreCliente = cli ? cli.nombre : 'Cliente Desconocido';
                const horaStr = new Date(v.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
                
                let pagoStr = '-';
                if (v.tipo === 'credito') {
                  pagoStr = `<span class="badge badge-danger">A Crédito</span>`;
                } else if (v.tipo === 'convenio') {
                  pagoStr = `<span class="badge badge-info">Convenio</span>`;
                } else if (v.pagos && v.pagos.length > 0) {
                  pagoStr = v.pagos.map(p => {
                    const foundMethod = methods.find(m => m.key === p.metodo);
                    const refText = p.referencia ? ` (Ref: ${p.referencia})` : '';
                    const metodoStr = foundMethod ? `${foundMethod.icon} ${foundMethod.label}` : p.metodo;
                    return `${metodoStr}${refText}: <b>${Utils.formatCurrency(p.monto)}</b>`;
                  }).join('<br>');
                }


                const tipos = store.getConfig('tiposBotellon') || [];
                let detallesHTML = '';
                if (v.detalles && v.detalles.length > 0) {
                  detallesHTML = v.detalles.map(d => {
                    const prod = tipos.find(t => t.id === d.tipoBotellonId);
                    const prodName = d.nombre || (prod ? prod.nombre : 'Prod.');
                    return `<div style="font-size: 0.85em;">${d.cantidad}x ${Utils.formatCurrency(d.precioUnitario)} ${prodName}</div>`;
                  }).join('');
                } else {
                  detallesHTML = `<div style="font-size: 0.85em;">${v.botellones || 0} botellones</div>`;
                }

                // Delivery
                const sumaSubtotal = v.detalles ? v.detalles.reduce((acc, d) => acc + d.subtotal, 0) : v.total;
                const delivery = v.delivery !== undefined ? v.delivery : (v.total - sumaSubtotal > 0.01 ? v.total - sumaSubtotal : 0);
                if (delivery > 0) {
                  detallesHTML += `<div style="font-size: 0.8em; color: var(--color-text-secondary);">+ Delivery: ${Utils.formatCurrency(delivery)}</div>`;
                }

                return `
                  <tr>
                    <td class="text-muted">${horaStr}</td>
                    <td class="font-semibold">${Utils.escapeHtml(nombreCliente)}</td>
                    <td style="line-height: 1.2;">${detallesHTML}</td>
                    <td class="font-bold text-primary">${Utils.formatCurrency(v.total)}</td>
                    <td>
                      <span class="badge ${v.tipo === 'credito' ? 'badge-danger' : (v.tipo === 'convenio' ? 'badge-info' : 'badge-success')}">
                        ${v.tipo === 'credito' ? 'Crédito' : (v.tipo === 'convenio' ? 'Convenio' : 'Contado')}
                      </span>
                    </td>
                    <td style="font-size: var(--font-size-xs); line-height: 1.3;">${pagoStr}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--color-text-muted);">No se registraron ventas el día de hoy.</div>'}
    </div>
  `;
}

// Función auxiliar para generar el HTML con estilo de impresora matricial para el PDF
export function getMatricialReportHTML(fecha) {
  const cierre = store.getCierreCaja(fecha);
  const methods = [
    { key: 'efectivo_usd', label: 'Efectivo (USD)', icon: '💵' },
    { key: 'efectivo_bs', label: 'Efectivo (Bs)', icon: '💴' },
    { key: 'punto', label: 'Punto de Venta', icon: '💳' },
    { key: 'pago_movil', label: 'Pago Móvil', icon: '📱' },
    { key: 'transferencia', label: 'Transferencia', icon: '🏦' },
    { key: 'credito', label: 'A Crédito (Ventas)', icon: '📋' }
  ];

  return `
    <div style="font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; padding: 25px; line-height: 1.4; font-size: 13px; max-width: 800px; margin: 0 auto;">
      
      <!-- Encabezado de Ticket Matricial -->
      <div style="text-align: center; margin-bottom: 25px;">
        <div style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">*** TU EMPRESA ***</div>
        <div style="font-size: 14px; font-weight: bold; margin-top: 5px; letter-spacing: 1px;">REPORTE DE CIERRE DE CAJA</div>
        <div style="font-size: 13px; margin-top: 5px;">FECHA DEL REPORTE: ${fecha}</div>
        <div style="border-top: 2px double #000; margin-top: 15px; margin-bottom: 5px;"></div>
      </div>

      <!-- Resumen de Flujo de Caja (Dinero Real) -->
      <div style="margin-bottom: 20px;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ RESUMEN DE FLUJO DE CAJA ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: inherit;">
          <tr>
            <td style="padding: 4px 0;">INGRESO REAL EN CAJA (CONTADO + ABONOS):</td>
            <td style="text-align: right; font-weight: bold; padding: 4px 0; font-size: 15px;">${Utils.formatCurrency(cierre.real_ingresado)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #333;">TOTAL VENTAS REGISTRADAS (VALOR):</td>
            <td style="text-align: right; padding: 4px 0; color: #333;">${Utils.formatCurrency(cierre.total)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">(-) CRÉDITO OTORGADO HOY (DEUDA NUEVA):</td>
            <td style="text-align: right; padding: 4px 0; color: #666;">- ${Utils.formatCurrency(cierre.credito)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;">(+) CRÉDITO COBRADO HOY (ABONOS RECIBIDOS):</td>
            <td style="text-align: right; padding: 4px 0; color: #666;">+ ${Utils.formatCurrency(cierre.cobros_credito)}</td>
          </tr>
        </table>
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>

      <!-- Resumen Operativo -->
      <div style="margin-bottom: 20px;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ RESUMEN OPERATIVO ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: inherit;">
          <tr>
            <td style="padding: 4px 0;">VENTAS FACTURADAS HOY (OPERACIONES):</td>
            <td style="text-align: right; padding: 4px 0; font-weight: bold;">${cierre.cantidadVentas}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0;">TOTAL BOTELLONES ENTREGADOS:</td>
            <td style="text-align: right; padding: 4px 0; font-weight: bold;">${cierre.botellones}</td>
          </tr>
        </table>
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>

      <!-- Desglose por Método de Pago -->
      <div style="margin-bottom: 25px;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ DESGLOSE DE INGRESOS FISICOS ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: inherit;">
          ${methods.map(m => `
            <tr>
              <td style="padding: 4px 0;">${m.icon} ${m.label.toUpperCase()}:</td>
              <td style="text-align: right; padding: 4px 0; font-weight: bold;">${Utils.formatCurrency(cierre[m.key] || 0)}</td>
            </tr>
          `).join('')}
        </table>
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>

      <!-- Detalle de Abonos/Cobros Recibidos Hoy -->
      <div style="margin-bottom: 25px; page-break-inside: avoid;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ DETALLE DE COBROS / ABONOS RECIBIDOS ]</div>
        ${cierre.abonosDetalle && cierre.abonosDetalle.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid #000;">
                <th style="text-align: left; padding: 6px 0; width: 12%;">HORA</th>
                <th style="text-align: left; padding: 6px 0; width: 38%;">CLIENTE</th>
                <th style="text-align: right; padding: 6px 0; width: 18%;">MONTO</th>
                <th style="text-align: left; padding: 6px 0; padding-left: 15px; width: 18%;">MÉTODO</th>
                <th style="text-align: left; padding: 6px 0; width: 14%;">REF.</th>
              </tr>
            </thead>
            <tbody>
              ${cierre.abonosDetalle.map(a => {
                const cli = store.getById('clientes', a.clienteId);
                const nombreCliente = cli ? cli.nombre : 'Cliente Desconocido';
                const horaStr = new Date(a.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
                const foundMethod = methods.find(m => m.key === a.metodo);
                const metodoStr = foundMethod ? foundMethod.label.toUpperCase() : a.metodo.toUpperCase();
                return `
                  <tr>
                    <td style="padding: 5px 0; color:#333;">${horaStr}</td>
                    <td style="padding: 5px 0; font-weight: bold;">${nombreCliente.toUpperCase()}</td>
                    <td style="padding: 5px 0; text-align: right; font-weight: bold; color: var(--color-success);">${Utils.formatCurrency(a.monto)}</td>
                    <td style="padding: 5px 0; padding-left: 15px;">${metodoStr}</td>
                    <td style="padding: 5px 0; color:#555;">${(a.referencia || '-').toUpperCase()}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : '<div style="padding: 8px 0; font-style: italic; color: #555;">NO SE REGISTRARON ABONOS HOY.</div>'}
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>

      <!-- Detalle de Ventas del Día -->
      <div style="margin-bottom: 10px; page-break-inside: avoid;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ DETALLE DE VENTAS REALIZADAS ]</div>
        ${cierre.ventasDetalle && cierre.ventasDetalle.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: 11px;">
            <thead>
              <tr style="border-bottom: 1px solid #000;">
                <th style="text-align: left; padding: 6px 0; width: 12%;">HORA</th>
                <th style="text-align: left; padding: 6px 0; width: 33%;">CLIENTE</th>
                <th style="text-align: center; padding: 6px 0; width: 10%;">CANT.</th>
                <th style="text-align: right; padding: 6px 0; width: 15%;">TOTAL</th>
                <th style="text-align: left; padding: 6px 0; padding-left: 15px; width: 30%;">DETALLE DE PAGO / TIPO</th>
              </tr>
            </thead>
            <tbody>
              ${cierre.ventasDetalle.map(v => {
                const cli = store.getById('clientes', v.clienteId);
                const nombreCliente = cli ? cli.nombre : 'Cliente Desconocido';
                const horaStr = new Date(v.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
                
                let pagoStr = '';
                if (v.tipo === 'credito') {
                  pagoStr = 'A CRÉDITO';
                } else if (v.tipo === 'convenio') {
                  pagoStr = 'CONVENIO';
                } else if (v.pagos && v.pagos.length > 0) {
                  pagoStr = v.pagos.map(p => {
                    const foundMethod = methods.find(m => m.key === p.metodo);
                    const refText = p.referencia ? ` (REF: ${p.referencia})` : '';
                    const metodoStr = foundMethod ? foundMethod.label.toUpperCase() : p.metodo.toUpperCase();
                    return `${metodoStr}${refText}: ${Utils.formatCurrency(p.monto)}`;
                  }).join(' | ');
                }


                const tipos = store.getConfig('tiposBotellon') || [];
                let detallesHTML = '';
                if (v.detalles && v.detalles.length > 0) {
                  detallesHTML = v.detalles.map(d => {
                    const prod = tipos.find(t => t.id === d.tipoBotellonId);
                    const prodName = (d.nombre || (prod ? prod.nombre : 'PROD.')).toUpperCase();
                    return `<div style="line-height:1.2;">${d.cantidad}X ${Utils.formatCurrency(d.precioUnitario)} ${prodName}</div>`;
                  }).join('');
                } else {
                  detallesHTML = `<div style="line-height:1.2;">${v.botellones || 0} BOTELLONES</div>`;
                }

                // Delivery
                const sumaSubtotal = v.detalles ? v.detalles.reduce((acc, d) => acc + d.subtotal, 0) : v.total;
                const delivery = v.delivery !== undefined ? v.delivery : (v.total - sumaSubtotal > 0.01 ? v.total - sumaSubtotal : 0);
                if (delivery > 0) {
                  detallesHTML += `<div style="font-size: 8px; color: #666;">+ DELIV: ${Utils.formatCurrency(delivery)}</div>`;
                }

                return `
                  <tr>
                    <td style="padding: 5px 0; color:#333;">${horaStr}</td>
                    <td style="padding: 5px 0; font-weight: bold;">${nombreCliente.toUpperCase()}</td>
                    <td style="padding: 5px 0; font-size: 9px; min-width: 100px;">${detallesHTML}</td>
                    <td style="padding: 5px 0; text-align: right; font-weight: bold; color: var(--color-primary-900);">${Utils.formatCurrency(v.total)}</td>
                    <td style="padding: 5px 0; padding-left: 15px; font-weight: 500; font-size:10px; color:#444;">${pagoStr}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        ` : '<div style="padding: 8px 0; font-style: italic; color: #555;">NO SE REGISTRARON VENTAS HOY.</div>'}
        <div style="border-top: 2px double #000; margin-top: 15px; margin-bottom: 5px;"></div>
      </div>

      <div style="text-align: center; font-size: 10px; margin-top: 15px; color: #555; letter-spacing: 1px;">
        *** FIN DEL REPORTE - IMPRESO DESDE SISTEMA LOCAL ***
      </div>
    </div>
  `;
}

export function renderCierreCajaHome(container) {
  const today = Utils.todayISO();
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid var(--color-border); padding-bottom: 10px; margin-bottom: 20px; margin-top: 40px;">
      <h3 style="margin:0; font-size: 20px; color: var(--color-text);">Cierre de Caja Diario</h3>
      <div class="flex items-center gap-md">
        <div class="flex items-center gap-sm">
          <label class="form-label" style="margin:0; font-size:13px; color:var(--color-text-secondary);">Fecha:</label>
          <input type="date" class="form-control" id="cierre-fecha-home" style="max-width:160px; height:36px; padding:4px 8px; font-size:14px;" value="${today}"/>
        </div>
        <button id="btn-generar-pdf-home" class="btn btn-primary" style="height:36px; padding:0 12px; font-size:13px;">📄 Guardar PDF</button>
      </div>
    </div>
    <div id="cierre-caja-home-content"></div>
  `;

  const contentDiv = container.querySelector('#cierre-caja-home-content');
  const fechaInput = container.querySelector('#cierre-fecha-home');
  const pdfBtn = container.querySelector('#btn-generar-pdf-home');

  fechaInput.addEventListener('change', () => {
    renderCierre(contentDiv, fechaInput.value);
  });

  pdfBtn.addEventListener('click', () => {
    const htmlMatricial = getMatricialReportHTML(fechaInput.value);
    const opt = {
      margin:       0.5,
      filename:     `Cierre_Caja_${fechaInput.value}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css'] }
    };
    if (window.html2pdf) {
        window.html2pdf().set(opt).from(htmlMatricial).save();
    } else {
        alert("La librería PDF no está lista o cargada.");
    }
  });

  renderCierre(contentDiv, today);
}
