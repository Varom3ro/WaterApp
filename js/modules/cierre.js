import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { openModalCaudalimetro } from './ventas.js';

let currentActiveTab = null;

function formatHora(isoStr) {
  if (!isoStr) return '--:--';
  if (isoStr.endsWith('T00:00:00')) return 'Apertura (00:00)';
  try {
    return new Date(isoStr).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (e) {
    return isoStr;
  }
}

function getMethodsList() {
  const allMetodos = store.getMetodosPago(false);
  return [
    ...allMetodos.map(m => ({
      key: m.id,
      label: m.label,
      icon: m.icon || '💳',
      moneda: m.moneda || 'Bs',
      color: m.color || (m.moneda === 'USD' ? '#2D6A4F' : '#3B82F6')
    })),
    { key: 'credito', label: 'A Crédito (Ventas)', icon: '📋', moneda: 'USD', color: '#E9A820' }
  ];
}

function renderCierre(content, fecha, activeTab = null) {
  content.innerHTML = `
    <div id="cierre-content" style="padding: 20px; background: var(--color-surface); border-radius: 12px;"></div>
  `;
  renderCierreContent(fecha, activeTab);
}

function setupCurrencyMasks(container) {
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
      val = val.replace(/\./g, '');
      val = val.replace(/[^\d,]/g, '');
      const parts = val.split(',');
      if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('');
      let p = val.split(',');
      let entero = p[0];
      let decimal = p.length > 1 ? p[1] : '';

      if (decimal.length > 2) decimal = decimal.substring(0, 2);

      if (entero) {
        entero = parseInt(entero, 10).toString();
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
}

function renderFormularioArqueo(container, fecha, infoActivo, methods) {
  const moduloCaudalimetro = store.getConfig('moduloCaudalimetro') || false;
  const unidadCaudalimetro = store.getConfig('unidadCaudalimetro') || 'L';
  const lecturaCaud = store.getLecturaCaudalimetro(fecha);
  const cierreTurno = infoActivo.cierreSistema || store.getCierreCaja(fecha, infoActivo.inicio, infoActivo.fin);

  const numTurno = infoActivo.numeroTurno || 1;
  const horaInicioStr = formatHora(infoActivo.inicio);

  container.innerHTML = `
    <div style="max-width: 650px; margin: 0 auto; background: var(--color-surface); border-radius: 12px; border: 1px solid var(--color-border); padding: 22px; box-shadow: var(--shadow-sm);">
      
      <!-- Encabezado de Turno -->
      <div style="background: linear-gradient(135deg, #1E3A8A, #2563EB); color: white; padding: 14px 18px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: white;">
            ⏱️ Arqueo de Caja - Turno ${numTurno}
          </h3>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">
            ${infoActivo.tieneTurnosPrevios 
              ? `Iniciado a las ${horaInicioStr} (tras cierre del Turno ${numTurno - 1})` 
              : `Inicio de jornada (${Utils.formatDate(fecha)})`}
          </p>
        </div>
        <span class="badge" style="background: rgba(255,255,255,0.2); color: white; font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 20px;">
          En Curso
        </span>
      </div>

      <div style="background: var(--color-bg, #F8FAFC); border-left: 4px solid var(--color-primary); padding: 10px 14px; border-radius: 6px; margin-bottom: 20px; font-size: 13.5px; color: var(--color-text-main);">
        🛒 <strong>Operaciones de este Turno:</strong> 
        ${cierreTurno.cantidadVentas} ${cierreTurno.cantidadVentas === 1 ? 'venta registrada' : 'ventas registradas'}
        ${!store.isOperario() ? ` | Esperado en Caja: <strong>${Utils.formatCurrency(cierreTurno.real_ingresado)}</strong> (Bs ${Utils.formatNumber(cierreTurno.bs?.real_ingresado || 0, true)})` : ''}
      </div>

      <form id="form-arqueo">
        <div style="text-align: left; margin-bottom: 15px;">
          <label style="font-weight: 700; font-size: 14px; color: var(--color-primary-900);">
            💵 Conteo Físico de Dinero en Caja (Turno ${numTurno})
          </label>
          <p class="text-muted" style="margin: 2px 0 0 0; font-size: 12.5px;">
            Ingresa únicamente el dinero recibido durante este turno que vas a entregar.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px;">
          ${methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia'].includes(m.key)).map(m => {
            const isUsd = m.moneda === 'USD' || m.key === 'efectivo_usd';
            const defaultValue = (!store.isOperario() && m.key === 'pago_movil' && cierreTurno?.bs && typeof cierreTurno.bs.pago_movil === 'number')
              ? Utils.formatNumber(cierreTurno.bs.pago_movil, true)
              : '0,00';
            return `
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size: 13px; font-weight: 600;">${m.icon} ${m.label}</label>
                <div style="position:relative;">
                   <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--color-text-secondary); font-weight:bold; font-size:14px;">${isUsd ? '$' : 'Bs.'}</span>
                   <input type="text" inputmode="decimal" class="form-control currency-mask" name="arqueo_${m.key}" value="${defaultValue}" required style="font-size: 16px; font-weight: bold; padding-left: 40px;"/>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${moduloCaudalimetro ? `
          <div style="background: var(--color-bg-body, #F8FAFC); border: 1.5px solid #10B981; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h4 style="margin: 0; color: #047857; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                <span>⏱️</span> Reloj Medidor de Agua (${unidadCaudalimetro})
              </h4>
              <span style="font-size: 12px; color: var(--color-text-secondary); font-weight: 600;">Flujo Físico</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 12px; font-weight: 600;">🌅 Lectura Inicial (Apertura Turno)</label>
                <input type="number" step="any" class="form-control" name="caudalimetro_inicial" id="arqueo-caud-ini" value="${lecturaCaud.inicial !== null ? lecturaCaud.inicial : ''}" placeholder="Ej: 124500" style="font-weight: bold; font-size: 15px;" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 12px; font-weight: 600;">🌇 Lectura Final (Cierre Turno)</label>
                <input type="number" step="any" class="form-control" name="caudalimetro_final" id="arqueo-caud-fin" value="${lecturaCaud.final !== null ? lecturaCaud.final : ''}" placeholder="Ej: 126000" style="font-weight: bold; font-size: 15px;" />
              </div>
            </div>
          </div>
        ` : ''}

        <div class="form-group" style="margin-bottom: 20px;">
          <label class="form-label" style="font-size: 13px; font-weight: 600;">📝 Observaciones del Turno (Opcional)</label>
          <textarea class="form-control" name="observaciones" rows="2" placeholder="Ej: Novedades en caja, vueltos pendientes, billetes deteriorados..." style="font-size: 13.5px; width: 100%;"></textarea>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; height: 46px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
          🔒 Cerrar Turno ${numTurno} y Calcular Cuadre
        </button>
      </form>
    </div>
  `;

  setupCurrencyMasks(container);

  container.querySelector('#form-arqueo').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const declaracion = {};
    methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia'].includes(m.key)).forEach(m => {
      let rawVal = fd.get('arqueo_' + m.key) || '0';
      rawVal = rawVal.replace(/\./g, '').replace(',', '.');
      declaracion[m.key] = parseFloat(rawVal) || 0;
    });

    let lectCaud = null;
    if (store.getConfig('moduloCaudalimetro')) {
      const iniRaw = fd.get('caudalimetro_inicial');
      const finRaw = fd.get('caudalimetro_final');
      const iniVal = iniRaw !== null && iniRaw !== '' ? parseFloat(iniRaw) : null;
      const finVal = finRaw !== null && finRaw !== '' ? parseFloat(finRaw) : null;
      lectCaud = { inicial: iniVal, final: finVal };
      store.saveLecturaCaudalimetro(fecha, lectCaud);
    }

    const observaciones = (fd.get('observaciones') || '').trim();

    const ejecutarCierreTurno = () => {
      const turnoGuardado = store.saveTurnoCierre(fecha, declaracion, observaciones, lectCaud);
      showToast(`✅ Turno ${turnoGuardado.numeroTurno} cerrado exitosamente`, 'success');
      currentActiveTab = 'turno_' + turnoGuardado.id;
      const contentDiv = document.getElementById('cierre-caja-home-content');
      if (contentDiv) {
        renderCierre(contentDiv, fecha, currentActiveTab);
      } else {
        renderCierreContent(fecha, currentActiveTab);
      }
    };

    openModal({
      title: `⚠️ Confirmar Cierre de Turno ${numTurno}`,
      content: `
        <div style="padding: 10px 0;">
          <p style="font-size: 15px; font-weight: 700; color: var(--color-primary-900); margin-bottom: 8px;">
            ¿Estás seguro de que deseas procesar y finalizar el cierre del Turno ${numTurno}?
          </p>
          <p style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 15px; line-height: 1.4;">
            Verifica que hayas contado y declarado todos los montos físicos de este turno. Los montos se cuadrarán exclusivamente con las ventas realizadas entre <strong>${horaInicioStr}</strong> y ahora.
          </p>
          <div style="background: var(--color-bg); padding: 12px 14px; border-radius: 8px; font-size: 13.5px; border-left: 4px solid #10B981;">
            <div>💵 <strong>Efectivo USD:</strong> ${Utils.formatCurrency(declaracion.efectivo_usd || 0)}</div>
            <div style="margin-top: 4px;">🇻🇪 <strong>Efectivo Bs:</strong> Bs ${Utils.formatNumber(declaracion.efectivo_bs || 0, true)}</div>
            <div style="margin-top: 4px;">📲 <strong>Pago Móvil:</strong> Bs ${Utils.formatNumber(declaracion.pago_movil || 0, true)}</div>
            <div style="margin-top: 4px;">💳 <strong>Punto de Venta:</strong> Bs ${Utils.formatNumber(declaracion.punto_de_venta || 0, true)}</div>
          </div>
        </div>
      `,
      saveLabel: `Sí, Cerrar Turno ${numTurno}`,
      onSave: () => {
        closeModal();
        ejecutarCierreTurno();
      }
    });
  });
}

function renderCuadreTurnoTable(turno, methods) {
  let totalDiferenciaUsd = 0;
  let totalDiferenciaBs = 0;
  const cierreSistema = turno.sistema || store.getCierreCaja(turno.fecha, turno.inicio, turno.fin);
  const declaracion = turno.declaracion || {};

  const filas = methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia'].includes(m.key)).map(m => {
    const isUsd = m.moneda === 'USD' || m.key === 'efectivo_usd';
    const declarado = declaracion[m.key] || 0;
    const sistema = isUsd ? (cierreSistema[m.key] || 0) : (cierreSistema.bs ? (cierreSistema.bs[m.key] || 0) : 0);
    const dif = declarado - sistema;

    if (isUsd) totalDiferenciaUsd += dif;
    else totalDiferenciaBs += dif;

    let colorClass = '';
    if (Math.abs(dif) < 0.01) colorClass = 'text-muted';
    else if (dif > 0) colorClass = 'text-success font-bold';
    else colorClass = 'text-danger font-bold';

    const formatter = (val) => isUsd ? Utils.formatCurrency(val) : `Bs ${Utils.formatNumber(val, true)}`;

    return `
      <tr>
        <td>${m.icon} ${m.label}</td>
        <td style="text-align: right; font-weight: 600;">${formatter(declarado)}</td>
        <td style="text-align: right;">${formatter(sistema)}</td>
        <td style="text-align: right;" class="${colorClass}">${dif > 0 ? '+' : ''}${formatter(dif)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom: 20px; border-left: 4px solid var(--color-primary);">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <h3 class="card-title" style="margin: 0; font-size: 16px;">
          ⚖️ Cuadre de Turno ${turno.numeroTurno} (Físico vs Sistema de este Turno)
        </h3>
        <div style="font-size: 13px; color: var(--color-text-secondary);">
          ${cierreSistema.cantidadVentas} ${cierreSistema.cantidadVentas === 1 ? 'venta facturada' : 'ventas facturadas'}
        </div>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Método de Pago</th>
              <th style="text-align: right;">Físico Declarado</th>
              <th style="text-align: right;">Sistema (Ventas de este Turno)</th>
              <th style="text-align: right;">Diferencia del Turno</th>
            </tr>
          </thead>
          <tbody>
            ${filas}
          </tbody>
          <tfoot>
            <tr style="border-top: 2px solid var(--color-border);">
              <th colspan="3" style="text-align: right;">DIFERENCIA EN ESTE TURNO:</th>
              <th style="text-align: right; font-size: 15px;">
                <div class="${totalDiferenciaUsd >= -0.01 ? 'text-success' : 'text-danger'}">${totalDiferenciaUsd > 0 ? '+' : ''}${Utils.formatCurrency(totalDiferenciaUsd)}</div>
                <div class="${totalDiferenciaBs >= -0.01 ? 'text-success' : 'text-danger'}" style="font-size: 0.85em; margin-top:2px;">${totalDiferenciaBs > 0 ? '+' : ''}Bs ${Utils.formatNumber(totalDiferenciaBs, true)}</div>
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderDetalleTurnoCerrado(turno, methods, fecha, esUltimoTurno) {
  const cierreSistema = turno.sistema || store.getCierreCaja(turno.fecha, turno.inicio, turno.fin);
  const horaIniStr = formatHora(turno.inicio);
  const horaFinStr = formatHora(turno.fin);

  return `
    <!-- Header del Turno -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; background: #F1F5F9; padding: 14px 18px; border-radius: 10px; border: 1px solid #CBD5E1;">
      <div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="badge badge-success" style="font-size: 13px; padding: 5px 12px;">✅ Turno ${turno.numeroTurno} Cerrado</span>
          <span style="font-size: 13px; color: var(--color-text-secondary); font-weight: 600;">
            Cerrado por: ${turno.cerradoPor === 'admin' ? '👤 Administrador' : '💼 Operario'}
          </span>
        </div>
        <div style="margin-top: 6px; font-size: 14px; color: var(--color-primary-900); font-weight: 600;">
          🕒 Horario: ${horaIniStr} a ${horaFinStr}
        </div>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-sm btn-secondary btn-imprimir-ticket-turno" data-turno-id="${turno.id}" style="font-weight: 600;">
          🖨️ Imprimir Ticket Turno ${turno.numeroTurno}
        </button>
        ${esUltimoTurno ? `
          <button class="btn btn-sm btn-outline-danger btn-reabrir-turno" data-turno-id="${turno.id}" style="font-weight: 600;" title="Permite reabrir el turno para corregir el conteo">
            🔓 Reabrir / Corregir este Turno
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Cuadre del Turno -->
    ${renderCuadreTurnoTable(turno, methods)}

    <!-- Observaciones del Turno -->
    <div class="card" style="margin-bottom: 20px; border-left: 4px solid #3B82F6;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;">
        <h3 class="card-title" style="margin: 0; font-size: 15px;">📝 Observaciones del Turno ${turno.numeroTurno}</h3>
        <button class="btn btn-sm btn-secondary btn-edit-obs-turno" data-turno-id="${turno.id}" style="padding: 4px 10px; font-size: 12px;">✏️ Editar Nota</button>
      </div>
      <div style="padding: 14px 16px; font-size: 14px; color: ${turno.observaciones ? 'var(--color-text-main)' : 'var(--color-text-secondary)'}; font-style: ${turno.observaciones ? 'normal' : 'italic'};">
        ${Utils.escapeHtml(turno.observaciones || 'Sin observaciones registradas para este turno.')}
      </div>
    </div>

    <!-- Métricas del Turno (Para Admin) -->
    ${!store.isOperario() ? `
      <div class="metrics-grid" style="grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
        <div class="metric-card accent" style="padding: 14px; border-radius: 8px;">
          <div class="metric-label">Ingreso Real en este Turno</div>
          <div class="metric-value" style="font-size: var(--font-size-xl); margin: 0;">
            ${Utils.formatCurrency(cierreSistema.real_ingresado)}
            <small style="font-size:0.5em; opacity:0.8; font-weight:normal; display:block;">Bs ${Utils.formatNumber(cierreSistema.bs?.real_ingresado || 0, true)}</small>
          </div>
        </div>
        <div class="metric-card" style="padding: 14px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
          <div class="metric-label">Ventas Totales en este Turno</div>
          <div class="metric-value" style="font-size: var(--font-size-xl); margin: 0;">
            ${Utils.formatCurrency(cierreSistema.total)}
            <small style="font-size:0.5em; opacity:0.8; font-weight:normal; display:block; color:var(--color-text-secondary);">Bs ${Utils.formatNumber(cierreSistema.bs?.total || 0, true)}</small>
          </div>
        </div>
        <div class="metric-card" style="padding: 14px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
          <div class="metric-label">Operaciones Facturadas</div>
          <div class="metric-value" style="font-size: var(--font-size-xl); margin: 0;">
            ${cierreSistema.cantidadVentas}
            <small style="font-size:0.5em; opacity:0.8; font-weight:normal; display:block; color:var(--color-text-secondary);">${cierreSistema.botellones || 0} botellones</small>
          </div>
        </div>
      </div>
    ` : ''}
  `;
}

function renderConsolidadoZ(turnos, fecha, methods) {
  const cierreGlobal = store.getCierreCaja(fecha);
  const arqueoConsolidado = store.getArqueo(fecha);
  const moduloCaudalimetro = store.getConfig('moduloCaudalimetro') || false;
  const unidadCaudalimetro = store.getConfig('unidadCaudalimetro') || 'L';
  const lecturaCaud = store.getLecturaCaudalimetro(fecha);

  const ventasDia = (store.getAll('ventas') || []).filter(v => v.fecha && v.fecha.startsWith(fecha));
  const litrosFacturados = ventasDia.reduce((s, v) => s + (parseFloat(v.litrosTotales) || (parseInt(v.botellones) || 0) * 20 || 0), 0);
  const mermasLavadoDia = ventasDia.reduce((s, v) => {
    if (v.litrosMermaLavado !== undefined) return s + (parseFloat(v.litrosMermaLavado) || 0);
    const nominal = (parseFloat(v.litrosTotales) || (parseInt(v.botellones) || 0) * 20 || 0);
    return s + (store.calcularMermaLavado ? store.calcularMermaLavado(nominal) : (nominal * 0.05));
  }, 0);
  const mermasDia = (store.getAll('mermas') || []).filter(m => m.fecha && m.fecha.startsWith(fecha));
  const litrosMermas = mermasDia.reduce((s, m) => s + (parseInt(m.litros) || 0), 0);
  const totalAguaSistema = Math.round((litrosFacturados + mermasLavadoDia + litrosMermas) * 100) / 100;
  const diffAgua = Math.round((lecturaCaud.litrosReloj - totalAguaSistema) * 100) / 100;

  // Filas del desglose de turnos
  let totalTurnosVentas = 0;
  let totalTurnosUSD = 0;
  let totalTurnosBs = 0;

  const filasTurnos = turnos.map(t => {
    const sist = t.sistema || store.getCierreCaja(t.fecha, t.inicio, t.fin);
    totalTurnosVentas += (sist.cantidadVentas || 0);

    // Sumar físico declarado en ese turno
    let declUsd = 0;
    let declBs = 0;
    if (t.declaracion) {
      methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia'].includes(m.key)).forEach(m => {
        const val = t.declaracion[m.key] || 0;
        if (m.moneda === 'USD' || m.key === 'efectivo_usd') declUsd += val;
        else declBs += val;
      });
    }
    totalTurnosUSD += declUsd;
    totalTurnosBs += declBs;

    return `
      <tr>
        <td style="font-weight: 700; color: var(--color-primary-900);">Turno ${t.numeroTurno}</td>
        <td>${formatHora(t.inicio)} - ${formatHora(t.fin)}</td>
        <td><span class="badge ${t.cerradoPor === 'admin' ? 'badge-primary' : 'badge-secondary'}">${t.cerradoPor === 'admin' ? 'Admin' : 'Operario'}</span></td>
        <td style="text-align: center;">${sist.cantidadVentas || 0}</td>
        <td style="text-align: right; font-weight: 600; color: #047857;">${Utils.formatCurrency(declUsd)}</td>
        <td style="text-align: right; font-weight: 600; color: #1E40AF;">Bs ${Utils.formatNumber(declBs, true)}</td>
        <td style="text-align: center;">
          <button class="btn btn-xs btn-secondary btn-ver-turno-tab" data-tab-id="turno_${t.id}" title="Ver detalle">🔍 Ver Cuadre</button>
        </td>
      </tr>
    `;
  }).join('');

  // Cuadre consolidado global
  let totalDiferenciaUsd = 0;
  let totalDiferenciaBs = 0;
  const declaracionConsolidada = arqueoConsolidado?.declaracion || {};

  const filasMetodos = methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia'].includes(m.key)).map(m => {
    const isUsd = m.moneda === 'USD' || m.key === 'efectivo_usd';
    const declarado = declaracionConsolidada[m.key] || 0;
    const sistema = isUsd ? (cierreGlobal[m.key] || 0) : (cierreGlobal.bs ? (cierreGlobal.bs[m.key] || 0) : 0);
    const dif = declarado - sistema;

    if (isUsd) totalDiferenciaUsd += dif;
    else totalDiferenciaBs += dif;

    let colorClass = '';
    if (Math.abs(dif) < 0.01) colorClass = 'text-muted';
    else if (dif > 0) colorClass = 'text-success font-bold';
    else colorClass = 'text-danger font-bold';

    const formatter = (val) => isUsd ? Utils.formatCurrency(val) : `Bs ${Utils.formatNumber(val, true)}`;

    return `
      <tr>
        <td>${m.icon} ${m.label}</td>
        <td style="text-align: right; font-weight: 600;">${formatter(declarado)}</td>
        <td style="text-align: right;">${formatter(sistema)}</td>
        <td style="text-align: right;" class="${colorClass}">${dif > 0 ? '+' : ''}${formatter(dif)}</td>
      </tr>
    `;
  }).join('');

  return `
    <!-- Header Z -->
    <div style="background: linear-gradient(135deg, #0F172A, #1E293B); color: white; padding: 18px 22px; border-radius: 12px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
      <div>
        <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8; font-weight: 600;">Reporte Z Consolidado</div>
        <h2 style="margin: 4px 0 0 0; color: white; font-size: 22px; font-weight: 800;">
          ${Utils.escapeHtml(store.getConfig('empresaNombre') || 'Tu Empresa')} - Cierre del Día
        </h2>
        <div style="margin-top: 4px; font-size: 13.5px; opacity: 0.85;">
          📅 Fecha: ${Utils.formatDate(fecha)} | ${turnos.length} ${turnos.length === 1 ? 'Turno Registrado' : 'Turnos Registrados'}
        </div>
      </div>
      <div>
        <button id="btn-imprimir-reporte-z" class="btn btn-primary" style="font-weight: 700; height: 40px; padding: 0 16px;">
          📄 Imprimir Reporte Z (PDF)
        </button>
      </div>
    </div>

    <!-- Tabla Desglose de Turnos del Día -->
    <div class="card" style="margin-bottom: 22px; border-left: 4px solid #3B82F6;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 class="card-title" style="margin: 0; font-size: 16px;">📋 Desglose de Turnos Realizados en el Día</h3>
        <span class="badge badge-info">${turnos.length} ${turnos.length === 1 ? 'Turno' : 'Turnos'}</span>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Turno</th>
              <th>Horario</th>
              <th>Cerrado Por</th>
              <th style="text-align: center;">Ventas</th>
              <th style="text-align: right;">Total Físico ($)</th>
              <th style="text-align: right;">Total Físico (Bs)</th>
              <th style="text-align: center; width: 110px;">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${filasTurnos}
          </tbody>
          <tfoot>
            <tr style="border-top: 2px solid var(--color-border); font-weight: bold; background: #F8FAFC;">
              <td colspan="3" style="text-align: right;">TOTAL SUMA DE TURNOS:</td>
              <td style="text-align: center;">${totalTurnosVentas}</td>
              <td style="text-align: right; color: #047857;">${Utils.formatCurrency(totalTurnosUSD)}</td>
              <td style="text-align: right; color: #1E40AF;">Bs ${Utils.formatNumber(totalTurnosBs, true)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Cuadre Consolidado del Día (Físico vs Sistema) -->
    <div class="card" style="margin-bottom: 22px; border-left: 4px solid var(--color-primary);">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 class="card-title" style="margin: 0; font-size: 16px;">
          ⚖️ Cuadre Consolidado del Día (Suma de Todos los Turnos vs Total Sistema)
        </h3>
      </div>
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Método de Pago</th>
              <th style="text-align: right;">Total Físico Declarado (Todos los Turnos)</th>
              <th style="text-align: right;">Total Sistema del Día</th>
              <th style="text-align: right;">Diferencia Global</th>
            </tr>
          </thead>
          <tbody>
            ${filasMetodos}
          </tbody>
          <tfoot>
            <tr style="border-top: 2px solid var(--color-border);">
              <th colspan="3" style="text-align: right;">FALTANTE / SOBRANTE GLOBAL DEL DÍA:</th>
              <th style="text-align: right; font-size: 16px;">
                <div class="${totalDiferenciaUsd >= -0.01 ? 'text-success' : 'text-danger'}">${totalDiferenciaUsd > 0 ? '+' : ''}${Utils.formatCurrency(totalDiferenciaUsd)}</div>
                <div class="${totalDiferenciaBs >= -0.01 ? 'text-success' : 'text-danger'}" style="font-size: 0.85em; margin-top:2px;">${totalDiferenciaBs > 0 ? '+' : ''}Bs ${Utils.formatNumber(totalDiferenciaBs, true)}</div>
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Métricas Principales de Caja y Ventas (Solo Administrador) -->
    ${!store.isOperario() ? `
    <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
      <div class="metric-card accent" style="padding: 15px; border-radius: 8px;">
        <div class="metric-label">Ingreso Real en Caja</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); margin: 0;">${Utils.formatCurrency(cierreGlobal.real_ingresado)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block;">Bs ${Utils.formatNumber(cierreGlobal.bs && cierreGlobal.bs.real_ingresado ? cierreGlobal.bs.real_ingresado : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px; color: rgba(255,255,255,0.85);">(Contado + Abonos de hoy)</div>
      </div>
      <div class="metric-card" style="padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
        <div class="metric-label">Total Ventas (Valor)</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); margin: 0;">${Utils.formatCurrency(cierreGlobal.total)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block; color:var(--color-text-secondary);">Bs ${Utils.formatNumber(cierreGlobal.bs && cierreGlobal.bs.total ? cierreGlobal.bs.total : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px;">(Contado + Crédito de hoy)</div>
      </div>
      <div class="metric-card" style="padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
        <div class="metric-label">Crédito Nuevo (Hoy)</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); color: var(--color-danger); margin: 0;">${Utils.formatCurrency(cierreGlobal.credito)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block;">Bs ${Utils.formatNumber(cierreGlobal.bs && cierreGlobal.bs.credito ? cierreGlobal.bs.credito : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px;">(Por cobrar hoy)</div>
      </div>
      <div class="metric-card" style="padding: 15px; border-radius: 8px; border: 1px solid var(--color-border); background: var(--color-surface);">
        <div class="metric-label">Crédito Cobrado (Abonos)</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); color: var(--color-success); margin: 0;">${Utils.formatCurrency(cierreGlobal.cobros_credito)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block;">Bs ${Utils.formatNumber(cierreGlobal.bs && cierreGlobal.bs.cobros_credito ? cierreGlobal.bs.cobros_credito : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px;">(Recuperado hoy)</div>
      </div>
    </div>
    ` : ''}

    ${moduloCaudalimetro ? `
      <!-- Auditoría de Caudalímetro -->
      <div class="card" style="margin-bottom: 20px; border-left: 4px solid #10B981;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;">
          <h3 class="card-title" style="margin: 0; font-size: 15px; display: flex; align-items: center; gap: 8px;">
            <span>⏱️</span> Auditoría de Agua del Día (Reloj Medidor vs. Sistema)
          </h3>
          <button id="btn-edit-caudalimetro-cierre" class="btn btn-sm btn-secondary" style="padding: 4px 10px; font-size: 12px;">✏️ Editar Lecturas</button>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Concepto de Medición</th>
                <th style="text-align: right;">Lectura Reloj (${unidadCaudalimetro})</th>
                <th style="text-align: right;">Litros Calculados</th>
                <th style="text-align: right;">Estado / Cuadre</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>🌅 Lectura Inicial (Apertura)</td>
                <td style="text-align: right; font-weight: bold;">${lecturaCaud.inicial !== null ? lecturaCaud.inicial.toLocaleString() : '<span class="text-muted">No registrada</span>'}</td>
                <td style="text-align: right; color: var(--color-text-secondary);">-</td>
                <td style="text-align: right;"><span class="badge badge-secondary">${lecturaCaud.horaInicial || 'Mañana'}</span></td>
              </tr>
              <tr>
                <td>🌇 Lectura Final (Cierre)</td>
                <td style="text-align: right; font-weight: bold;">${lecturaCaud.final !== null ? lecturaCaud.final.toLocaleString() : '<span class="text-muted">No registrada</span>'}</td>
                <td style="text-align: right; color: var(--color-text-secondary);">-</td>
                <td style="text-align: right;"><span class="badge badge-secondary">${lecturaCaud.horaFinal || 'Tarde/Noche'}</span></td>
              </tr>
              <tr style="background: rgba(16, 185, 129, 0.05); font-weight: bold;">
                <td>🌊 <strong>Agua Total según Reloj Físico:</strong></td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right; font-size: 15px; color: #047857;">${lecturaCaud.litrosReloj.toLocaleString()} Litros</td>
                <td style="text-align: right;"><span class="badge badge-success">Flujo Físico</span></td>
              </tr>
              <tr>
                <td>💧 Ventas Facturadas (Entregadas a Clientes)</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right;">${litrosFacturados.toLocaleString()} Litros</td>
                <td style="text-align: right;"><span class="badge badge-info">${ventasDia.length} ventas</span></td>
              </tr>
              <tr>
                <td>🧼 Merma de Lavado de Botellones</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right;">${mermasLavadoDia.toLocaleString()} Litros</td>
                <td style="text-align: right;"><span class="badge" style="background: #E0F2FE; color: #0369A1; font-weight: 600;">Enjuague</span></td>
              </tr>
              ${litrosMermas > 0 ? `
              <tr>
                <td>🧹 Mermas Manuales (Tanque / Filtros)</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right;">${litrosMermas.toLocaleString()} Litros</td>
                <td style="text-align: right;"><span class="badge badge-warning">${mermasDia.length} mermas</span></td>
              </tr>
              ` : ''}
              <tr style="background: #F8FAFC; font-weight: 600;">
                <td>📊 Total Agua Justificada por Sistema</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right;">${totalAguaSistema.toLocaleString()} Litros</td>
                <td style="text-align: right;"><span class="badge badge-secondary">Facturado + Mermas</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="border-top: 2px solid var(--color-border); font-size: 14px;">
                <th colspan="2" style="text-align: right;">DIFERENCIA DE AGUA (Reloj - Sistema):</th>
                <th style="text-align: right; font-size: 16px;">
                  <span class="${diffAgua === 0 ? 'text-success' : (diffAgua > 0 ? 'text-danger' : 'text-info')}" style="font-weight: 800;">
                    ${diffAgua > 0 ? '+' : ''}${diffAgua.toLocaleString()} Litros
                  </span>
                </th>
                <th style="text-align: right; font-size: 11px;">
                  ${diffAgua === 0 
                    ? '<span class="badge badge-success">✅ Cuadre Perfecto</span>' 
                    : (diffAgua > 0 
                      ? '<span class="badge badge-danger">⚠️ Posible merma no registrada</span>' 
                      : '<span class="badge badge-info">ℹ️ Menos flujo que ventas</span>')}
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- Detalle de Abonos/Cobros Recibidos Hoy -->
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-header">
        <h3 class="card-title">📖 Detalle de Cobros / Abonos del Día (${cierreGlobal.abonosDetalle ? cierreGlobal.abonosDetalle.length : 0})</h3>
      </div>
      ${cierreGlobal.abonosDetalle && cierreGlobal.abonosDetalle.length > 0 ? `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Monto Recibido</th>
                <th>Método de Pago</th>
                <th>Referencia</th>
                <th style="text-align: center; width: 70px;">Acción</th>
              </tr>
            </thead>
            <tbody>
              ${cierreGlobal.abonosDetalle.map(a => {
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
                    <td style="text-align: center;">
                      <button class="btn btn-sm btn-danger btn-delete-abono" data-id="${a.id}" data-monto="${a.monto}" data-cliente="${Utils.escapeHtml(nombreCliente)}" title="Anular este abono" style="padding: 2px 7px; font-size: 11px;">🗑️</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--color-text-muted);">No se registraron abonos el día de hoy.</div>'}
    </div>

    <!-- Detalle de Propinas por Punto/Banco Recibidas Hoy -->
    <div class="card" style="margin-bottom: 20px; border-left: 4px solid #F59E0B;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <h3 class="card-title" style="margin: 0; display: flex; align-items: center; gap: 8px;">
          <span>🎁</span> Propinas por Punto/Banco del Día (${cierreGlobal.propinasDetalle ? cierreGlobal.propinasDetalle.length : 0})
        </h3>
        <div style="font-size: 14px; font-weight: bold; color: #B45309;">
          Total a Entregar: ${Utils.formatCurrency(cierreGlobal.totalPropinasUSD || 0)} <span style="font-size: 12px; color: var(--color-text-secondary);">(Bs ${Utils.formatNumber(cierreGlobal.totalPropinasBs || 0, true)})</span>
        </div>
      </div>
      ${cierreGlobal.propinasDetalle && cierreGlobal.propinasDetalle.length > 0 ? `
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Método de Pago</th>
                <th>Referencia Voucher</th>
                <th>Nota / Destinatario</th>
                <th style="text-align: right;">Monto (Bs)</th>
                <th style="text-align: right;">Monto ($)</th>
                <th style="text-align: center;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${cierreGlobal.propinasDetalle.map(p => {
                const horaStr = new Date(p.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
                const foundMethod = methods.find(m => m.key === p.metodo);
                const metodoStr = foundMethod ? `${foundMethod.icon} ${foundMethod.label}` : (p.metodo === 'punto' ? '💳 Punto de Venta' : p.metodo);
                const montoBs = p.moneda === 'Bs' || p.moneda === 'VES' ? p.monto : (p.monto * (p.tasa || 40));
                const montoUSD = p.moneda === 'USD' ? p.monto : (p.monto / (p.tasa || 40));
                return `
                  <tr>
                    <td class="text-muted">${horaStr}</td>
                    <td>${metodoStr}</td>
                    <td class="font-semibold text-primary" style="letter-spacing: 0.5px;">${Utils.escapeHtml(p.referencia || '-')}</td>
                    <td class="text-muted">${Utils.escapeHtml(p.nota || 'Personal de turno')}</td>
                    <td style="text-align: right; font-weight: bold; color: #92400E;">Bs ${Utils.formatNumber(montoBs, true)}</td>
                    <td style="text-align: right; font-weight: bold; color: #047857;">${Utils.formatCurrency(montoUSD)}</td>
                    <td style="text-align: center;">
                      <button class="btn btn-xs btn-danger btn-delete-propina" data-id="${p.id}" title="Eliminar registro de propina">🗑️</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="background: rgba(245, 158, 11, 0.08); font-weight: bold;">
                <td colspan="4" style="text-align: right;">TOTAL PROPINAS A ENTREGAR:</td>
                <td style="text-align: right; color: #92400E; font-size: 15px;">Bs ${Utils.formatNumber(cierreGlobal.totalPropinasBs || 0, true)}</td>
                <td style="text-align: right; color: #047857; font-size: 15px;">${Utils.formatCurrency(cierreGlobal.totalPropinasUSD || 0)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : '<div class="empty-state" style="padding: 20px; text-align: center; color: var(--color-text-muted);">No se registraron propinas por punto o banco en esta fecha.</div>'}
    </div>
  `;
}

function imprimirTicketTurno(turno) {
  const methods = getMethodsList();
  const cierreSistema = turno.sistema || store.getCierreCaja(turno.fecha, turno.inicio, turno.fin);
  const declaracion = turno.declaracion || {};
  const horaIni = formatHora(turno.inicio);
  const horaFin = formatHora(turno.fin);

  let totalDiferenciaUsd = 0;
  let totalDiferenciaBs = 0;

  const filas = methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia'].includes(m.key)).map(m => {
    const isUsd = m.moneda === 'USD' || m.key === 'efectivo_usd';
    const declarado = declaracion[m.key] || 0;
    const sistema = isUsd ? (cierreSistema[m.key] || 0) : (cierreSistema.bs ? (cierreSistema.bs[m.key] || 0) : 0);
    const dif = declarado - sistema;
    if (isUsd) totalDiferenciaUsd += dif;
    else totalDiferenciaBs += dif;

    const formatter = (v) => isUsd ? Utils.formatCurrency(v) : `Bs ${Utils.formatNumber(v, true)}`;
    return `
      <tr>
        <td style="padding: 4px 0;">${m.label.toUpperCase()}</td>
        <td style="text-align: right; padding: 4px 0;">${formatter(declarado)}</td>
        <td style="text-align: right; padding: 4px 0;">${formatter(sistema)}</td>
        <td style="text-align: right; padding: 4px 0; font-weight: bold;">${dif > 0 ? '+' : ''}${formatter(dif)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; padding: 20px; line-height: 1.4; font-size: 13px; max-width: 500px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 15px;">
        <div style="font-size: 18px; font-weight: bold; letter-spacing: 1px;">*** ${Utils.escapeHtml(store.getConfig('empresaNombre') || 'TU EMPRESA')} ***</div>
        <div style="font-size: 15px; font-weight: bold; margin-top: 4px;">COMPROBANTE DE CIERRE - TURNO ${turno.numeroTurno}</div>
        <div style="font-size: 12px; margin-top: 4px;">FECHA: ${turno.fecha} | HORARIO: ${horaIni} - ${horaFin}</div>
        <div style="font-size: 12px;">CAJERO / ROL: ${(turno.cerradoPor || 'OPERARIO').toUpperCase()}</div>
        <div style="border-top: 2px dashed #000; margin-top: 10px; margin-bottom: 8px;"></div>
      </div>

      <div style="margin-bottom: 15px;">
        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">[ CUADRE FÍSICO DE CAJA (TURNO ${turno.numeroTurno}) ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 4px 0;">MÉTODO</th>
              <th style="text-align: right; padding: 4px 0;">DECLARADO</th>
              <th style="text-align: right; padding: 4px 0;">SISTEMA</th>
              <th style="text-align: right; padding: 4px 0;">DIFERENCIA</th>
            </tr>
          </thead>
          <tbody>
            ${filas}
          </tbody>
          <tfoot>
            <tr style="border-top: 1px solid #000;">
              <td colspan="3" style="text-align: right; padding: 4px 0; font-weight: bold;">DIFERENCIA USD:</td>
              <td style="text-align: right; padding: 4px 0; font-weight: bold; font-size: 12px;">${totalDiferenciaUsd > 0 ? '+' : ''}${Utils.formatCurrency(totalDiferenciaUsd)}</td>
            </tr>
            <tr>
              <td colspan="3" style="text-align: right; padding: 0 0 4px 0; font-weight: bold;">DIFERENCIA Bs:</td>
              <td style="text-align: right; padding: 0 0 4px 0; font-weight: bold; font-size: 12px;">${totalDiferenciaBs > 0 ? '+' : ''}Bs ${Utils.formatNumber(totalDiferenciaBs, true)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${turno.observaciones ? `
        <div style="margin-bottom: 15px; padding: 6px 8px; border: 1px dashed #000; font-size: 11px;">
          <b>OBSERVACIONES:</b> ${Utils.escapeHtml(turno.observaciones)}
        </div>
      ` : ''}

      <div style="border-top: 1px dashed #000; margin-top: 10px; margin-bottom: 10px;"></div>
      <div style="text-align: center; font-size: 11px; color: #555;">
        VENTAS FACTURADAS EN ESTE TURNO: ${cierreSistema.cantidadVentas || 0}<br>
        *** FIN TICKET DE TURNO ***
      </div>
    </div>
  `;

  const opt = {
    margin:       0.4,
    filename:     `Cierre_Turno_${turno.numeroTurno}_${turno.fecha}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  if (window.html2pdf) {
    window.html2pdf().set(opt).from(html).save();
  } else {
    alert("La librería PDF no está disponible.");
  }
}

function renderCierreContent(fecha, activeTab = null) {
  const container = document.getElementById('cierre-content');
  if (!container) return;

  const turnos = store.getTurnos(fecha);
  const infoActivo = store.getTurnoActivoInfo(fecha);
  const methods = getMethodsList();

  // Si no hay turnos cerrados todavía, renderizar directamente el formulario del Turno 1
  if (turnos.length === 0) {
    renderFormularioArqueo(container, fecha, infoActivo, methods);
    return;
  }

  // Determinar pestaña activa
  if (!activeTab) {
    if (currentActiveTab) {
      activeTab = currentActiveTab;
    } else {
      // Si hay ventas pendientes en el turno activo, resaltar el turno en curso
      if (infoActivo.cierreSistema.cantidadVentas > 0) {
        activeTab = 'nuevo_turno';
      } else {
        // Por defecto mostrar el último turno cerrado
        activeTab = 'turno_' + turnos[turnos.length - 1].id;
      }
    }
  }

  // Asegurar que activeTab existe
  const tabValida = (activeTab === 'nuevo_turno' || activeTab === 'consolidado_z' || turnos.some(t => 'turno_' + t.id === activeTab));
  if (!tabValida) {
    activeTab = 'turno_' + turnos[turnos.length - 1].id;
  }
  currentActiveTab = activeTab;

  // Renderizar Barra de Navegación de Pestañas
  const tabsHtml = `
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; border-bottom: 2px solid var(--color-border); padding-bottom: 12px; align-items: center;">
      ${turnos.map(t => {
        const isTabSelected = (activeTab === 'turno_' + t.id);
        return `
          <button class="btn btn-sm ${isTabSelected ? 'btn-primary' : 'btn-secondary'} btn-shift-tab" data-tab-id="turno_${t.id}" style="font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <span>🕒 Turno ${t.numeroTurno}</span>
            <small style="opacity: 0.8; font-size: 11px;">(${formatHora(t.fin)})</small>
          </button>
        `;
      }).join('')}

      <button class="btn btn-sm ${activeTab === 'nuevo_turno' ? 'btn-primary' : 'btn-outline-primary'} btn-shift-tab" data-tab-id="nuevo_turno" style="font-weight: 700; display: flex; align-items: center; gap: 6px; border: 1.5px dashed var(--color-primary);">
        <span>➕ Turno ${infoActivo.numeroTurno}</span>
        ${infoActivo.cierreSistema.cantidadVentas > 0 
          ? `<span class="badge badge-warning" style="font-size: 10px; padding: 2px 6px;">${infoActivo.cierreSistema.cantidadVentas} vtas</span>` 
          : '<small style="opacity:0.8; font-size: 11px;">(En Curso)</small>'}
      </button>

      <button class="btn btn-sm ${activeTab === 'consolidado_z' ? 'btn-primary' : 'btn-secondary'} btn-shift-tab" data-tab-id="consolidado_z" style="font-weight: 700; margin-left: auto; display: flex; align-items: center; gap: 6px; background: ${activeTab === 'consolidado_z' ? '#0F172A' : '#334155'}; color: white;">
        <span>📊 Cierre Consolidado Z</span>
        <span class="badge" style="background: rgba(255,255,255,0.25); color: white; font-size: 11px;">${turnos.length} ${turnos.length === 1 ? 'Turno' : 'Turnos'}</span>
      </button>
    </div>

    <div id="shift-content-pane"></div>
  `;

  container.innerHTML = tabsHtml;

  const pane = container.querySelector('#shift-content-pane');

  // Renderizar contenido según la pestaña seleccionada
  if (activeTab === 'nuevo_turno') {
    renderFormularioArqueo(pane, fecha, infoActivo, methods);
  } else if (activeTab === 'consolidado_z') {
    pane.innerHTML = renderConsolidadoZ(turnos, fecha, methods);
    
    // Listeners del Reporte Z
    const btnPrintZ = pane.querySelector('#btn-imprimir-reporte-z');
    if (btnPrintZ) {
      btnPrintZ.addEventListener('click', () => {
        document.getElementById('btn-generar-pdf-home')?.click();
      });
    }

    pane.querySelectorAll('.btn-ver-turno-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.tabId;
        renderCierreContent(fecha, tid);
      });
    });
  } else if (activeTab.startsWith('turno_')) {
    const turnoId = activeTab.replace('turno_', '');
    const turno = turnos.find(t => t.id === turnoId);
    if (turno) {
      const esUltimo = (turnos[turnos.length - 1].id === turno.id);
      pane.innerHTML = renderDetalleTurnoCerrado(turno, methods, fecha, esUltimo);

      // Listener Imprimir Ticket
      pane.querySelectorAll('.btn-imprimir-ticket-turno').forEach(btn => {
        btn.addEventListener('click', () => imprimirTicketTurno(turno));
      });

      // Listener Editar Nota Turno
      const btnEditObs = pane.querySelector('.btn-edit-obs-turno');
      if (btnEditObs) {
        btnEditObs.addEventListener('click', () => {
          const currentObs = turno.observaciones || '';
          openModal({
            title: `Observaciones del Turno ${turno.numeroTurno}`,
            content: `
              <form id="form-edit-obs-turno">
                <div class="form-group">
                  <label class="form-label">Escribe el motivo o detalle de las diferencias:</label>
                  <textarea class="form-control" name="nuevaObservacion" rows="4" placeholder="Ej: Motivo de faltante/sobrante, vueltos pendientes..." style="font-size: 14px; width: 100%;">${Utils.escapeHtml(currentObs)}</textarea>
                </div>
              </form>
            `,
            saveLabel: 'Guardar Observación',
            onSave: (overlay) => {
              const form = overlay.querySelector('#form-edit-obs-turno');
              const fd = new FormData(form);
              const nuevaObs = (fd.get('nuevaObservacion') || '').trim();
              store.updateTurnoObservacion(turno.id, nuevaObs);
              closeModal();
              showToast('Observación actualizada correctamente', 'success');
              renderCierreContent(fecha, activeTab);
            }
          });
        });
      }

      // Listener Reabrir / Corregir Turno
      const btnReabrir = pane.querySelector('.btn-reabrir-turno');
      if (btnReabrir) {
        btnReabrir.addEventListener('click', () => {
          const procederReabrirTurno = () => {
            openModal({
              title: `🔓 Reabrir / Corregir Turno ${turno.numeroTurno}`,
              content: `
                <div style="padding: 10px 0;">
                  <p style="font-size: 14.5px; margin-bottom: 8px; font-weight: 700; color: var(--color-danger);">
                    ¿Deseas anular el cierre del Turno ${turno.numeroTurno} y reabrir el conteo?
                  </p>
                  <p class="text-muted" style="font-size: 13px; line-height: 1.4;">
                    El conteo físico registrado para el Turno ${turno.numeroTurno} será retirado para que puedas contar e ingresar nuevamente los montos de la caja.
                  </p>
                </div>
              `,
              saveLabel: 'Sí, Reabrir Turno',
              onSave: () => {
                store.deleteUltimoTurno(fecha);
                closeModal();
                showToast(`Turno ${turno.numeroTurno} reabierto para nuevo conteo`, 'info');
                currentActiveTab = 'nuevo_turno';
                renderCierreContent(fecha, 'nuevo_turno');
              }
            });
          };

          if (store.isOperario()) {
            openModal({
              title: '🔒 Autorización de Administrador',
              content: `
                <div style="padding: 10px 0;">
                  <p style="font-size: 13.5px; color: var(--color-danger); margin-bottom: 8px; font-weight: 600;">
                    ⚠️ Reabrir o anular cierre de turno
                  </p>
                  <p style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 12px;">
                    Esta acción modifica los cierres del día. Ingrese la contraseña del Administrador:
                  </p>
                  <input type="password" id="input-reabrir-turno-admin-pwd" class="form-control" placeholder="Contraseña de Administrador" autofocus style="font-size: 15px;" onkeydown="if(event.key === 'Enter') document.getElementById('btn-modal-save')?.click()"/>
                </div>
              `,
              saveLabel: 'Autorizar y Continuar',
              onSave: (overlay) => {
                const pwd = overlay.querySelector('#input-reabrir-turno-admin-pwd')?.value || '';
                if (store.checkAdminPassword(pwd)) {
                  closeModal();
                  procederReabrirTurno();
                } else {
                  showToast('Contraseña de administrador incorrecta', 'danger');
                  const inp = overlay.querySelector('#input-reabrir-turno-admin-pwd');
                  if (inp) { inp.value = ''; inp.focus(); }
                }
              }
            });
            setTimeout(() => {
              const inp = document.getElementById('input-reabrir-turno-admin-pwd');
              if (inp) inp.focus();
            }, 150);
          } else {
            procederReabrirTurno();
          }
        });
      }
    }
  }

  // Wire up Tab Buttons Click
  container.querySelectorAll('.btn-shift-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.dataset.tabId;
      renderCierreContent(fecha, tid);
    });
  });

  // Global delete abono / propina / edit caudalimetro listeners (si están presentes en el DOM)
  container.querySelectorAll('.btn-delete-propina').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.dataset.id;
      openModal({
        title: 'Eliminar Propina',
        content: '<p>¿Estás seguro de que deseas eliminar este registro de propina?</p>',
        saveLabel: 'Sí, Eliminar',
        onSave: () => {
          store.delete('propinas', pid);
          closeModal();
          showToast('Registro de propina eliminado', 'info');
          renderCierreContent(fecha, activeTab);
        }
      });
    });
  });

  container.querySelectorAll('.btn-delete-abono').forEach(btn => {
    btn.addEventListener('click', () => {
      const abonoId = btn.dataset.id;
      const montoVal = parseFloat(btn.dataset.monto) || 0;
      const clienteNom = btn.dataset.cliente || 'Cliente';
      openModal({
        title: 'Anular / Eliminar Abono',
        content: `
          <p>¿Estás seguro de que deseas anular este abono de <strong>${Utils.formatCurrency(montoVal)}</strong> de <strong>${clienteNom}</strong>?</p>
          <p class="text-muted" style="font-size: 13px; margin-top: 8px;">
            ⚠️ Esta acción eliminará el abono del sistema, recalculará los montos del Cierre de Caja y ajustará la cuenta del cliente.
          </p>
        `,
        saveLabel: 'Sí, Anular Abono',
        onSave: () => {
          store.delete('abonos', abonoId);
          closeModal();
          showToast('Abono anulado y caja recalculada con éxito', 'success');
          renderCierreContent(fecha, activeTab);
        }
      });
    });
  });

  const btnEditCaud = container.querySelector('#btn-edit-caudalimetro-cierre');
  if (btnEditCaud) {
    btnEditCaud.addEventListener('click', () => {
      const activeFecha = document.getElementById('cierre-fecha-home')?.value || fecha;
      openModalCaudalimetro(activeFecha, () => {
        renderCierreContent(activeFecha, activeTab);
      });
    });
  }
}

