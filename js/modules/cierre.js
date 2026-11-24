import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { openModalCaudalimetro, openModalPedidosPendientes } from './ventas.js';
import { syncToCloud } from '../cloud-sync.js';

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

export function getNombreTiendaCompleto() {
  let userEmail = '';
  let nombreLic = '';
  try {
    const lic = JSON.parse(localStorage.getItem('licencia_usuario') || '{}');
    userEmail = (lic.email || '').trim().toLowerCase();
    if (lic.nombre_empresa && lic.nombre_empresa !== 'None' && lic.nombre_empresa.trim()) {
      nombreLic = lic.nombre_empresa.trim();
    }
  } catch (e) {}

  if (!userEmail) {
    try {
      userEmail = (localStorage.getItem('user_email') || localStorage.getItem('visor_refill_selected_sede') || '').trim().toLowerCase();
    } catch (e) {}
  }

  // 1. Mapeo específico de sedes Refill H2O (prioritario para reflejar la sede exacta en cabecera)
  const sedesMap = {
    'refillh2o.lcf@gmail.com': 'Refill H2O - La California Sur',
    'refillh2o.se@gmail.com': 'Refill H2O - Santa Eduvigis',
    'refillh2o.ldc@gmail.com': 'Refill H2O - Los Dos Caminos',
    'refillh2o.sr@gmail.com': 'Refill H2O - Santa Rosa',
    'refillh2o.sp@gmail.com': 'Refill H2O - Santa Paula',
    'refillh2o.sf@gmail.com': 'Refill H2O - Santa Fe'
  };

  if (userEmail && sedesMap[userEmail]) {
    return sedesMap[userEmail];
  }

  // 2. Nombre de empresa registrado en la licencia si es específico
  if (nombreLic && nombreLic !== 'Tu Empresa') {
    return nombreLic;
  }

  // 3. Nombre configurado en el sistema local
  const nombreCfg = (store.getConfig('empresaNombre') || '').trim();
  if (nombreCfg && nombreCfg !== 'Tu Empresa') {
    return nombreCfg;
  }

  return 'Refill H2O';
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

      <div style="background: var(--color-bg, #F8FAFC); border-left: 4px solid var(--color-primary); padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 13.5px; color: var(--color-text-main);">
        🛒 <strong>Operaciones de este Turno:</strong> 
        ${cierreTurno.cantidadVentas} ${cierreTurno.cantidadVentas === 1 ? 'venta registrada' : 'ventas registradas'}
        ${!store.isOperario() ? ` | Esperado en Caja: <strong>${Utils.formatCurrency(cierreTurno.real_ingresado)}</strong> (Bs ${Utils.formatNumber(cierreTurno.bs?.real_ingresado || 0, true)})` : ''}
      </div>

      ${(() => {
        const pendientes = (store.getAll('ventas') || []).filter(v => v.estadoEntrega === 'pendiente');
        if (pendientes.length === 0) return '';
        return `
          <div style="background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <div style="font-size: 13px; color: #92400E; line-height: 1.35;">
              ⚠️ <strong>Atención:</strong> Tienes <strong>${pendientes.length} ${pendientes.length === 1 ? 'pedido pendiente' : 'pedidos pendientes'}</strong> por entregar.
            </div>
            <button type="button" id="btn-revisar-pendientes-cierre" class="btn btn-sm" style="background: #F59E0B; color: white; font-weight: 700; border-radius: 6px; padding: 4px 10px; font-size: 12px; white-space: nowrap; cursor: pointer;">
              Revisar Entregas
            </button>
          </div>
        `;
      })()}

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
          ${methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key)).map(m => {
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

  const btnRevisarPendientes = container.querySelector('#btn-revisar-pendientes-cierre');
  if (btnRevisarPendientes) {
    btnRevisarPendientes.addEventListener('click', () => {
      openModalPedidosPendientes(() => {
        const contentDiv = document.getElementById('cierre-caja-home-content');
        if (contentDiv) {
          renderCierre(contentDiv, fecha, currentActiveTab);
        } else {
          renderCierreContent(fecha, currentActiveTab);
        }
      });
    });
  }

  container.querySelector('#form-arqueo').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const declaracion = {};
    methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key)).forEach(m => {
      let rawVal = fd.get('arqueo_' + m.key) || '0';
      rawVal = rawVal.replace(/\./g, '').replace(',', '.');
      declaracion[m.key] = parseFloat(rawVal) || 0;
    });

    // 🛡️ Alias de compatibilidad para punto de venta
    if (declaracion.punto !== undefined) {
      declaracion.punto_de_venta = declaracion.punto;
    }

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

      // ☁️ Sincronizar y forzar respaldo histórico completo a la nube con confirmación
      if (typeof syncToCloud === 'function') {
        syncToCloud(true).then(ok => {
          if (ok) {
            showToast('☁️ Cierre y respaldo histórico respaldados con éxito en la nube', 'info');
          }
        }).catch(() => {});
      }

      currentActiveTab = 'turno_' + turnoGuardado.id;
      const contentDiv = document.getElementById('cierre-caja-home-content');
      if (contentDiv) {
        renderCierre(contentDiv, fecha, currentActiveTab);
      } else {
        renderCierreContent(fecha, currentActiveTab);
      }
    };

    const pendientesGlobales = (store.getAll('ventas') || []).filter(v => v.estadoEntrega === 'pendiente');

    openModal({
      title: `⚠️ Confirmar Cierre de Turno ${numTurno}`,
      content: `
        <div style="padding: 10px 0;">
          <p style="font-size: 15px; font-weight: 700; color: var(--color-primary-900); margin-bottom: 8px;">
            ¿Estás seguro de que deseas procesar y finalizar el cierre del Turno ${numTurno}?
          </p>
          <p style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 12px; line-height: 1.4;">
            Verifica que hayas contado y declarado todos los montos físicos de este turno. Los montos se cuadrarán exclusivamente con las ventas realizadas entre <strong>${horaInicioStr}</strong> y ahora.
          </p>
          ${pendientesGlobales.length > 0 ? `
            <div style="background: #FEF3C7; border: 1.5px solid #F59E0B; border-radius: 8px; padding: 10px 12px; margin-bottom: 15px; font-size: 13px; color: #92400E;">
              ⚠️ <strong>Recordatorio:</strong> Existen <strong>${pendientesGlobales.length} ${pendientesGlobales.length === 1 ? 'pedido pendiente' : 'pedidos pendientes'}</strong> de entrega física. El dinero de estas ventas ya fue contabilizado en este cuadre.
            </div>
          ` : ''}
          <div style="background: var(--color-bg); padding: 12px 14px; border-radius: 8px; font-size: 13.5px; border-left: 4px solid #10B981; display: flex; flex-direction: column; gap: 4px;">
            <div>💵 <strong>Efectivo USD:</strong> ${Utils.formatCurrency(declaracion.efectivo_usd || 0)}</div>
            <div>🇻🇪 <strong>Efectivo Bs:</strong> Bs ${Utils.formatNumber(declaracion.efectivo_bs || 0, true)}</div>
            <div>📲 <strong>Pago Móvil:</strong> Bs ${Utils.formatNumber(declaracion.pago_movil || 0, true)}</div>
            <div>💳 <strong>Punto de Venta:</strong> Bs ${Utils.formatNumber(declaracion.punto || declaracion.punto_de_venta || 0, true)}</div>
            ${declaracion.transferencia ? `<div>🏦 <strong>Transferencia:</strong> Bs ${Utils.formatNumber(declaracion.transferencia || 0, true)}</div>` : ''}
            ${methods.filter(m => !['efectivo_usd', 'efectivo_bs', 'pago_movil', 'punto', 'transferencia', 'credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key) && declaracion[m.key] > 0).map(m => `<div>${m.icon} <strong>${m.label}:</strong> ${m.moneda === 'USD' ? Utils.formatCurrency(declaracion[m.key]) : 'Bs ' + Utils.formatNumber(declaracion[m.key], true)}</div>`).join('')}
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

  const filas = methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key)).map(m => {
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
      ${(cierreSistema.saldo_favor || 0) > 0 ? `
        <div style="margin-top: 10px; padding: 10px 14px; background: #ECFDF5; border: 1px solid #10B981; border-radius: 8px; font-size: 13px; color: #065F46; display: flex; justify-content: space-between; align-items: center;">
          <span>💰 <strong>Saldo a Favor Utilizado en este Turno (Reconocido automáticamente por el sistema):</strong></span>
          <strong style="font-size: 14px;">${Utils.formatCurrency(cierreSistema.saldo_favor)}</strong>
        </div>
      ` : ''}
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
      methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key)).forEach(m => {
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

  const filasMetodos = methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key)).map(m => {
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
          ${Utils.escapeHtml(getNombreTiendaCompleto())} - Cierre del Día
        </h2>
        <div style="margin-top: 4px; font-size: 13.5px; opacity: 0.85;">
          📅 Fecha: ${Utils.formatDate(fecha)} | ${turnos.length} ${turnos.length === 1 ? 'Turno Registrado' : 'Turnos Registrados'}
        </div>
      </div>
      <div>
        <button id="btn-imprimir-reporte-txt" class="btn btn-secondary" style="font-weight: 700; height: 40px; padding: 0 16px;">
          📋 Descargar Reporte Z
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
      ${(cierreGlobal.saldo_favor || 0) > 0 ? `
        <div style="margin-top: 10px; padding: 10px 14px; background: #ECFDF5; border: 1px solid #10B981; border-radius: 8px; font-size: 13px; color: #065F46; display: flex; justify-content: space-between; align-items: center;">
          <span>💰 <strong>Saldo a Favor Utilizado Hoy (Reconocido automáticamente por el sistema):</strong></span>
          <strong style="font-size: 14px;">${Utils.formatCurrency(cierreGlobal.saldo_favor)}</strong>
        </div>
      ` : ''}
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
        <div class="metric-label">Cobros / Abonos Recibidos</div>
        <div class="metric-value" style="font-size: var(--font-size-xl); color: var(--color-success); margin: 0;">${Utils.formatCurrency(cierreGlobal.cobros_credito)}<br><small style="font-size:0.5em; opacity:0.8; font-weight:normal; line-height:1; display:block;">Bs ${Utils.formatNumber(cierreGlobal.bs && cierreGlobal.bs.cobros_credito ? cierreGlobal.bs.cobros_credito : 0, true)}</small></div>
        <div class="text-muted" style="font-size: 10px; margin-top: 5px;">(Abonos a deuda o saldo a favor)</div>
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
                const refParts = [];
                if (a.referencia) refParts.push(`Ref: ${a.referencia}`);
                if (a.telefono) refParts.push(`Tel: ${a.telefono}`);
                const refDisplay = refParts.length > 0 ? refParts.join(' | ') : '-';
                return `
                  <tr>
                    <td class="text-muted">${horaStr}</td>
                    <td class="font-semibold">${Utils.escapeHtml(nombreCliente)}</td>
                    <td class="font-bold text-success">${Utils.formatCurrency(a.monto)}</td>
                    <td>${metodoStr}</td>
                    <td class="font-semibold" style="font-size: 11.5px; color: #1E40AF;">${Utils.escapeHtml(refDisplay)}</td>
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

    <!-- Resumen de Caja Chica del Día -->
    ${(() => {
      const cc = store.getCajaChica ? store.getCajaChica(fecha) : null;
      const iniUSD = cc?.inicio ? (cc.inicio.montoUSD || 0) : 0;
      const iniBs = cc?.inicio ? (cc.inicio.montoBs || 0) : 0;
      const rets = Array.isArray(cc?.retiros) ? cc.retiros : [];
      const totRetUSD = rets.filter(r => r.moneda !== 'Bs').reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
      const totRetBs = rets.filter(r => r.moneda === 'Bs').reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
      const espUSD = iniUSD - totRetUSD;
      const espBs = iniBs - totRetBs;
      return `
        <div class="card" style="margin-bottom: 20px; border-left: 4px solid #10B981;">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <h3 class="card-title" style="margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>💰</span> Caja Chica del Día
            </h3>
            <span class="text-muted" style="font-size: 12px;">
              Inicio: <strong>${cc?.inicio ? `${Utils.formatCurrency(iniUSD)} · Bs ${Utils.formatNumber(iniBs, true)}` : 'Sin registrar'}</strong> |
              Cierre: <strong>${cc?.cierre ? `${Utils.formatCurrency(cc.cierre.montoUSD || 0)} · Bs ${Utils.formatNumber(cc.cierre.montoBs || 0, true)}` : 'Pendiente'}</strong>
            </span>
          </div>
          <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; font-size: 13px;">
            <div>Total Retiros (${rets.length}): <strong style="color: #B45309;">- ${Utils.formatCurrency(totRetUSD)} · - Bs ${Utils.formatNumber(totRetBs, true)}</strong></div>
            <div>Saldo Esperado: <strong style="color: #059669;">${Utils.formatCurrency(espUSD)} · Bs ${Utils.formatNumber(espBs, true)}</strong></div>
          </div>
          ${rets.length > 0 ? `
            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Responsable</th>
                    <th>Motivo</th>
                    <th style="text-align: right;">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${rets.map(r => `
                    <tr>
                      <td class="text-muted">${Utils.formatDate(r.fecha || fecha)} ${r.hora || ''}</td>
                      <td class="font-semibold">${Utils.escapeHtml(r.responsable || '-')}</td>
                      <td class="text-muted">${Utils.escapeHtml(r.motivo || '-')}</td>
                      <td style="text-align: right; font-weight: bold; color: #B45309;">${r.moneda === 'Bs' ? `Bs ${Utils.formatNumber(r.monto, true)}` : Utils.formatCurrency(r.monto)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div class="empty-state" style="padding: 15px; text-align: center; color: var(--color-text-muted);">No hay retiros de caja chica registrados para esta fecha.</div>'}
        </div>
      `;
    })()}
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

  const filas = methods.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key)).map(m => {
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
        <div style="font-size: 18px; font-weight: bold; letter-spacing: 1px;">*** ${Utils.escapeHtml(getNombreTiendaCompleto())} ***</div>
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
    const btnPrintTxt = pane.querySelector('#btn-imprimir-reporte-txt');
    if (btnPrintTxt) {
      btnPrintTxt.addEventListener('click', () => {
        document.getElementById('btn-generar-txt-home')?.click();
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

export function getReporteTxtString(fecha) {
  const nombreTienda = getNombreTiendaCompleto();
  const cierre = store.getCierreCaja(fecha);
  const arqueo = store.getArqueo(fecha);
  const turnos = store.getTurnos(fecha);
  const allMetodos = store.getMetodosPago(false);
  const tipos = store.getConfig('tiposBotellon') || [];
  const tasaActual = store.getConfig('tasaCambio') || 896.12;

  // Ventas del día
  const allVentas = store.getAll('ventas') || [];
  const ventasDia = allVentas.filter(v => v && v.fecha && v.fecha.startsWith(fecha));

  // Consolidado de productos
  const productoResumen = {};
  let totalUnidadesVendidas = 0;
  let totalUnidadesCredito = 0;
  let totalUnidadesSinCobro = 0;
  let totalLitrosVendidos = 0;
  let totalMontoProductos = 0;
  let totalMontoCreditoProductos = 0;

  ventasDia.forEach(v => {
    const isSinCobro = ['convenio', 'garantia', 'cortesia'].includes(v.tipo);
    const isCredito = (v.tipo === 'credito');
    if (v.detalles && Array.isArray(v.detalles) && v.detalles.length > 0) {
      v.detalles.forEach(d => {
        if (d.categoria === 'servicio') return;
        const prod = tipos.find(t => t.id === d.tipoBotellonId);
        const prodName = prod ? prod.nombre : (d.nombre || 'Producto');
        const cap = prod ? (parseFloat(prod.litros) || 20) : (parseFloat(d.capacidad) || 20);
        const cant = (d.cantidad || 1);
        const itemSinCobro = isSinCobro || !!d.esCortesia || (d.subtotal === 0);
        const ltsItem = d.litros !== undefined ? d.litros : (cant * cap);

        if (!productoResumen[prodName]) {
          productoResumen[prodName] = { facturado: 0, credito: 0, sinCobro: 0, litros: 0, monto: 0, montoCredito: 0 };
        }
        productoResumen[prodName].litros += ltsItem;
        totalLitrosVendidos += ltsItem;

        if (itemSinCobro) {
          productoResumen[prodName].sinCobro += cant;
          totalUnidadesSinCobro += cant;
        } else if (isCredito) {
          productoResumen[prodName].credito += cant;
          const sub = (d.subtotal || 0);
          productoResumen[prodName].montoCredito += sub;
          totalUnidadesCredito += cant;
          totalMontoCreditoProductos += sub;
        } else {
          productoResumen[prodName].facturado += cant;
          const sub = (d.subtotal || 0);
          productoResumen[prodName].monto += sub;
          totalUnidadesVendidas += cant;
          totalMontoProductos += sub;
        }
      });
    } else if (v.botellones) {
      const prodName = 'Recarga 20 Lts';
      const cant = parseInt(v.botellones) || 1;
      const ltsItem = cant * 20;
      if (!productoResumen[prodName]) {
        productoResumen[prodName] = { facturado: 0, credito: 0, sinCobro: 0, litros: 0, monto: 0, montoCredito: 0 };
      }
      productoResumen[prodName].litros += ltsItem;
      totalLitrosVendidos += ltsItem;
      if (isCredito) {
        productoResumen[prodName].credito += cant;
        productoResumen[prodName].montoCredito += (v.total || 0);
        totalUnidadesCredito += cant;
        totalMontoCreditoProductos += (v.total || 0);
      } else {
        productoResumen[prodName].facturado += cant;
        productoResumen[prodName].monto += (v.total || 0);
        totalUnidadesVendidas += cant;
        totalMontoProductos += (v.total || 0);
      }
    }
  });

  const listProdResumen = Object.entries(productoResumen).sort((a, b) => (b[1].facturado + b[1].credito) - (a[1].facturado + a[1].credito));

  // Formateador con padding para columnas monoespacio
  const padRight = (str, len) => String(str).padEnd(len).substring(0, len);
  const padLeft = (str, len) => String(str).padStart(len).substring(0, len);

  const w = 72;
  const sepDouble = "=".repeat(w);
  const sepSingle = "-".repeat(w);
  const lines = [];

  const ahoraStr = new Date().toLocaleString('es-VE', { 
    day: '2-digit', month: '2-digit', year: 'numeric', 
    hour: '2-digit', minute: '2-digit', hour12: true 
  });

  // ENCABEZADO
  lines.push(sepDouble);
  lines.push(`*** ${nombreTienda.toUpperCase()} ***`.padStart(Math.floor((w + nombreTienda.length + 8) / 2)).padEnd(w));
  lines.push("REPORTE Z - CONSOLIDADO DE CIERRE DE CAJA Y VENTAS".padStart(Math.floor((w + 50) / 2)).padEnd(w));
  lines.push(sepDouble);
  lines.push(`FECHA DEL REPORTE : ${fecha}`);
  lines.push(`FECHA DE EMISIÓN  : ${ahoraStr}`);
  lines.push(`TASA DE CAMBIO    : Bs ${Utils.formatNumber(tasaActual, true)} / USD`);
  lines.push(`TOTAL OPERACIONES : ${ventasDia.length} operaciones (${ventasDia.filter(v => v.tipo !== 'credito').length} cobradas / ${ventasDia.filter(v => v.tipo === 'credito').length} a crédito)`);
  lines.push("");

  // 1. RESUMEN DE VENTAS POR PRODUCTO (SOLO DINERO COBRADO EN CAJA vs CRÉDITO)
  lines.push(sepDouble);
  lines.push("1. RESUMEN DE VENTAS POR PRODUCTO (DESGLOSE CONTADO vs CRÉDITO)");
  lines.push(sepDouble);
  lines.push(`${padRight('PRODUCTO / SERVICIO', 24)} ${padLeft('CONTADO', 9)} ${padLeft('CRÉDITO', 9)} ${padLeft('S/COBRO', 8)} ${padLeft('LITROS', 8)} ${padLeft('COBRADO($)', 10)}`);
  lines.push(sepSingle);

  if (listProdResumen.length === 0) {
    lines.push("No se registraron ventas en esta fecha.");
  } else {
    listProdResumen.forEach(([nombre, info]) => {
      const factStr = info.facturado > 0 ? `${info.facturado} un.` : '-';
      const credStr = info.credito > 0 ? `${info.credito} un.` : '-';
      const scStr = info.sinCobro > 0 ? `${info.sinCobro} un.` : '-';
      const ltsStr = `${Math.round(info.litros).toLocaleString('es-VE')}L`;
      const montoStr = `$ ${info.monto.toFixed(2)}`;
      lines.push(`${padRight(nombre, 24)} ${padLeft(factStr, 9)} ${padLeft(credStr, 9)} ${padLeft(scStr, 8)} ${padLeft(ltsStr, 8)} ${padLeft(montoStr, 10)}`);
    });
    lines.push(sepSingle);
    const totFactStr = `${totalUnidadesVendidas} un.`;
    const totCredStr = totalUnidadesCredito > 0 ? `${totalUnidadesCredito} un.` : '-';
    const totScStr = totalUnidadesSinCobro > 0 ? `${totalUnidadesSinCobro} un.` : '-';
    const totLtsStr = `${Math.round(totalLitrosVendidos).toLocaleString('es-VE')}L`;
    const totMontoStr = `$ ${totalMontoProductos.toFixed(2)}`;
    lines.push(`${padRight('TOTAL COBRADO (CONTADO)', 24)} ${padLeft(totFactStr, 9)} ${padLeft(totCredStr, 9)} ${padLeft(totScStr, 8)} ${padLeft(totLtsStr, 8)} ${padLeft(totMontoStr, 10)}`);
    if (totalMontoCreditoProductos > 0) {
      lines.push(`${padRight('(*) DESPACHADO A CRÉDITO (NO INGRESÓ A CAJA HOY):', 58)} ${padLeft('$ ' + totalMontoCreditoProductos.toFixed(2), 13)}`);
    }
  }
  lines.push("");

  // 2. RESUMEN DE FLUJO DE CAJA
  lines.push(sepDouble);
  lines.push("2. RESUMEN DE FLUJO DE CAJA (DINERO REAL RECIBIDO)");
  lines.push(sepDouble);
  lines.push(`${padRight('INGRESO REAL EN CAJA (CONTADO + ABONOS):', 48)} ${padLeft('$ ' + (cierre.real_ingresado || 0).toFixed(2), 23)}`);
  lines.push(`${padRight('  (+) Ventas Cobradas de Contado Hoy:', 48)} ${padLeft('$ ' + Math.max(0, (cierre.total || 0) - (cierre.credito || 0) - (cierre.saldo_favor || 0)).toFixed(2), 23)}`);
  lines.push(`${padRight('  (+) Abonos / Cobros de Deudas Recibidos Hoy:', 48)} ${padLeft('+ $ ' + (cierre.cobros_credito || 0).toFixed(2), 23)}`);
  if ((cierre.totalPropinasUSD || 0) > 0) {
    lines.push(`${padRight('  (+) Propinas por Punto/Banco Recibidas Hoy:', 48)} ${padLeft('+ $ ' + (cierre.totalPropinasUSD || 0).toFixed(2), 23)}`);
  }
  lines.push(sepSingle);
  if ((cierre.saldo_favor || 0) > 0) {
    lines.push(`${padRight('Saldo a Favor Usado Hoy (Abonos Previos):', 48)} ${padLeft('$ ' + (cierre.saldo_favor || 0).toFixed(2), 23)}`);
  }
  lines.push(`${padRight('Crédito Otorgado Hoy (Por Cobrar / NO en Caja):', 48)} ${padLeft('$ ' + (cierre.credito || 0).toFixed(2), 23)}`);
  lines.push(`${padRight('Valor Total Despachado (Contado + Crédito):', 48)} ${padLeft('$ ' + (cierre.total || 0).toFixed(2), 23)}`);
  lines.push(sepSingle);
  lines.push(`Total Botellones Despachados: ${totalUnidadesVendidas + totalUnidadesCredito + totalUnidadesSinCobro} unidades (${totalUnidadesVendidas} contado / ${totalUnidadesCredito} crédito)`);
  lines.push(`Total Agua Purificada Despachada: ${Math.round(totalLitrosVendidos).toLocaleString('es-VE')} Litros`);
  lines.push(sepSingle);
  lines.push("DESGLOSE DE INGRESOS POR MÉTODO DE PAGO:");
  lines.push(sepSingle);
  lines.push(`${padRight('MÉTODO', 32)} ${padLeft('MONTO ($)', 18)} ${padLeft('MONTO (Bs)', 20)}`);
  lines.push(sepSingle);

  allMetodos.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.id)).forEach(m => {
    const isUsd = m.moneda === 'USD' || m.id === 'efectivo_usd';
    const usd = cierre[m.id] || 0;
    const bs = cierre.bs ? (cierre.bs[m.id] || 0) : 0;
    if (usd > 0 || bs > 0) {
      const bsStr = bs > 0 ? `Bs ${Utils.formatNumber(bs, true)}` : (isUsd ? '-' : `Bs 0,00`);
      lines.push(`${padRight(m.label, 32)} ${padLeft('$ ' + usd.toFixed(2), 18)} ${padLeft(bsStr, 20)}`);
    }
  });

  lines.push(sepSingle);
  lines.push(`${padRight('TOTAL RECAUDADO EN CAJA', 32)} ${padLeft('$ ' + (cierre.real_ingresado || 0).toFixed(2), 18)}`);
  lines.push("");

  // 3. DESGLOSE DE TURNOS DE CAJA
  if (turnos && turnos.length > 0) {
    lines.push(sepDouble);
    lines.push(`3. DESGLOSE DE TURNOS DE CAJA (${turnos.length})`);
    lines.push(sepDouble);
    lines.push(`${padRight('TURNO / HORARIO', 36)} ${padLeft('OPERACIONES', 12)} ${padLeft('FÍSICO ($)', 11)} ${padLeft('FÍSICO (Bs)', 11)}`);
    lines.push(sepSingle);

    turnos.forEach(t => {
      const sist = t.sistema || store.getCierreCaja(t.fecha, t.inicio, t.fin);
      let usd = 0;
      let bs = 0;
      if (t.declaracion) {
        allMetodos.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.id)).forEach(m => {
          const val = t.declaracion[m.id] || 0;
          if (m.moneda === 'USD' || m.id === 'efectivo_usd') usd += val;
          else bs += val;
        });
      }
      const labelTurno = `Turno ${t.numeroTurno} (${formatHora(t.inicio)} - ${formatHora(t.fin)})`;
      lines.push(`${padRight(labelTurno, 36)} ${padLeft((sist.cantidadVentas || 0) + ' vtas', 12)} ${padLeft('$ ' + usd.toFixed(2), 11)} ${padLeft('Bs ' + Utils.formatNumber(bs, true), 11)}`);
    });
    lines.push("");
  }

  // 4. CUADRE CONSOLIDADO DE CAJA (FÍSICO vs SISTEMA)
  if (arqueo && arqueo.declaracion) {
    lines.push(sepDouble);
    lines.push("4. CUADRE CONSOLIDADO DE CAJA (ARQUEO vs SISTEMA)");
    lines.push(sepDouble);
    lines.push(`${padRight('MÉTODO', 26)} ${padLeft('DECLARADO', 15)} ${padLeft('SISTEMA', 15)} ${padLeft('DIFERENCIA', 14)}`);
    lines.push(sepSingle);

    let totDifUsd = 0;
    let totDifBs = 0;
    allMetodos.filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.id)).forEach(m => {
      const isUsd = m.moneda === 'USD' || m.id === 'efectivo_usd';
      const decl = arqueo.declaracion[m.id] || 0;
      const sist = isUsd ? (cierre[m.id] || 0) : (cierre.bs ? (cierre.bs[m.id] || 0) : 0);
      const dif = decl - sist;
      if (isUsd) totDifUsd += dif;
      else totDifBs += dif;

      if (decl > 0 || sist > 0 || dif !== 0) {
        const fmt = (v) => isUsd ? `$ ${v.toFixed(2)}` : `Bs ${Utils.formatNumber(v, true)}`;
        const difStr = (dif > 0 ? '+' : '') + fmt(dif);
        lines.push(`${padRight(m.label, 26)} ${padLeft(fmt(decl), 15)} ${padLeft(fmt(sist), 15)} ${padLeft(difStr, 14)}`);
      }
    });

    lines.push(sepSingle);
    lines.push(`${padRight('DIFERENCIA TOTAL USD:', 45)} ${padLeft((totDifUsd > 0 ? '+' : '') + '$ ' + totDifUsd.toFixed(2), 26)}`);
    lines.push(`${padRight('DIFERENCIA TOTAL Bs:', 45)} ${padLeft((totDifBs > 0 ? '+' : '') + 'Bs ' + Utils.formatNumber(totDifBs, true), 26)}`);
    lines.push("");
  }

  // 5. AUDITORÍA DE RELOJ MEDIDOR (CAUDALÍMETRO)
  const moduloCaud = store.getConfig('moduloCaudalimetro');
  const lecturaCaud = store.getLecturaCaudalimetro(fecha);
  if (moduloCaud && lecturaCaud && (lecturaCaud.litrosReloj > 0 || lecturaCaud.final > 0)) {
    lines.push(sepDouble);
    lines.push("5. AUDITORÍA DE RELOJ MEDIDOR DE AGUA (CAUDALÍMETRO)");
    lines.push(sepDouble);
    lines.push(`Lectura Inicial (${lecturaCaud.horaInicial || '00:00'}): ${padLeft((lecturaCaud.inicial || 0).toLocaleString('es-VE') + ' L', 35)}`);
    lines.push(`Lectura Final   (${lecturaCaud.horaFinal || '23:59'}): ${padLeft((lecturaCaud.final || 0).toLocaleString('es-VE') + ' L', 35)}`);
    lines.push(sepSingle);
    lines.push(`${padRight('Agua Total según Reloj Físico:', 42)} ${padLeft((lecturaCaud.litrosReloj || 0).toLocaleString('es-VE') + ' L', 29)}`);
    lines.push(`${padRight('Agua en Ventas Despachadas:', 42)} ${padLeft(Math.round(totalLitrosVendidos).toLocaleString('es-VE') + ' L', 29)}`);

    const mermasDia = (store.getAll('mermas') || []).filter(m => m.fecha && m.fecha.startsWith(fecha));
    const litrosMermas = mermasDia.reduce((s, m) => s + (parseInt(m.litros) || 0), 0);
    const mermasLavado = Math.round(totalLitrosVendidos * 0.05);
    lines.push(`${padRight('Mermas de Lavado / Higienización (estimadas):', 42)} ${padLeft(mermasLavado.toLocaleString('es-VE') + ' L', 29)}`);
    if (litrosMermas > 0) {
      lines.push(`${padRight('Otras Mermas Registradas:', 42)} ${padLeft(litrosMermas.toLocaleString('es-VE') + ' L', 29)}`);
    }
    const totalJustificado = totalLitrosVendidos + mermasLavado + litrosMermas;
    const diffAgua = Math.round((lecturaCaud.litrosReloj - totalJustificado) * 10) / 10;
    lines.push(sepSingle);
    lines.push(`${padRight('Diferencia de Auditoría (Faltante / Desviación):', 42)} ${padLeft((diffAgua > 0 ? '+' : '') + diffAgua.toLocaleString('es-VE') + ' L', 29)}`);
    lines.push("");
  }

  // CAJA CHICA (INICIO, RETIROS Y CIERRE)
  const cajaChica = store.getCajaChica ? store.getCajaChica(fecha) : null;
  if (cajaChica && (cajaChica.inicio || (cajaChica.retiros && cajaChica.retiros.length > 0) || cajaChica.cierre)) {
    const iniUSD = cajaChica.inicio ? (cajaChica.inicio.montoUSD || 0) : 0;
    const iniBs = cajaChica.inicio ? (cajaChica.inicio.montoBs || 0) : 0;
    const retirosCC = Array.isArray(cajaChica.retiros) ? cajaChica.retiros : [];
    const totRetUSD = retirosCC.filter(r => r.moneda !== 'Bs').reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
    const totRetBs = retirosCC.filter(r => r.moneda === 'Bs').reduce((s, r) => s + (parseFloat(r.monto) || 0), 0);
    const espUSD = iniUSD - totRetUSD;
    const espBs = iniBs - totRetBs;

    lines.push(sepDouble);
    lines.push("CAJA CHICA (INICIO, RETIROS Y CIERRE)");
    lines.push(sepDouble);
    if (cajaChica.inicio) {
      const iniLabel = `Inicio de Caja Chica (${cajaChica.inicio.hora || ''}):`;
      const iniVal = `$ ${iniUSD.toFixed(2)} | Bs ${Utils.formatNumber(iniBs, true)}`;
      lines.push(`${padRight(iniLabel, 38)} ${padLeft(iniVal, 33)}`);
      if (cajaChica.inicio.nota) lines.push(`  Nota inicio: ${cajaChica.inicio.nota}`);
    } else {
      lines.push("Inicio de Caja Chica: Sin registrar");
    }

    lines.push(sepSingle);
    if (retirosCC.length > 0) {
      lines.push(`RETIROS REGISTRADOS (${retirosCC.length}):`);
      retirosCC.forEach(r => {
        const fStr = r.fecha ? Utils.formatDate(r.fecha) : Utils.formatDate(fecha);
        const mStr = r.moneda === 'Bs' ? `Bs ${Utils.formatNumber(r.monto, true)}` : `$ ${Number(r.monto).toFixed(2)}`;
        const desc = `${fStr} | ${r.responsable}${r.motivo ? ' (' + r.motivo + ')' : ''}`;
        lines.push(`${padRight(desc.slice(0, 52), 53)} ${padLeft('- ' + mStr, 18)}`);
      });
      lines.push(sepSingle);
      lines.push(`${padRight('Total Retiros:', 38)} ${padLeft(`- $ ${totRetUSD.toFixed(2)} | - Bs ${Utils.formatNumber(totRetBs, true)}`, 33)}`);
    } else {
      lines.push("Retiros de Caja Chica: Ninguno registrado");
    }

    lines.push(sepSingle);
    lines.push(`${padRight('Saldo Esperado en Caja Chica:', 38)} ${padLeft(`$ ${espUSD.toFixed(2)} | Bs ${Utils.formatNumber(espBs, true)}`, 33)}`);
    if (cajaChica.cierre) {
      const cieLabel = `Cierre de Caja Chica (${cajaChica.cierre.hora || ''}):`;
      const cieVal = `$ ${(cajaChica.cierre.montoUSD || 0).toFixed(2)} | Bs ${Utils.formatNumber(cajaChica.cierre.montoBs || 0, true)}`;
      lines.push(`${padRight(cieLabel, 38)} ${padLeft(cieVal, 33)}`);
      if (cajaChica.cierre.nota) lines.push(`  Obs. cierre: ${cajaChica.cierre.nota}`);
    } else {
      lines.push("Cierre de Caja Chica: Pendiente por registrar");
    }
    lines.push("");
  }

  lines.push(sepDouble);
  lines.push("*** FIN DEL REPORTE - IMPRESO DESDE SISTEMA WATERAPP ***".padStart(Math.floor((w + 56) / 2)).padEnd(w));
  lines.push(sepDouble);

  return lines.join("\r\n");
}

export function descargarReporteTxt(fecha) {
  const contenido = getReporteTxtString(fecha);
  const nombreTienda = getNombreTiendaCompleto().replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Reporte_Z_${nombreTienda}_${fecha}.txt`;

  // Usar UTF-8 BOM para apertura directa y limpia en Bloc de Notas de Windows y teléfonos móviles
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


const REPORTE_X_MAX_DIARIO = 3;
const REPORTE_X_STORAGE_KEY = 'waterapp_reporte_x_log';

export function getReporteXEstadoHoy(hoyISO = Utils.todayISO()) {
  let regLocal = null;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(REPORTE_X_STORAGE_KEY);
      if (raw) regLocal = JSON.parse(raw);
    }
  } catch (_) {}

  let regStore = null;
  try {
    regStore = store.getConfig('reporteXRegistro', null);
  } catch (_) {}

  const listLocal = (regLocal && regLocal.fecha === hoyISO && Array.isArray(regLocal.consultas))
    ? regLocal.consultas
    : [];
  const listStore = (regStore && regStore.fecha === hoyISO && Array.isArray(regStore.consultas))
    ? regStore.consultas
    : [];

  const consultas = listLocal.length >= listStore.length ? [...listLocal] : [...listStore];
  return {
    fecha: hoyISO,
    consultas,
    usadas: consultas.length,
    restantes: Math.max(0, REPORTE_X_MAX_DIARIO - consultas.length),
    max: REPORTE_X_MAX_DIARIO
  };
}

export function registrarSolicitudReporteX(hoyISO = Utils.todayISO()) {
  const estadoActual = getReporteXEstadoHoy(hoyISO);
  if (estadoActual.usadas >= REPORTE_X_MAX_DIARIO) {
    return { permitido: false, estado: estadoActual };
  }

  const hora = new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
  const consultas = [...estadoActual.consultas, hora];
  const registro = { fecha: hoyISO, consultas };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REPORTE_X_STORAGE_KEY, JSON.stringify(registro));
    }
  } catch (_) {}
  try {
    store.setConfig('reporteXRegistro', registro);
  } catch (_) {}

  return {
    permitido: true,
    estado: {
      fecha: hoyISO,
      consultas,
      usadas: consultas.length,
      restantes: Math.max(0, REPORTE_X_MAX_DIARIO - consultas.length),
      max: REPORTE_X_MAX_DIARIO
    }
  };
}

export function openReporteXModal(fecha, onAfterUse = null) {
  const res = registrarSolicitudReporteX();

  if (!res.permitido) {
    showToast('Límite diario alcanzado: máximo 3 Reportes X por día.', 'warning');
    const historialHoras = res.estado.consultas.map((h, i) => `
      <div style="display:flex; justify-content:space-between; padding:6px 10px; background:#F8FAFC; border-radius:6px; border:1px solid #E2E8F0; font-size:13px;">
        <span style="font-weight:600; color:#475569;">Consulta #${i + 1}</span>
        <strong style="color:#0F172A;">${Utils.escapeHtml(h)}</strong>
      </div>
    `).join('');

    openModal({
      title: '🚫 Límite Diario de Reporte X Alcanzado',
      showFooter: false,
      content: `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div style="background:#FEF2F2; border:1.5px solid #FCA5A5; border-radius:10px; padding:12px 14px; color:#991B1B; font-size:13.5px; line-height:1.45;">
            Ya utilizaste las <strong>${res.estado.max} consultas permitidas de Reporte X</strong> por el día de hoy (${Utils.formatDate(res.estado.fecha)}). Podrás volver a solicitarlo mañana o emitir el <strong>Reporte Z</strong> al finalizar.
          </div>
          <div>
            <div style="font-size:12px; font-weight:700; color:#64748B; text-transform:uppercase; margin-bottom:6px;">
              Consultas realizadas hoy (${res.estado.usadas}/${res.estado.max})
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${historialHoras}
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:4px;">
            <button type="button" id="btn-cerrar-reporte-x" class="btn btn-primary" style="min-width:120px;">Entendido</button>
          </div>
        </div>
      `,
      onOpen: (overlay) => {
        overlay.querySelector('#btn-cerrar-reporte-x')?.addEventListener('click', closeModal);
      }
    });
    return;
  }

  if (typeof onAfterUse === 'function') {
    onAfterUse(res.estado);
  }

  const cierre = store.getCierreCaja(fecha);
  const methods = getMethodsList();

  const ventaTotalRealUSD = cierre.real_ingresado || 0;
  const ventaTotalRealBs = cierre.bs?.real_ingresado || 0;
  const contadoUSD = Math.max(0, (cierre.total || 0) - (cierre.credito || 0) - (cierre.saldo_favor || 0));
  const abonosUSD = cierre.cobros_credito || 0;
  const creditoUSD = cierre.credito || 0;
  const saldoFavorUSD = cierre.saldo_favor || 0;
  const propinasUSD = cierre.totalPropinasUSD || 0;
  const horaConsulta = res.estado.consultas[res.estado.consultas.length - 1] || '--:--';

  const activeMethodRows = methods
    .filter(m => !['credito', 'convenio', 'garantia', 'cortesia', 'saldo_favor'].includes(m.key))
    .map(m => {
      const valUsd = cierre[m.key] || 0;
      const valBs = cierre.bs ? (cierre.bs[m.key] || 0) : 0;
      if (valUsd <= 0 && valBs <= 0) return null;
      const isUsd = m.moneda === 'USD' || m.key === 'efectivo_usd';
      const montoPrincipal = isUsd ? Utils.formatCurrency(valUsd) : `Bs ${Utils.formatNumber(valBs, true)}`;
      const montoSecundario = isUsd ? '' : `<span style="font-size:11px; color:#64748B; margin-left:6px;">(${Utils.formatCurrency(valUsd)})</span>`;
      return `
        <tr>
          <td style="padding:7px 8px; border-bottom:1px solid #E2E8F0; font-size:13px;">
            ${m.icon || '💳'} ${Utils.escapeHtml(m.label)}
          </td>
          <td style="padding:7px 8px; border-bottom:1px solid #E2E8F0; text-align:right; font-weight:700; font-size:13px; color:#0F172A;">
            ${montoPrincipal}${montoSecundario}
          </td>
        </tr>
      `;
    })
    .filter(Boolean)
    .join('');

  const notaRestantes = res.estado.restantes > 0
    ? `Te quedan <strong>${res.estado.restantes}</strong> consulta${res.estado.restantes === 1 ? '' : 's'} disponible${res.estado.restantes === 1 ? '' : 's'} hoy.`
    : 'Has utilizado las <strong>3 consultas</strong> permitidas de hoy.';

  openModal({
    title: '📊 Reporte X — Venta Total Real',
    showFooter: false,
    content: `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:10px 12px;">
          <div>
            <div style="font-size:13px; font-weight:700; color:#0F172A;">${Utils.escapeHtml(getNombreTiendaCompleto())}</div>
            <div style="font-size:12px; color:#64748B;">📅 ${Utils.formatDate(fecha)} · 🕒 ${Utils.escapeHtml(horaConsulta)}</div>
          </div>
          <span style="padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; background:${res.estado.restantes === 0 ? '#FEF3C7' : '#DBEAFE'}; color:${res.estado.restantes === 0 ? '#92400E' : '#1E40AF'};">
            Consulta ${res.estado.usadas} de ${res.estado.max} hoy
          </span>
        </div>

        <div style="background:linear-gradient(135deg, #064E3B, #047857); color:#fff; border-radius:12px; padding:16px 18px; text-align:center; box-shadow:0 4px 12px rgba(4,120,87,0.2);">
          <div style="font-size:11.5px; text-transform:uppercase; letter-spacing:1px; opacity:0.88; font-weight:700;">
            Venta Total Real del POS en el Momento
          </div>
          <div style="font-size:32px; font-weight:900; margin-top:4px; line-height:1.1;">
            ${Utils.formatCurrency(ventaTotalRealUSD)}
          </div>
          <div style="font-size:15px; font-weight:700; opacity:0.92; margin-top:4px;">
            ≈ Bs ${Utils.formatNumber(ventaTotalRealBs, true)}
          </div>
          <div style="margin-top:8px; font-size:12px; opacity:0.85;">
            ${cierre.cantidadVentas || 0} ${cierre.cantidadVentas === 1 ? 'venta registrada' : 'ventas registradas'} · ${cierre.botellones || 0} botellones
          </div>
        </div>

        <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px; padding:10px 12px; font-size:13px; display:flex; flex-direction:column; gap:5px;">
          <div style="display:flex; justify-content:space-between;">
            <span style="color:#475569;">Ventas cobradas de contado:</span>
            <strong style="color:#0F172A;">${Utils.formatCurrency(contadoUSD)}</strong>
          </div>
          ${abonosUSD > 0 ? `
            <div style="display:flex; justify-content:space-between;">
              <span style="color:#475569;">Abonos / Cobros de crédito:</span>
              <strong style="color:#047857;">+ ${Utils.formatCurrency(abonosUSD)}</strong>
            </div>
          ` : ''}
          ${propinasUSD > 0 ? `
            <div style="display:flex; justify-content:space-between;">
              <span style="color:#475569;">Propinas registradas:</span>
              <strong style="color:#0F172A;">+ ${Utils.formatCurrency(propinasUSD)}</strong>
            </div>
          ` : ''}
          ${(creditoUSD > 0 || saldoFavorUSD > 0) ? `
            <div style="border-top:1px dashed #CBD5E1; margin-top:3px; padding-top:5px; font-size:12px; color:#64748B; display:flex; flex-direction:column; gap:3px;">
              ${creditoUSD > 0 ? `
                <div style="display:flex; justify-content:space-between;">
                  <span>Crédito otorgado (por cobrar, no suma en caja):</span>
                  <strong>${Utils.formatCurrency(creditoUSD)}</strong>
                </div>
              ` : ''}
              ${saldoFavorUSD > 0 ? `
                <div style="display:flex; justify-content:space-between;">
                  <span>Saldo a favor aplicado (abono previo):</span>
                  <strong>${Utils.formatCurrency(saldoFavorUSD)}</strong>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <div>
          <div style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:6px;">
            Desglose Real por Método de Pago
          </div>
          ${activeMethodRows ? `
            <div style="border:1px solid #E2E8F0; border-radius:10px; overflow:hidden; background:#fff;">
              <table style="width:100%; border-collapse:collapse;">
                <tbody>${activeMethodRows}</tbody>
              </table>
            </div>
          ` : `
            <div style="padding:12px; text-align:center; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:8px; font-size:13px; color:#64748B;">
              Aún no hay ventas cobradas registradas en esta fecha.
            </div>
          `}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-top:1px solid #E2E8F0; padding-top:10px;">
          <span style="font-size:12.5px; color:#475569;">${notaRestantes}</span>
          <button type="button" id="btn-cerrar-reporte-x" class="btn btn-primary" style="min-width:110px;">Cerrar</button>
        </div>
      </div>
    `,
    onOpen: (overlay) => {
      overlay.querySelector('#btn-cerrar-reporte-x')?.addEventListener('click', closeModal);
    }
  });
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
        <button id="btn-reporte-x-home" class="btn btn-primary" style="height:36px; padding:0 12px; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
          <span>📊 Reporte X</span>
          <span id="badge-reporte-x-count" style="background:rgba(255,255,255,0.22); padding:1px 7px; border-radius:999px; font-size:11px; font-weight:700;"></span>
        </button>
        <button id="btn-generar-txt-home" class="btn btn-secondary" style="height:36px; padding:0 12px; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:5px;">📋 Reporte Z</button>
      </div>
    </div>
    <div id="cierre-caja-home-content"></div>
  `;

  const contentDiv = container.querySelector('#cierre-caja-home-content');
  const fechaInput = container.querySelector('#cierre-fecha-home');
  const reporteXBtn = container.querySelector('#btn-reporte-x-home');
  const badgeX = container.querySelector('#badge-reporte-x-count');
  const txtBtn = container.querySelector('#btn-generar-txt-home');

  const actualizarEstadoBotonReporteX = () => {
    const est = getReporteXEstadoHoy();
    if (badgeX) badgeX.textContent = `${est.usadas}/${est.max}`;
    if (reporteXBtn) {
      reporteXBtn.title = est.restantes > 0
        ? `Consultar venta total real del POS (${est.restantes} de ${est.max} disponible${est.restantes === 1 ? '' : 's'} hoy)`
        : `Límite diario alcanzado (${est.usadas}/${est.max} consultas usadas hoy)`;
      reporteXBtn.style.opacity = est.usadas >= est.max ? '0.7' : '1';
    }
  };
  actualizarEstadoBotonReporteX();

  fechaInput.addEventListener('change', () => {
    currentActiveTab = null;
    renderCierre(contentDiv, fechaInput.value);
  });

  if (reporteXBtn) {
    reporteXBtn.addEventListener('click', () => {
      openReporteXModal(fechaInput.value, () => actualizarEstadoBotonReporteX());
    });
  }

  if (txtBtn) {
    txtBtn.addEventListener('click', () => {
      descargarReporteTxt(fechaInput.value);
    });
  }

  renderCierre(contentDiv, today);
}
