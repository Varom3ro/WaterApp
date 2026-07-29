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
        
        <button class="btn btn-primary tab-btn active" data-tab="cartera">💰 Estado de Cartera</button>
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

  renderTab('cartera', today);
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