// Función auxiliar para generar el HTML con estilo de impresora matricial para el PDF del Reporte Z
export function getMatricialReportHTML(fecha) {
  const cierre = store.getCierreCaja(fecha);
  const arqueo = store.getArqueo(fecha);
  const turnos = store.getTurnos(fecha);
  const allMetodos = store.getMetodosPago(false);

  const methodsArqueo = allMetodos.map(m => ({
    key: m.id,
    label: m.label,
    icon: m.icon || '💳',
    moneda: m.moneda || 'Bs'
  }));

  // Sección Desglose de Turnos
  let turnosHtml = '';
  if (turnos.length > 0) {
    const filasTurnos = turnos.map(t => {
      const sist = t.sistema || store.getCierreCaja(t.fecha, t.inicio, t.fin);
      const decl = t.declaracion || {};
      let usd = 0;
      let bs = 0;
      methodsArqueo.forEach(m => {
        const val = decl[m.key] || 0;
        if (m.moneda === 'USD' || m.key === 'efectivo_usd') usd += val;
        else bs += val;
      });
      return `
        <tr>
          <td style="padding: 3px 0; font-weight: bold;">TURNO ${t.numeroTurno} (${formatHora(t.inicio)} - ${formatHora(t.fin)})</td>
          <td style="text-align: center; padding: 3px 0;">${sist.cantidadVentas || 0} VTAS</td>
          <td style="text-align: right; padding: 3px 0;">${Utils.formatCurrency(usd)}</td>
          <td style="text-align: right; padding: 3px 0;">Bs ${Utils.formatNumber(bs, true)}</td>
        </tr>
      `;
    }).join('');

    turnosHtml = `
      <div style="margin-bottom: 20px;">
        <div style="font-weight: bold; margin-bottom: 6px; font-size: 13px;">[ DESGLOSE DE TURNOS DE CAJA (${turnos.length}) ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 4px 0;">TURNO / HORARIO</th>
              <th style="text-align: center; padding: 4px 0;">OPERACIONES</th>
              <th style="text-align: right; padding: 4px 0;">FÍSICO ($)</th>
              <th style="text-align: right; padding: 4px 0;">FÍSICO (Bs)</th>
            </tr>
          </thead>
          <tbody>
            ${filasTurnos}
          </tbody>
        </table>
        <div style="border-top: 1px dashed #000; margin-top: 10px; margin-bottom: 5px;"></div>
      </div>
    `;
  }

  let cuadreHtml = '';
  if (arqueo) {
      let totalDiferenciaUsd = 0;
      let totalDiferenciaBs = 0;
      let cuadreRows = methodsArqueo.map(m => {
          const isUsd = m.moneda === 'USD' || m.key === 'efectivo_usd';
          const declarado = arqueo.declaracion ? (arqueo.declaracion[m.key] || 0) : 0;
          const sistema = isUsd ? (cierre[m.key] || 0) : (cierre.bs ? (cierre.bs[m.key] || 0) : 0);
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
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ CUADRE CONSOLIDADO DEL DÍA - REPORTE Z ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 6px 0;">MÉTODO</th>
              <th style="text-align: right; padding: 6px 0;">TOTAL FÍSICO</th>
              <th style="text-align: right; padding: 6px 0;">TOTAL SISTEMA</th>
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
            <b>OBSERVACIONES:</b> ${Utils.escapeHtml(arqueo.observaciones)}
          </div>
        ` : ''}
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>`;
  }

  const methods = [
    ...allMetodos.map(m => ({
      key: m.id,
      label: m.label,
      icon: m.icon || '💳',
      moneda: m.moneda || 'Bs'
    })),
    { key: 'credito', label: 'A Crédito (Ventas)', icon: '📋', moneda: 'USD' }
  ];

  return `
    <div style="font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; padding: 25px; line-height: 1.4; font-size: 13px; max-width: 800px; margin: 0 auto;">
      
      <!-- Encabezado de Ticket Matricial -->
      <div style="text-align: center; margin-bottom: 25px;">
        <div style="font-size: 20px; font-weight: bold; letter-spacing: 2px;">*** ${Utils.escapeHtml(store.getConfig('empresaNombre') || 'TU EMPRESA')} ***</div>
        <div style="font-size: 14px; font-weight: bold; margin-top: 5px; letter-spacing: 1px;">REPORTE Z - CIERRE CONSOLIDADO DEL DÍA</div>
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

      ${turnosHtml}

      ${(() => {
        const moduloCaud = store.getConfig('moduloCaudalimetro') || false;
        if (!moduloCaud) return '';
        const unidadCaud = store.getConfig('unidadCaudalimetro') || 'L';
        const lectCaud = store.getLecturaCaudalimetro(fecha);
        const vDia = (store.getAll('ventas') || []).filter(v => v.fecha && v.fecha.startsWith(fecha));
        const lFact = vDia.reduce((s, v) => s + (parseFloat(v.litrosTotales) || (parseInt(v.botellones) || 0) * 20 || 0), 0);
        const lLavado = vDia.reduce((s, v) => {
          if (v.litrosMermaLavado !== undefined) return s + (parseFloat(v.litrosMermaLavado) || 0);
          const nominal = (parseFloat(v.litrosTotales) || (parseInt(v.botellones) || 0) * 20 || 0);
          return s + (store.calcularMermaLavado ? store.calcularMermaLavado(nominal) : (nominal * 0.05));
        }, 0);
        const mDia = (store.getAll('mermas') || []).filter(m => m.fecha && m.fecha.startsWith(fecha));
        const lMerm = mDia.reduce((s, m) => s + (parseInt(m.litros) || 0), 0);
        const totSist = Math.round((lFact + lLavado + lMerm) * 100) / 100;
        const dAgua = Math.round((lectCaud.litrosReloj - totSist) * 100) / 100;

        return `
        <!-- Resumen Caudalímetro -->
        <div style="margin-bottom: 20px;">
          <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ AUDITORÍA DE RELOJ MEDIDOR DE AGUA ]</div>
          <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: inherit;">
            <tr>
              <td style="padding: 3px 0;">LECTURA INICIAL (APERTURA):</td>
              <td style="text-align: right; font-weight: bold; padding: 3px 0;">${lectCaud.inicial !== null ? lectCaud.inicial.toLocaleString() : 'N/R'} ${unidadCaud}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0;">LECTURA FINAL (CIERRE):</td>
              <td style="text-align: right; font-weight: bold; padding: 3px 0;">${lectCaud.final !== null ? lectCaud.final.toLocaleString() : 'N/R'} ${unidadCaud}</td>
            </tr>
            <tr style="border-top: 1px dotted #000;">
              <td style="padding: 3px 0; font-weight: bold;">AGUA SEGÚN RELOJ FÍSICO:</td>
              <td style="text-align: right; font-weight: bold; padding: 3px 0;">${lectCaud.litrosReloj.toLocaleString()} L</td>
            </tr>
            <tr>
              <td style="padding: 3px 0;">VENTAS DESPACHADAS:</td>
              <td style="text-align: right; padding: 3px 0;">${lFact.toLocaleString()} L</td>
            </tr>
            <tr>
              <td style="padding: 3px 0;">MERMA DE LAVADO ESTIMADA:</td>
              <td style="text-align: right; padding: 3px 0;">${lLavado.toLocaleString()} L</td>
            </tr>
            ${lMerm > 0 ? `
            <tr>
              <td style="padding: 3px 0;">MERMAS MANUALES:</td>
              <td style="text-align: right; padding: 3px 0;">${lMerm.toLocaleString()} L</td>
            </tr>
            ` : ''}
            <tr style="border-top: 1px dotted #000;">
              <td style="padding: 3px 0; font-weight: bold;">AGUA JUSTIFICADA POR SISTEMA:</td>
              <td style="text-align: right; font-weight: bold; padding: 3px 0;">${totSist.toLocaleString()} L</td>
            </tr>
            <tr style="border-top: 1px solid #000; font-weight: bold;">
              <td style="padding: 4px 0;">DIFERENCIA DE AGUA:</td>
              <td style="text-align: right; padding: 4px 0; font-size: 13px;">${dAgua > 0 ? '+' : ''}${dAgua.toLocaleString()} L (${dAgua === 0 ? 'CUADRE EXACTO' : (dAgua > 0 ? 'SOBRANTE DE FLUJO' : 'MENOS FLUJO')})</td>
            </tr>
          </table>
          <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
        </div>
        `;
      })()}

      ${cuadreHtml}

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

      <!-- Detalle de Propinas por Punto/Banco a Liquidar al Personal -->
      ${cierre.propinasDetalle && cierre.propinasDetalle.length > 0 ? `
      <div style="margin-bottom: 25px; page-break-inside: avoid;">
        <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">[ PROPINAS POR PUNTO/BANCO A LIQUIDAR AL PERSONAL ]</div>
        <table style="width: 100%; border-collapse: collapse; font-family: inherit; font-size: 11px;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left; padding: 6px 0; width: 12%;">HORA</th>
              <th style="text-align: left; padding: 6px 0; width: 20%;">MÉTODO</th>
              <th style="text-align: left; padding: 6px 0; width: 20%;">REF. VOUCHER</th>
              <th style="text-align: right; padding: 6px 0; width: 24%;">MONTO (Bs)</th>
              <th style="text-align: right; padding: 6px 0; width: 24%;">MONTO ($)</th>
            </tr>
          </thead>
          <tbody>
            ${cierre.propinasDetalle.map(p => {
              const horaStr = new Date(p.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
              const foundMethod = methods.find(m => m.key === p.metodo);
              const metodoStr = foundMethod ? foundMethod.label.toUpperCase() : (p.metodo || 'PUNTO').toUpperCase();
              const montoBs = p.moneda === 'Bs' || p.moneda === 'VES' ? p.monto : (p.monto * (p.tasa || 40));
              const montoUSD = p.moneda === 'USD' ? p.monto : (p.monto / (p.tasa || 40));
              return `
                <tr>
                  <td style="padding: 5px 0; color:#333;">${horaStr}</td>
                  <td style="padding: 5px 0;">${metodoStr}</td>
                  <td style="padding: 5px 0; font-weight: bold; color:#111;">${(p.referencia || '-').toUpperCase()}</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: bold;">Bs ${Utils.formatNumber(montoBs, true)}</td>
                  <td style="padding: 5px 0; text-align: right; font-weight: bold;">${Utils.formatCurrency(montoUSD)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top: 1px solid #000; font-weight: bold;">
              <td colspan="3" style="padding: 6px 0; text-align: right;">TOTAL PROPINAS A ENTREGAR:</td>
              <td style="padding: 6px 0; text-align: right; font-size: 12px;">Bs ${Utils.formatNumber(cierre.totalPropinasBs || 0, true)}</td>
              <td style="padding: 6px 0; text-align: right; font-size: 12px;">${Utils.formatCurrency(cierre.totalPropinasUSD || 0)}</td>
            </tr>
          </tfoot>
        </table>
        <div style="border-top: 1px dashed #000; margin-top: 12px; margin-bottom: 5px;"></div>
      </div>
      ` : ''}

      <div style="text-align: center; font-size: 10px; margin-top: 15px; color: #555; letter-spacing: 1px;">
        *** FIN DEL REPORTE Z - IMPRESO DESDE SISTEMA LOCAL ***
      </div>
    </div>
  `;
}

export function renderCierreCaja(container) {
  const today = Utils.todayISO();
  container.innerHTML = `
    <div class="page-header" style="margin-bottom: 20px; border-bottom: 2px solid var(--color-border); padding-bottom: 15px;">
      <div>
        <h1 class="page-title">Cierre de Caja y Turnos</h1>
        <p class="page-subtitle">Gestión de arqueos por turno y emisión de Reporte Z Consolidado</p>
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
    currentActiveTab = null;
    renderCierre(contentDiv, fechaInput.value);
  });

  pdfBtn.addEventListener('click', () => {
    if (!store.getArqueo(fechaInput.value)) {
       alert('Debe realizar al menos un Cierre de Turno antes de generar el Reporte Z.');
       return;
    }
    const htmlMatricial = getMatricialReportHTML(fechaInput.value);
    const opt = {
      margin:       0.5,
      filename:     `Cierre_Z_${fechaInput.value}.pdf`,
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
