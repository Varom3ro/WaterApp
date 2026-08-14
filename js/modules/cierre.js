import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

function renderCierre(content, fecha) {
  content.innerHTML = `
    <div id="cierre-content" style="padding: 20px; background: var(--color-surface); border-radius: 12px;"></div>
  `;

  renderCierreContent(fecha);
}

function renderFormularioArqueo(container, fecha, cierre, methods) {
  container.innerHTML = `
    <div style="max-width: 600px; margin: 0 auto; background: var(--color-surface); border-radius: 12px; border: 1px solid var(--color-border); padding: 20px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h3 style="margin: 0; color: var(--color-primary-900);">Arqueo de Caja</h3>
        <p class="text-muted" style="margin-top: 5px; font-size: 14px;">Por favor, ingresa los montos contados físicamente para la fecha ${Utils.formatDate(fecha)}.</p>
      </div>
      <form id="form-arqueo">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          ${methods.filter(m => m.key !== 'credito' && m.key !== 'convenio').map(m => `
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">${m.icon} ${m.label}</label>
              <div style="position:relative;">
                 <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--color-text-secondary); font-weight:bold; font-size:14px;">${m.key === 'efectivo_usd' ? '$' : 'Bs.'}</span>
                 <input type="text" inputmode="decimal" class="form-control currency-mask" name="arqueo_${m.key}" value="0,00" required style="font-size: 16px; font-weight: bold; padding-left: 40px;"/>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="form-group" style="margin-bottom: 20px;">
          <label class="form-label">📝 Observaciones del Cierre (Opcional)</label>
          <textarea class="form-control" name="observaciones" rows="2" placeholder="Ej: Motivo de faltante/sobrante, vueltos pendientes, billetes deteriorados..." style="font-size: 14px; width: 100%;"></textarea>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%; height: 45px; font-size: 16px;">Calcular Cuadre de Caja</button>
      </form>
    </div>
  `;

  const maskInputs = container.querySelectorAll('.currency-mask');
  maskInputs.forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === '.') {
        e.preventDefault();
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.substring(0, start) + ',' + e.target.value.substring(end);
        e.target.selectionStart = e.target.selectionEnd = start + 1;
        e.target.dispatchEvent(new Event('input'));
      }
    });

    input.addEventListener('input', (e) => {
      let val = e.target.value;
      // Quitamos todos los puntos para limpiar (ya que los usamos para miles)
      val = val.replace(/\./g, '');
      // Permitimos solo números y coma
      val = val.replace(/[^\d,]/g, '');
      
      // Asegurar solo una coma
      const parts = val.split(',');
      if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('');
      
      let p = val.split(',');
      let entero = p[0];
      let decimal = p.length > 1 ? p[1] : '';

      if (decimal.length > 2) decimal = decimal.substring(0, 2);

      if (entero) {
        entero = parseInt(entero, 10).toString(); // quita ceros a la izq
        if (entero === 'NaN') entero = '0';
        entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      } else {
        entero = '0';
      }

      e.target.value = p.length > 1 ? entero + ',' + decimal : entero;
    });

    input.addEventListener('blur', (e) => {
      let val = e.target.value;
      if (!val) { e.target.value = '0,00'; return; }
      if (!val.includes(',')) e.target.value = val + ',00';
      else if (val.endsWith(',')) e.target.value = val + '00';
      else if (val.split(',')[1].length === 1) e.target.value = val + '0';
    });

    input.addEventListener('focus', (e) => e.target.select());
  });

  container.querySelector('#form-arqueo').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const declaracion = {};
    methods.filter(m => m.key !== 'credito' && m.key !== 'convenio').forEach(m => {
      let rawVal = fd.get('arqueo_' + m.key) || '0';
      rawVal = rawVal.replace(/\./g, '').replace(',', '.'); // Quita puntos (miles) y pasa coma a punto
      declaracion[m.key] = parseFloat(rawVal) || 0;
    });
    const observaciones = (fd.get('observaciones') || '').trim();
    store.saveArqueo(fecha, declaracion, observaciones);
    renderCierreContent(fecha);
  });
}

function renderCuadreCajaWeb(arqueo, cierre, methods) {
  let totalDiferenciaUsd = 0;
  let totalDiferenciaBs = 0;
  
  const filas = methods.filter(m => m.key !== 'credito' && m.key !== 'convenio').map(m => {
    const isUsd = m.key === 'efectivo_usd';
    const declarado = arqueo.declaracion[m.key] || 0;
    const sistema = isUsd ? (cierre[m.key] || 0) : (cierre.bs[m.key] || 0);
    const dif = declarado - sistema;
    
    if (isUsd) totalDiferenciaUsd += dif;
    else totalDiferenciaBs += dif;
    
    let colorClass = '';
    if (dif > 0) colorClass = 'text-success font-bold';
    else if (dif < 0) colorClass = 'text-danger font-bold';
    
    const formatter = (val) => isUsd ? Utils.formatCurrency(val) : `Bs ${Utils.formatNumber(val, true)}`;
    
    return `
      <tr>
        <td>${m.icon} ${m.label}</td>
        <td style="text-align: right;">${formatter(declarado)}</td>
        <td style="text-align: right;">${formatter(sistema)}</td>
        <td style="text-align: right;" class="${colorClass}">${dif > 0 ? '+' : ''}${formatter(dif)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom: 20px; border-left: 4px solid var(--color-primary);">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 class="card-title" style="margin: 0;">⚖️ Cuadre de Caja (Declarado vs Sistema)</h3>
        <button id="btn-rehacer-arqueo" class="btn btn-sm btn-secondary">🔄 Rehacer Arqueo</button>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Método de Pago</th>
              <th style="text-align: right;">Monto Físico (Declarado)</th>
              <th style="text-align: right;">Monto Sistema</th>
              <th style="text-align: right;">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            ${filas}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="3" style="text-align: right;">FALTANTE / SOBRANTE GLOBAL:</th>
              <th style="text-align: right; font-size: 16px;">
                <div class="${totalDiferenciaUsd >= 0 ? 'text-success' : 'text-danger'}">${totalDiferenciaUsd > 0 ? '+' : ''}${Utils.formatCurrency(totalDiferenciaUsd)}</div>
                <div class="${totalDiferenciaBs >= 0 ? 'text-success' : 'text-danger'}" style="font-size: 0.85em; margin-top:2px;">${totalDiferenciaBs > 0 ? '+' : ''}Bs ${Utils.formatNumber(totalDiferenciaBs, true)}</div>
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderCierreContent(fecha) {
  const container = document.getElementById('cierre-content');
  if (!container) return;

  const cierre = store.getCierreCaja(fecha);
  const arqueo = store.getArqueo(fecha);
  const methods = [
    { key: 'efectivo_usd', label: 'Efectivo (USD)', icon: '💵', color: '#2D6A4F' },
    { key: 'efectivo_bs', label: 'Efectivo (Bs)', icon: '💴', color: '#40916C' },
    { key: 'punto', label: 'Punto de Venta', icon: '💳', color: '#52B788' },
    { key: 'pago_movil', label: 'Pago Móvil', icon: '📱', color: '#74C69D' },
    { key: 'transferencia', label: 'Transferencia', icon: '🏦', color: '#95D5B2' },
    { key: 'credito', label: 'A Crédito (Ventas)', icon: '📋', color: '#E9A820' },
    { key: 'convenio', label: 'Convenios', icon: '🤝', color: '#0077B6' }
  ];

  if (!arqueo) {
    renderFormularioArqueo(container, fecha, cierre, methods);
    return;
  }


  container.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid var(--color-border); padding-bottom: 15px;">
      <h2 style="margin: 0; color: var(--color-primary-900); font-size: 24px;">${Utils.escapeHtml(store.getConfig('empresaNombre') || 'Tu Empresa')}</h2>
      <p style="margin: 5px 0 0 0; color: var(--color-text-secondary); font-size: 16px;">Reporte de Cierre de Caja - ${fecha}</p>
    </div>

    ${renderCuadreCajaWeb(arqueo, cierre, methods)}

    <!-- Observaciones del Cuadre de Caja -->
    <div class="card" style="margin-bottom: 20px; border-left: 4px solid #3B82F6; background: var(--color-surface);">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;">
        <h3 class="card-title" style="margin: 0; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span>📝 Observaciones del Cuadre</span>
        </h3>
        <button id="btn-edit-observaciones" class="btn btn-sm btn-secondary" style="padding: 4px 10px; font-size: 12px;">✏️ Editar Observación</button>
      </div>
      <div style="padding: 14px 16px; font-size: 14px; color: ${arqueo.observaciones ? 'var(--color-text-main)' : 'var(--color-text-secondary)'}; font-style: ${arqueo.observaciones ? 'normal' : 'italic'}; line-height: 1.4;">
        ${Utils.escapeHtml(arqueo.observaciones || 'Sin observaciones registradas para este cuadre.')}
      </div>
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

    </div>

  `;

  const btnRehacer = container.querySelector('#btn-rehacer-arqueo');
  if (btnRehacer) {
    btnRehacer.addEventListener('click', () => {
      const activeFecha = document.getElementById('cierre-fecha-home')?.value || fecha;
      openModal({
        title: 'Rehacer Arqueo de Caja',
        content: `<p>¿Estás seguro de que deseas borrar este Arqueo de Caja y realizar el conteo de dinero físico de nuevo?</p>`,
        saveLabel: 'Sí, Rehacer Arqueo',
        onSave: () => {
          store.deleteArqueo(activeFecha);
          closeModal();
          showToast('Arqueo eliminado. Puedes ingresar los montos nuevamente', 'info');
          const contentDiv = document.getElementById('cierre-caja-home-content');
          if (contentDiv) {
            renderCierre(contentDiv, activeFecha);
          } else {
            renderCierreContent(activeFecha);
          }
        }
      });
    });
  }

  const btnEditObs = container.querySelector('#btn-edit-observaciones');
  if (btnEditObs) {
    btnEditObs.addEventListener('click', () => {
      const activeFecha = document.getElementById('cierre-fecha-home')?.value || fecha;
      const currentObs = arqueo.observaciones || '';
      openModal({
        title: 'Observaciones del Cuadre de Caja',
        content: `
          <form id="form-edit-obs">
            <div class="form-group">
              <label class="form-label">Escribe el motivo o detalle de las diferencias:</label>
              <textarea class="form-control" name="nuevaObservacion" rows="4" placeholder="Ej: Hubo una diferencia de $1 por vuelto entregado / Billete deteriorado..." style="font-size: 14px; width: 100%;">${Utils.escapeHtml(currentObs)}</textarea>
            </div>
          </form>
        `,
        saveLabel: 'Guardar Observación',
        onSave: (overlay) => {
          const form = overlay.querySelector('#form-edit-obs');
          const fd = new FormData(form);
          const nuevaObs = (fd.get('nuevaObservacion') || '').trim();
          store.updateArqueoObservacion(activeFecha, nuevaObs);
          closeModal();
          showToast('Observación guardada correctamente', 'success');
          renderCierreContent(activeFecha);
        }
      });
    });
  }
}

// Función auxiliar para generar el HTML con estilo de impresora matricial para el PDF
export function getMatricialReportHTML(fecha) {
  const cierre = store.getCierreCaja(fecha);
  const arqueo = store.getArqueo(fecha);
  
  const methodsArqueo = [
    { key: 'efectivo_usd', label: 'Efectivo ($)', icon: '💵' },
    { key: 'efectivo_bs', label: 'Efectivo (Bs)', icon: '💴' },
    { key: 'punto', label: 'Punto de Venta', icon: '💳' },
    { key: 'pago_movil', label: 'Pago Móvil', icon: '📱' },
    { key: 'transferencia', label: 'Transferencia', icon: '🏦' }
  ];

  let cuadreHtml = '';
  if (arqueo) {
      let totalDiferenciaUsd = 0;
      let totalDiferenciaBs = 0;
      let cuadreRows = methodsArqueo.map(m => {
          const isUsd = m.key === 'efectivo_usd';
          const declarado = arqueo.declaracion[m.key] || 0;
          const sistema = isUsd ? (cierre[m.key] || 0) : (cierre.bs[m.key] || 0);
          const dif = declarado - sistema;
          
          if (isUsd) totalDiferenciaUsd += dif;
          else totalDiferenciaBs += dif;
          
          const formatter = (val) => isUsd ? Utils.formatCurrency(val) : `Bs ${Utils.formatNumber(val, true)}`;
          
          return `
            <tr>
              <td style="padding: 4px 0;">${m.label.toUpperCase()}</td>
              <td style="text-align: right; padding: 4px 0;">${formatter(declarado)}</td>
              <td style="text-align: right; padding: 4px 0;">${formatter(sistema)}</td>
              <td style="text-align: right; padding: 4px 0; font-weight:bold;">${dif > 0 ? '+' : ''}${formatter(dif)}</td>
            </tr>
          `;
      }).join('');
      
      cuadreHtml = `
      <div style="margin-bottom: 25px;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ CUADRE DE CAJA - ARQUEO ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 6px 0;">MÉTODO</th>
              <th style="text-align: right; padding: 6px 0;">FÍSICO</th>
              <th style="text-align: right; padding: 6px 0;">SISTEMA</th>
              <th style="text-align: right; padding: 6px 0;">DIFERENCIA</th>
            </tr>
          </thead>
          <tbody>
            ${cuadreRows}
          </tbody>
          <tfoot>
            <tr style="border-top: 1px solid #000;">
              <td colspan="3" style="text-align: right; padding: 6px 0; font-weight: bold;">TOTAL DIFERENCIA (USD):</td>
              <td style="text-align: right; padding: 6px 0; font-weight: bold; font-size: 13px;">${totalDiferenciaUsd > 0 ? '+' : ''}${Utils.formatCurrency(totalDiferenciaUsd)}</td>
            </tr>
            <tr>
              <td colspan="3" style="text-align: right; padding: 0 0 6px 0; font-weight: bold;">TOTAL DIFERENCIA (Bs):</td>
              <td style="text-align: right; padding: 0 0 6px 0; font-weight: bold; font-size: 13px;">${totalDiferenciaBs > 0 ? '+' : ''}Bs ${Utils.formatNumber(totalDiferenciaBs, true)}</td>
            </tr>
          </tfoot>
        </table>
        ${arqueo.observaciones ? `
          <div style="margin-top: 10px; padding: 6px 8px; border: 1px dashed #000; font-size: 11px;">
            <b>OBSERVACIONES DEL CUADRE:</b> ${Utils.escapeHtml(arqueo.observaciones)}
          </div>
        ` : ''}
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>`;
  }

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

        </table>
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>

      ${cuadreHtml}
      <!-- Desglose por Método de Pago -->
      <div style="margin-bottom: 25px;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ DESGLOSE DE INGRESOS FISICOS ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: inherit;">
          ${methods.map(m => {
            const isUsd = m.key === 'efectivo_usd';
            const val = isUsd ? (cierre[m.key] || 0) : (cierre.bs[m.key] || 0);
            const formatter = (v) => isUsd ? Utils.formatCurrency(v) : `Bs ${Utils.formatNumber(v, true)}`;
            return `
            <tr>
              <td style="padding: 4px 0;">${m.icon} ${m.label.toUpperCase()}:</td>
              <td style="text-align: right; padding: 4px 0; font-weight: bold;">${formatter(val)}</td>
            </tr>
            `;
          }).join('')}
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


      <div style="text-align: center; font-size: 10px; margin-top: 15px; color: #555; letter-spacing: 1px;">
        *** FIN DEL REPORTE - IMPRESO DESDE SISTEMA LOCAL ***
      </div>
    </div>
  `;
}

export function renderCierreCaja(container) {
  const today = Utils.todayISO();
  container.innerHTML = `
    <div class="page-header" style="margin-bottom: 20px; border-bottom: 2px solid var(--color-border); padding-bottom: 15px;">
      <div>
        <h1 class="page-title">Cierre de Caja Diario</h1>
        <p class="page-subtitle">Consolidado de operaciones y emisión de Reporte Z</p>
      </div>
      <div class="flex items-center gap-md">
        <div class="flex items-center gap-sm">
          <label class="form-label" style="margin:0; font-size:13px; color:var(--color-text-secondary);">Fecha:</label>
          <input type="date" class="form-control" id="cierre-fecha-home" style="max-width:160px; height:36px; padding:4px 8px; font-size:14px;" value="${today}"/>
        </div>
        <button id="btn-generar-pdf-home" class="btn btn-primary" style="height:36px; padding:0 12px; font-size:13px;">📄 Generar Z (PDF)</button>
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
    if (!store.getArqueo(fechaInput.value)) {
       alert('Debe realizar el Arqueo de Caja antes de generar el Reporte Z.');
       return;
    }
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
