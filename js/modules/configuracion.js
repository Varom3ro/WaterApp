import { store } from '../store.js';
import { Utils } from '../utils.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { syncToCloud, getCloudBackup, restoreFromCloud, backupToCloudNow } from '../cloud-sync.js?v=2.8.71';
import { renderSidebar } from '../components/sidebar.js';
import { Licencia } from '../licencia.js';
import {
  esCuentaRefillH2O,
  getMetasRefillConfigLocal,
  cargarMetasRefillDesdeNube,
  guardarMetasRefillEnNube
} from '../refill-metas.js?v=2.8.71';

export function renderConfiguracion(container) {
  const tipos = store.getConfig('tiposBotellon') || [{ id: '20l', nombre: 'Botellón 20 Litros', litros: 20, precio: 1.50 }];
  const repartidores = store.getConfig('repartidores') || [];
  const tarifasDelivery = store.getTarifasDelivery();
  const currentTasa = store.getConfig('tasaCambio') || 40.00;
  const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
  const empresaLogo = store.getConfig('empresaLogo') || './img/logo.png';
  const moduloCaudalimetro = store.getConfig('moduloCaudalimetro') || false;
  const unidadCaudalimetro = store.getConfig('unidadCaudalimetro') || 'L';
  const cortesiaBotellonNuevo = store.getConfig('cortesiaBotellonNuevo') === true;
  const moduloMermaLavado = store.getConfig('moduloMermaLavado') !== false;
  const mermaLavadoBase20L = parseFloat(store.getConfig('mermaLavadoBase20L')) || 1.0;
  const bloquearVentaSinAgua = store.getConfig('bloquearVentaSinAgua') === true;
  const metodosPago = store.getMetodosPago(false);

  let usuarioEmail = 'Licencia Local';
  let diasRestantesText = '';
  try {
    const lic = JSON.parse(localStorage.getItem('licencia_usuario') || '{}');
    if (lic.email) usuarioEmail = lic.email;
    if (lic.fecha_registro && lic.dias_prueba) {
      const reg = new Date(lic.fecha_registro);
      const exp = new Date(reg.getTime() + (lic.dias_prueba * 24 * 60 * 60 * 1000));
      const diffDays = Math.max(0, Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)));
      diasRestantesText = `${diffDays} días restantes`;
    }
  } catch (e) {}

  const esRefill = esCuentaRefillH2O(usuarioEmail);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Configuración</h1>
        <p class="page-subtitle">Parámetros generales del sistema</p>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Cuenta y Licencia -->
      <div class="card full-width mb-md" style="background: linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%); border: 1.5px solid #BBF7D0;">
        <div class="card-header" style="border-bottom: 1px solid #DCFCE7;">
          <h3 class="card-title" style="color: #166534;">👤 Cuenta y Licencia Activa</h3>
        </div>
        <div class="card-body mt-md" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px;">Correo de la Cuenta / Tienda</div>
            <div style="font-size: 17px; font-weight: 800; color: #0F172A; margin-top: 2px;">
              ${Utils.escapeHtml(usuarioEmail)}
            </div>
            <div style="display: flex; gap: 8px; align-items: center; margin-top: 6px;">
              <span class="badge badge-success" style="font-size: 11px; padding: 3px 8px;">🟢 Licencia Activa</span>
              ${diasRestantesText ? `<span style="font-size: 12px; color: #166534; font-weight: 600;">⏳ ${diasRestantesText}</span>` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btn-sync-cloud-manual" class="btn btn-sm btn-primary" style="font-size: 12px; padding: 7px 14px; font-weight: 600;">
              ☁️ Sincronizar Nube Ahora
            </button>
          </div>
        </div>
      </div>

      ${esRefill ? renderMetasRefillCardHTML(getMetasRefillConfigLocal(store)) : ''}

      <!-- Identidad de la Empresa -->
      <div class="card full-width mb-lg">
        <div class="card-header">
          <h3 class="card-title">🏢 Identidad de la Empresa y Logotipo</h3>
        </div>
        <div class="card-body mt-md">
          <div class="form-row" style="align-items: flex-start;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Nombre de la Empresa</label>
              <input type="text" class="form-control" id="input-empresa-nombre" value="${Utils.escapeHtml(empresaNombre)}" placeholder="Ej: Tu Empresa"/>
              <small style="color: var(--color-text-secondary); margin-top: 4px; display: block;">
                Este nombre aparecerá en el menú lateral, reportes y felicitaciones de WhatsApp.
              </small>
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">Logotipo de la Empresa</label>
              <input type="file" class="form-control" id="input-empresa-logo" accept="image/*"/>
              <div style="margin-top: 10px; padding: 14px; border: 1px dashed var(--color-border); border-radius: 8px; text-align: center; background: var(--color-bg-body, #fafafa); min-height: 90px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <small style="color: var(--color-text-secondary); display: block; margin-bottom: 8px;">Vista previa actual:</small>
                <img id="preview-empresa-logo" src="${empresaLogo}" alt="Logo Preview" style="max-height: 120px; width: 100%; max-width: 100%; object-fit: contain; border-radius: 4px; display: block;"/>
                <div style="margin-top: 10px;">
                  <button type="button" class="btn btn-xs btn-secondary" id="btn-remove-logo" style="color: var(--color-danger); border-color: #fca5a5; padding: 4px 8px; font-size: 11px;">
                    🗑️ Quitar Logotipo (Usar Genérico)
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div style="margin-top: 15px; text-align: right;">
            <button class="btn btn-primary" id="btn-save-empresa-info">
              💾 Guardar Datos de la Empresa
            </button>
          </div>
        </div>
      </div>

      <!-- Tipos de Botellón -->
      <div class="card full-width">
        <div class="card-header">
          <h3 class="card-title">🧴 Tipos de Botellón y Precios</h3>
          <button class="btn btn-sm btn-primary" id="btn-add-tipo">
            + Agregar Nuevo Tipo
          </button>
        </div>
        <div class="table-container mt-md">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 45%;">Nombre</th>
                <th style="width: 20%;">Capacidad</th>
                <th style="width: 20%;">Precio de Venta</th>
                <th style="width: 15%; text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody id="tipos-tbody">
              ${tipos.map(t => {
                const isBs = t.moneda === 'VES' || t.moneda === 'Bs';
                return `
                <tr>
                  <td>
                    <div class="font-semibold">${Utils.escapeHtml(t.nombre)}</div>
                    <div style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase;">
                      ${t.categoria === 'producto' ? 'Producto Físico' : 'Recarga'}
                    </div>
                  </td>
                  <td>
                    ${t.categoria === 'producto' ? `
                      <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        <span class="badge ${ (t.stock || 0) > 0 ? 'badge-info' : 'badge-warning'}" style="font-size: 11px; padding: 3px 8px;">
                          📦 Stock: <b>${t.stock !== undefined ? t.stock : 0}</b> un.
                        </span>
                        ${Utils.esProductoConAguaCortesia(t) ? `
                          <span class="badge" style="font-size: 10.5px; padding: 3px 7px; background: #EDE9FE; color: #6D28D9; border: 1px solid #DDD6FE;">
                            🎁 +Agua ${Utils.obtenerLitrosAguaProducto(t)}L
                          </span>
                        ` : ''}
                      </div>
                    ` : `
                      <span style="font-weight: 500;">💧 ${t.litros + 'L'}</span>
                    `}
                  </td>
                  <td class="font-semibold" style="white-space: nowrap;">
                    ${isBs ? `
                      <span style="color: #2563EB;">Bs ${Utils.formatNumber(t.precio, true)}</span>
                      <span style="font-size: 10px; color: #1E40AF; background: #EFF6FF; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: normal;">Fijo en Bs</span>
                    ` : `
                      <span class="text-success">${Utils.formatCurrency(t.precio || 0)}</span>
                      <span style="font-size: 10px; color: #166534; background: #F0FDF4; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: normal;">Fijo en $</span>
                    `}
                  </td>
                  <td style="text-align: right;">
                    <div class="flex gap-sm" style="justify-content: flex-end;">
                      <button class="btn btn-sm btn-secondary btn-edit-tipo" data-id="${t.id}">✏️ Editar</button>
                      <button class="btn btn-sm btn-secondary btn-delete-tipo" data-id="${t.id}">🗑️</button>
                    </div>
                  </td>
                </tr>
              `;}).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Gestión Integral de Delivery -->
      <div class="card full-width">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>🛵</span> Gestión Integral de Delivery
            </h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Configura las tarifas por zona (Local y Afuera) y administra tu equipo de repartidores.
            </p>
          </div>
        </div>

        <div class="card-body mt-md" style="display: flex; flex-direction: column; gap: 22px;">
          <!-- Subsección 1: Tarifas y Zonas de Entrega -->
          <div style="background: #F8FAFC; border: 1px solid var(--color-border); border-radius: 8px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
              <div>
                <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--color-primary-900); display: flex; align-items: center; gap: 6px;">
                  <span>📍</span> Tarifas y Zonas de Entrega
                </h4>
                <p class="text-muted" style="font-size: 12px; margin: 2px 0 0 0;">
                  Precios predeterminados en dólares ($) para seleccionar rápidamente en el Punto de Venta.
                </p>
              </div>
              <button type="button" class="btn btn-sm btn-outline-primary" id="btn-add-tarifa-delivery" style="font-weight: 600;">
                + Agregar Zona / Tarifa
              </button>
            </div>

            <div class="table-container" style="background: white; border-radius: 6px; border: 1px solid var(--color-border);">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th style="width: 35%;">Zona / Concepto</th>
                    <th style="width: 25%;">Precio ($ USD)</th>
                    <th style="width: 25%;">Equivalente en Bs</th>
                    <th style="width: 15%; text-align: right;">Acciones</th>
                  </tr>
                </thead>
                <tbody id="tarifas-delivery-tbody">
                  ${tarifasDelivery.map(t => {
                    const equivBs = (parseFloat(t.precio) || 0) * currentTasa;
                    const isDefault = t.id === 'local' || t.id === 'afuera';
                    return `
                      <tr>
                        <td>
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 18px;">${t.id === 'local' ? '📍' : (t.id === 'afuera' ? '🚗' : '🚚')}</span>
                            <span class="font-semibold" style="font-size: 13.5px;">${Utils.escapeHtml(t.nombre)}</span>
                            ${isDefault ? `<span class="badge" style="font-size: 10px; padding: 2px 6px; background: #E2E8F0; color: #475569;">Fija</span>` : ''}
                          </div>
                        </td>
                        <td>
                          <span style="font-weight: 700; font-size: 14px; color: #065F46;">$ ${Utils.formatNumber(t.precio, true)}</span>
                        </td>
                        <td>
                          <span class="text-muted" style="font-size: 13px;">Bs ${Utils.formatNumber(equivBs, true)}</span>
                        </td>
                        <td style="text-align: right;">
                          <div class="flex gap-sm" style="justify-content: flex-end;">
                            <button type="button" class="btn btn-sm btn-secondary btn-edit-tarifa-delivery" data-id="${t.id}" title="Editar tarifa">✏️ Editar</button>
                            ${!isDefault ? `
                              <button type="button" class="btn btn-sm btn-secondary btn-delete-tarifa-delivery" data-id="${t.id}" title="Eliminar tarifa">🗑️</button>
                            ` : ''}
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Subsección 2: Equipo de Repartidores -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
              <div>
                <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--color-primary-900); display: flex; align-items: center; gap: 6px;">
                  <span>🛵</span> Equipo de Repartidores
                </h4>
                <p class="text-muted" style="font-size: 12px; margin: 2px 0 0 0;">
                  Personal para la asignación y control de viajes en cada despacho.
                </p>
              </div>
              <button class="btn btn-sm btn-primary" id="btn-add-repartidor">
                + Agregar Repartidor
              </button>
            </div>

            <div class="table-container">
              <table class="table">
                <thead>
                  <tr>
                    <th style="width: 45%;">Nombre del Repartidor</th>
                    <th style="width: 20%;"></th>
                    <th style="width: 20%;">Estado</th>
                    <th style="width: 15%; text-align: right;">Acciones</th>
                  </tr>
                </thead>
                <tbody id="repartidores-tbody">
                  ${repartidores.length === 0 ? `
                    <tr><td colspan="4" class="text-muted text-center" style="padding:15px;">No hay repartidores registrados.</td></tr>
                  ` : repartidores.map(r => `
                    <tr>
                      <td class="font-semibold">${Utils.escapeHtml(r.nombre)}</td>
                      <td></td>
                      <td><span class="badge badge-success">Activo</span></td>
                      <td style="text-align: right;">
                        <div class="flex gap-sm" style="justify-content: flex-end;">
                          <button class="btn btn-sm btn-secondary btn-edit-repartidor" data-id="${r.id}">✏️ Editar</button>
                          <button class="btn btn-sm btn-secondary btn-delete-repartidor" data-id="${r.id}">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Métodos de Pago Aceptados -->
      <div class="card full-width">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title">💳 Métodos de Pago Aceptados</h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Administra las formas de cobro disponibles en el Punto de Venta, Arqueo de Caja y Reportes.
            </p>
          </div>
          <button class="btn btn-sm btn-primary" id="btn-add-metodo-pago">
            + Anexar Método de Pago
          </button>
        </div>
        <div class="table-container mt-md">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 40%;">Método de Pago</th>
                <th style="width: 25%;">Moneda de Recepción</th>
                <th style="width: 15%;">Tipo</th>
                <th style="width: 20%; text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody id="metodos-pago-tbody">
              ${metodosPago.map(m => `
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span style="font-size: 20px;">${m.icon || '💳'}</span>
                      <span class="font-semibold" style="font-size: 14px;">${Utils.escapeHtml(m.label)}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge ${m.moneda === 'USD' ? 'badge-success' : 'badge-info'}" style="font-size: 11px; padding: 4px 9px;">
                      ${m.moneda === 'USD' ? '💵 Dólares (USD)' : '💴 Bolívares (Bs)'}
                    </span>
                  </td>
                  <td>
                    ${m.isCustom ? `
                      <span class="badge badge-secondary" style="font-size: 11px; padding: 3px 8px;">Personalizado</span>
                    ` : `
                      <span class="badge" style="font-size: 11px; padding: 3px 8px; background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1;">Por Defecto</span>
                    `}
                  </td>
                  <td style="text-align: right;">
                    ${m.isCustom ? `
                      <div class="flex gap-sm" style="justify-content: flex-end;">
                        <button class="btn btn-sm btn-secondary btn-edit-metodo-pago" data-id="${m.id}">✏️ Editar</button>
                        <button class="btn btn-sm btn-secondary btn-delete-metodo-pago" data-id="${m.id}">🗑️</button>
                      </div>
                    ` : `
                      <span class="text-muted" style="font-size: 12px; font-style: italic;">Predeterminado</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Zonas y Urbanizaciones de Clientes -->
      <div class="card full-width" style="border-left: 4px solid #3B82F6;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>📍</span> Zonas y Urbanizaciones de Clientes
            </h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Personaliza los municipios y sectores frecuentes de tu tienda para autocompletar rápidamente al registrar clientes.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <label for="select-preset-zonas" style="font-size: 12px; font-weight: 600; color: var(--color-text-secondary); margin: 0;">
              📍 Cargar Plantilla:
            </label>
            <select id="select-preset-zonas" class="form-control" style="font-size: 12px; padding: 4px 10px; height: 32px; min-width: 210px; cursor: pointer; border-radius: 6px; font-weight: 500;">
              <option value="">-- Seleccionar plantilla --</option>
              <option value="este">📍 La California / Sucre</option>
              <option value="oeste">📍 El Paraíso / Libertador</option>
              <option value="santa_eduvigis">📍 Santa Eduvigis / Sucre - Chacao</option>
              <option value="santa_fe">📍 Santa Fe / Baruta</option>
            </select>
          </div>
        </div>

        <div class="card-body mt-md">
          <div class="form-row" style="align-items: flex-start; gap: 20px;">
            <!-- Municipios -->
            <div class="form-group" style="flex: 1; min-width: 250px;">
              <label class="form-label" style="font-weight: 700;">🏙️ Municipios / Zonas Activas</label>
              <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                <input type="text" id="input-nuevo-municipio" class="form-control" placeholder="Ej: Sucre, Chacao..." style="font-size: 13px;" />
                <button type="button" id="btn-add-municipio" class="btn btn-secondary btn-sm" style="white-space: nowrap;">+ Agregar</button>
              </div>
              <div id="container-tags-municipios" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 140px; overflow-y: auto; padding: 10px; background: var(--color-bg-body, #f8fafc); border: 1px solid var(--color-border); border-radius: 8px;"></div>
            </div>

            <!-- Urbanizaciones -->
            <div class="form-group" style="flex: 2; min-width: 300px;">
              <label class="form-label" style="font-weight: 700;">🏘️ Urbanizaciones / Sectores de esta Tienda</label>
              <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                <input type="text" id="input-nueva-urbanizacion" class="form-control" placeholder="Ej: La California Sur, Macaracuay..." style="font-size: 13px;" />
                <button type="button" id="btn-add-urbanizacion" class="btn btn-primary btn-sm" style="white-space: nowrap;">+ Agregar Sector</button>
              </div>
              <div id="container-tags-urbanizaciones" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow-y: auto; padding: 10px; background: var(--color-bg-body, #f8fafc); border: 1px solid var(--color-border); border-radius: 8px;"></div>
            </div>
          </div>

          <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-top: 1px solid var(--color-border); padding-top: 12px;">
            <span style="font-size: 12px; color: var(--color-text-secondary);">
              💡 <em>Al crear o editar clientes también podrás usar la opción <strong>➕ Otra (Personalizada)</strong> en cualquier momento.</em>
            </span>
            <button type="button" id="btn-guardar-zonas-config" class="btn btn-primary">
              💾 Guardar Zonas de la Tienda
            </button>
          </div>
        </div>
      </div>

      <!-- Reloj Medidor de Agua (Caudalímetro) -->
      <div class="card full-width" style="border-left: 4px solid var(--color-primary-600, #1B4332);">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>⏱️</span> Reloj Medidor de Agua (Caudalímetro)
            </h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Permite registrar la lectura inicial al abrir la tienda y la lectura final al cerrar para auditar los litros despachados en Punto de Venta y Cierre de Caja.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="label-status-caudalimetro" style="font-size: 13px; font-weight: 700; color: ${moduloCaudalimetro ? '#15803D' : '#64748B'};">
              ${moduloCaudalimetro ? '🟢 Activado' : '⚪ Desactivado'}
            </span>
            <label style="position: relative; display: inline-block; width: 50px; height: 26px; margin: 0; cursor: pointer;">
              <input type="checkbox" id="toggle-caudalimetro" ${moduloCaudalimetro ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="slider-caudalimetro" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${moduloCaudalimetro ? '#15803D' : '#CBD5E1'}; transition: .3s; border-radius: 26px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
                <span id="slider-knob-caudalimetro" style="position: absolute; content: ''; height: 20px; width: 20px; left: ${moduloCaudalimetro ? '27px' : '3px'}; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
              </span>
            </label>
          </div>
        </div>

        <div id="caudalimetro-config-body" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--color-border); display: ${moduloCaudalimetro ? 'block' : 'none'};">
          <div class="form-row" style="align-items: center; gap: 20px; flex-wrap: wrap;">
            <div class="form-group" style="max-width: 260px; margin-bottom: 0;">
              <label class="form-label" style="font-size: 13px; font-weight: 600;">Unidad de Medida del Reloj:</label>
              <select id="select-unidad-caudalimetro" class="form-control" style="height: 38px;">
                <option value="L" ${unidadCaudalimetro === 'L' ? 'selected' : ''}>Litros (L)</option>
                <option value="m3" ${unidadCaudalimetro === 'm3' ? 'selected' : ''}>Metros Cúbicos (m³ = 1.000 L)</option>
              </select>
            </div>
            <div style="font-size: 13px; color: var(--color-text-secondary); max-width: 500px; line-height: 1.4;">
              💡 <em>Al estar activado, aparecerá el contador al lado derecho del título <strong>"Punto de Venta"</strong> y una sección de auditoría en el <strong>Cierre de Caja</strong> para comparar los litros del reloj físico con las ventas facturadas.</em>
            </div>
          </div>
        </div>
      </div>

      <!-- Recarga de Agua de Cortesía en Botellón Nuevo -->
      <div class="card full-width" style="border-left: 4px solid #7C3AED;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>🎁</span> Recarga de Agua de Cortesía en Botellón Nuevo
            </h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Permite incluir automáticamente una recarga de agua gratis ($0.00) por cortesía al vender un envase o botellón nuevo del catálogo de productos.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="label-status-cortesia-botellon" style="font-size: 13px; font-weight: 700; color: ${cortesiaBotellonNuevo ? '#15803D' : '#64748B'};">
              ${cortesiaBotellonNuevo ? '🟢 Activado' : '⚪ Desactivado'}
            </span>
            <label style="position: relative; display: inline-block; width: 50px; height: 26px; margin: 0; cursor: pointer;">
              <input type="checkbox" id="toggle-cortesia-botellon" ${cortesiaBotellonNuevo ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="slider-cortesia-botellon" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${cortesiaBotellonNuevo ? '#15803D' : '#CBD5E1'}; transition: .3s; border-radius: 26px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
                <span id="slider-knob-cortesia-botellon" style="position: absolute; content: ''; height: 20px; width: 20px; left: ${cortesiaBotellonNuevo ? '27px' : '3px'}; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
              </span>
            </label>
          </div>
        </div>

        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border); font-size: 13px; color: var(--color-text-secondary); line-height: 1.4;">
          💡 <em>Al estar <strong>Activado</strong>, al seleccionar cualquier botellón de la lista de productos en el Punto de Venta se incluirá el agua de cortesía gratis (descontando los litros de agua del tanque sin costo extra) y con la opción de quitarla en el carrito. Al estar <strong>Desactivado</strong>, los botellones se venderán como envases vacíos normales sin recarga de agua.</em>
      </div>

      <!-- Merma de Agua por Lavado de Botellones -->
      <div class="card full-width" style="border-left: 4px solid #0284C7;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>🧼</span> Merma de Agua por Lavado de Botellones
            </h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Calcula y descuenta automáticamente el agua utilizada en el enjuague y lavado al realizar cualquier recarga de agua, asegurando un cuadre exacto con el reloj medidor (caudalímetro) y el nivel del tanque.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="label-status-merma-lavado" style="font-size: 13px; font-weight: 700; color: ${moduloMermaLavado ? '#15803D' : '#64748B'};">
              ${moduloMermaLavado ? '🟢 Activado' : '⚪ Desactivado'}
            </span>
            <label style="position: relative; display: inline-block; width: 50px; height: 26px; margin: 0; cursor: pointer;">
              <input type="checkbox" id="toggle-merma-lavado" ${moduloMermaLavado ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="slider-merma-lavado" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${moduloMermaLavado ? '#15803D' : '#CBD5E1'}; transition: .3s; border-radius: 26px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
                <span id="slider-knob-merma-lavado" style="position: absolute; content: ''; height: 20px; width: 20px; left: ${moduloMermaLavado ? '27px' : '3px'}; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
              </span>
            </label>
          </div>
        </div>

        <div id="merma-lavado-config-body" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--color-border); display: ${moduloMermaLavado ? 'block' : 'none'};">
          <div class="form-row" style="align-items: center; gap: 20px; flex-wrap: wrap;">
            <div class="form-group" style="max-width: 300px; margin-bottom: 0;">
              <label class="form-label" style="font-size: 13px; font-weight: 600;">Merma base para Botellón de 20 Litros:</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="number" id="input-merma-base-20l" class="form-control" style="height: 38px; width: 110px;" step="0.1" min="0" max="5" value="${mermaLavadoBase20L}">
                <span style="font-weight: 600; font-size: 13px; color: #475569;">Litro(s) de merma</span>
              </div>
            </div>
            <div style="font-size: 13px; color: var(--color-text-secondary); max-width: 580px; line-height: 1.4;">
              💡 <em>Tasa de cálculo: <strong>${((mermaLavadoBase20L / 20) * 100).toFixed(1)}%</strong> sobre el volumen recargado. Aplica proporcionalmente a todos los litrajes (ej. 20L = ${mermaLavadoBase20L}L, 19L = ${(19 * (mermaLavadoBase20L / 20)).toFixed(2)}L, 12L = ${(12 * (mermaLavadoBase20L / 20)).toFixed(2)}L, 5L = ${(5 * (mermaLavadoBase20L / 20)).toFixed(2)}L, 2L = ${(2 * (mermaLavadoBase20L / 20)).toFixed(2)}L, 1.5L = ${(1.5 * (mermaLavadoBase20L / 20)).toFixed(3)}L).</em>
            </div>
          </div>
        </div>
      </div>

      <!-- Control de Ventas con Tanque Vacío -->
      <div class="card full-width" style="border-left: 4px solid #EF4444;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>🚰</span> Control de Ventas con Tanque Vacío (0 L)
            </h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Define si el Punto de Venta muestra una alerta de confirmación o bloquea estrictamente la venta de recargas cuando el tanque no tiene agua suficiente.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span id="label-status-bloquear-sin-agua" style="font-size: 13px; font-weight: 700; color: ${bloquearVentaSinAgua ? '#DC2626' : '#D97706'};">
              ${bloquearVentaSinAgua ? '🔴 Bloqueo Estricto' : '🟡 Alerta y Confirmación'}
            </span>
            <label style="position: relative; display: inline-block; width: 50px; height: 26px; margin: 0; cursor: pointer;">
              <input type="checkbox" id="toggle-bloquear-sin-agua" ${bloquearVentaSinAgua ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="slider-bloquear-sin-agua" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${bloquearVentaSinAgua ? '#DC2626' : '#CBD5E1'}; transition: .3s; border-radius: 26px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
                <span id="slider-knob-bloquear-sin-agua" style="position: absolute; content: ''; height: 20px; width: 20px; left: ${bloquearVentaSinAgua ? '27px' : '3px'}; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
              </span>
            </label>
          </div>
        </div>

        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border); font-size: 13px; color: var(--color-text-secondary); line-height: 1.5;">
          <div>🟡 <strong>Modo Alerta y Confirmación (Recomendado):</strong> Muestra aviso visible cuando el tanque baja del 15% o llega a <code>0 L</code> (con acceso rápido a cisterna) y solicita confirmación antes de facturar recargas sin agua.</div>
          <div style="margin-top: 4px;">🔴 <strong>Bloqueo Estricto (Activado):</strong> Impide facturar recargas o botellones con agua gratis si el tanque no tiene litros suficientes hasta cargar cisterna o calibrar el tanque. Los productos físicos sin agua (forros, tapas, dispensadores, etc.) siempre se pueden vender normalmente.</div>
        </div>
      </div>

      <!-- Seguridad y Roles de Acceso -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🔐 Seguridad y Contraseñas de Acceso</h3>
        </div>
        <p class="text-muted mb-md" style="font-size:var(--font-size-sm)">Gestiona las credenciales del Administrador (Dueño) y del Operario (Punto de Venta).</p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-lg);">
          <!-- Clave Admin -->
          <div style="background: var(--color-bg); padding: var(--space-md); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
            <h4 style="font-size: 14px; font-weight: 700; color: var(--color-primary-900); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>🛡️</span> Contraseña de Administrador (Dueño)
            </h4>
            <p class="text-muted" style="font-size: 11.5px; margin-bottom: 12px;">Acceso total a finanzas, reportes, ganancias, configuración y anulación de ventas.</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
              <div class="form-group mb-xs">
                <label class="form-label" style="font-size: var(--font-size-xs);">Contraseña Actual</label>
                <input type="password" id="input-pwd-actual" class="form-control" placeholder="Clave actual (defecto admins)" style="font-size: 13px;" />
              </div>
              <div class="form-group mb-xs">
                <label class="form-label" style="font-size: var(--font-size-xs);">Nueva Contraseña</label>
                <input type="password" id="input-pwd-nueva" class="form-control" placeholder="Nueva clave (mín. 4 caracteres)" style="font-size: 13px;" />
              </div>
              <div class="form-group mb-xs">
                <label class="form-label" style="font-size: var(--font-size-xs);">Confirmar Contraseña</label>
                <input type="password" id="input-pwd-confirmar" class="form-control" placeholder="Repite la nueva clave" style="font-size: 13px;" />
              </div>
              <button class="btn btn-primary btn-sm" id="btn-save-password" style="width: 100%; margin-top: 6px;">
                🔑 Actualizar Clave Admin
              </button>
            </div>
          </div>

          <!-- PIN Operario -->
          <div style="background: var(--color-bg); padding: var(--space-md); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
            <h4 style="font-size: 14px; font-weight: 700; color: #854D0E; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>🟡</span> PIN de Operario (Cajero)
            </h4>
            <p class="text-muted" style="font-size: 11.5px; margin-bottom: 12px;">Permite operar ventas, cobrar deudas y registrar cisternas de agua sin ver ganancias ni métricas.</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
              <div class="form-group mb-xs">
                <label class="form-label" style="font-size: var(--font-size-xs);">Nuevo PIN / Clave de Operario</label>
                <input type="text" id="input-operario-pin" class="form-control" value="${store.getOperarioPassword ? store.getOperarioPassword() : '1234'}" placeholder="Ej: 1234" style="font-size: 15px; font-weight: 700; letter-spacing: 2px;" />
              </div>
              <p class="text-muted" style="font-size: 11px; margin-top: 2px;">PIN por defecto: <code>1234</code>. Puede contener números o letras.</p>
              <button class="btn btn-secondary btn-sm" id="btn-save-operario-pin" style="width: 100%; margin-top: 18px; background: #FEF9C3; border-color: #FDE047; color: #854D0E; font-weight: 700;">
                💾 Guardar PIN de Operario
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Respaldo y Recuperación en la Nube (Plan Plus) -->
      <div class="card full-width" style="border-left: 4px solid #0284C7;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 8px;">
              <span>☁️</span> Respaldo y Recuperación en la Nube (Plan Plus)
            </h3>
            <p class="text-muted" style="font-size: var(--font-size-sm); margin-top: 4px;">
              Copia de seguridad en tiempo real en la nube para proteger tus clientes, catálogo, ventas e inventario ante pérdida de equipo o formateo.
            </p>
          </div>
          <span class="badge" style="background: rgba(2, 132, 199, 0.1); color: #0284C7; font-weight: 700; border: 1px solid rgba(2, 132, 199, 0.3); padding: 4px 10px; border-radius: 6px;">
            🔒 Blindaje de Equipo Activo
          </span>
        </div>

        <div class="card-body mt-md">
          <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; background: var(--color-bg-body, #f8fafc); padding: 14px; border-radius: 8px; border: 1px solid var(--color-border);">
            <div style="flex: 1; min-width: 200px;">
              <span style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 4px;">Cuenta Vinculada</span>
              <strong id="label-cloud-email" style="font-size: 14px; color: var(--color-primary-800, #0F766E); word-break: break-all;">${usuarioEmail}</strong>
            </div>
            <div style="flex: 1; min-width: 200px;">
              <span style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 4px;">Estado de Protección</span>
              <span style="color: #15803D; font-weight: 700; font-size: 13px;">🟢 Conectado y Blindado</span>
            </div>
            <div style="flex: 1; min-width: 200px;">
              <span style="font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 4px;">Último Respaldo en la Nube</span>
              <span id="label-cloud-last-backup" style="font-size: 13px; color: var(--color-text-primary); font-weight: 600;">Consultando...</span>
            </div>
          </div>

          <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <button class="btn btn-primary" id="btn-backup-cloud-now" style="background: #0284C7; border-color: #0284C7; display: flex; align-items: center; gap: 8px;">
              <span>☁️</span> Respaldar Todo en la Nube Ahora
            </button>
            <button class="btn btn-secondary" id="btn-restore-cloud-now" style="display: flex; align-items: center; gap: 8px;">
              <span>🔄</span> Restaurar desde la Nube
            </button>
          </div>
        </div>
      </div>

      <!-- Backup Local -->
      <div class="card full-width">
        <div class="card-header">
          <h3 class="card-title">💾 Copia de Seguridad Local (Archivo JSON)</h3>
        </div>
        <p class="text-muted mb-md" style="font-size:var(--font-size-sm)">Descarga una copia completa en tu disco duro o pendrive, o importa un archivo previamente exportado.</p>
        <div class="flex gap-md" style="flex-wrap:wrap">
          <button class="btn btn-secondary" id="btn-export">📥 Descargar Archivo JSON</button>
          <label class="btn btn-secondary" style="cursor:pointer">
            📤 Cargar Archivo JSON
            <input type="file" accept=".json" id="btn-import" style="display:none"/>
          </label>
        </div>
      </div>
    </div>
  `;

  // Events
  const btnSyncManual = container.querySelector('#btn-sync-cloud-manual');
  if (btnSyncManual) {
    btnSyncManual.addEventListener('click', async () => {
      btnSyncManual.disabled = true;
      btnSyncManual.textContent = '⏳ Sincronizando...';
      try {
        const ok = await syncToCloud(true);
        if (ok) {
          const clientes = store.getAll('clientes') || [];
          const ventas = store.getAll('ventas') || [];
          showToast(`☁️ Datos sincronizados con la Nube con éxito (${clientes.length} clientes, ${ventas.length} ventas)`, 'success');
          const lblLastCloud = container.querySelector('#label-cloud-last-backup');
          if (lblLastCloud) {
            lblLastCloud.innerHTML = `${new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} <span style="color:#64748B; font-weight:normal;">(${clientes.length} clientes · ${ventas.length} ventas)</span>`;
          }
        } else {
          showToast('⚠️ No se pudo sincronizar con la nube. Intente nuevamente.', 'warning');
        }
      } catch (err) {
        showToast('Error al sincronizar: ' + (err.message || 'Error de comunicación'), 'danger');
      } finally {
        btnSyncManual.disabled = false;
        btnSyncManual.textContent = '☁️ Sincronizar Nube Ahora';
      }
    });
  }

  if (esRefill) {
    initMetasRefillConfigEvents(container);
  }

  // Caudalímetro Toggle & Unidad
  const toggleCaudalimetro = container.querySelector('#toggle-caudalimetro');
  const caudalimetroBody = container.querySelector('#caudalimetro-config-body');
  const labelStatusCaudalimetro = container.querySelector('#label-status-caudalimetro');
  const sliderCaudalimetro = container.querySelector('#slider-caudalimetro');
  const sliderKnobCaudalimetro = container.querySelector('#slider-knob-caudalimetro');
  const selectUnidadCaudalimetro = container.querySelector('#select-unidad-caudalimetro');

  if (toggleCaudalimetro) {
    toggleCaudalimetro.addEventListener('change', (e) => {
      const activo = e.target.checked;
      store.setConfig('moduloCaudalimetro', activo);
      
      if (caudalimetroBody) caudalimetroBody.style.display = activo ? 'block' : 'none';
      if (labelStatusCaudalimetro) {
        labelStatusCaudalimetro.textContent = activo ? '🟢 Activado' : '⚪ Desactivado';
        labelStatusCaudalimetro.style.color = activo ? '#15803D' : '#64748B';
      }
      if (sliderCaudalimetro) {
        sliderCaudalimetro.style.backgroundColor = activo ? '#15803D' : '#CBD5E1';
      }
      if (sliderKnobCaudalimetro) {
        sliderKnobCaudalimetro.style.left = activo ? '27px' : '3px';
      }

      showToast(activo ? '⏱️ Módulo Reloj Medidor Activado' : 'Módulo Reloj Medidor Desactivado', activo ? 'success' : 'info');
    });
  }

  if (selectUnidadCaudalimetro) {
    selectUnidadCaudalimetro.addEventListener('change', (e) => {
      store.setConfig('unidadCaudalimetro', e.target.value);
      showToast('Unidad de medida del reloj actualizada', 'success');
    });
  }

  // Cortesía Botellón Nuevo Toggle
  const toggleCortesiaBotellon = container.querySelector('#toggle-cortesia-botellon');
  const labelStatusCortesiaBotellon = container.querySelector('#label-status-cortesia-botellon');
  const sliderCortesiaBotellon = container.querySelector('#slider-cortesia-botellon');
  const sliderKnobCortesiaBotellon = container.querySelector('#slider-knob-cortesia-botellon');

  if (toggleCortesiaBotellon) {
    toggleCortesiaBotellon.addEventListener('change', (e) => {
      const activo = e.target.checked;
      store.setConfig('cortesiaBotellonNuevo', activo);
      
      if (labelStatusCortesiaBotellon) {
        labelStatusCortesiaBotellon.textContent = activo ? '🟢 Activado' : '⚪ Desactivado';
        labelStatusCortesiaBotellon.style.color = activo ? '#15803D' : '#64748B';
      }
      if (sliderCortesiaBotellon) {
        sliderCortesiaBotellon.style.backgroundColor = activo ? '#15803D' : '#CBD5E1';
      }
      if (sliderKnobCortesiaBotellon) {
        sliderKnobCortesiaBotellon.style.left = activo ? '27px' : '3px';
      }

      showToast(activo ? '🎁 Cortesía de agua en botellones nuevos activada' : 'Cortesía de agua en botellones nuevos desactivada', activo ? 'success' : 'info');
      if (typeof syncToCloud === 'function') syncToCloud();
    });
  }

  // Merma de Lavado Toggle & Base 20L
  const toggleMermaLavado = container.querySelector('#toggle-merma-lavado');
  const labelStatusMermaLavado = container.querySelector('#label-status-merma-lavado');
  const sliderMermaLavado = container.querySelector('#slider-merma-lavado');
  const sliderKnobMermaLavado = container.querySelector('#slider-knob-merma-lavado');
  const mermaConfigBody = container.querySelector('#merma-lavado-config-body');
  const inputMermaBase20L = container.querySelector('#input-merma-base-20l');

  if (toggleMermaLavado) {
    toggleMermaLavado.addEventListener('change', (e) => {
      const activo = e.target.checked;
      store.setConfig('moduloMermaLavado', activo);
      if (labelStatusMermaLavado) {
        labelStatusMermaLavado.textContent = activo ? '🟢 Activado' : '⚪ Desactivado';
        labelStatusMermaLavado.style.color = activo ? '#15803D' : '#64748B';
      }
      if (sliderMermaLavado) {
        sliderMermaLavado.style.backgroundColor = activo ? '#15803D' : '#CBD5E1';
      }
      if (sliderKnobMermaLavado) {
        sliderKnobMermaLavado.style.left = activo ? '27px' : '3px';
      }
      if (mermaConfigBody) {
        mermaConfigBody.style.display = activo ? 'block' : 'none';
      }
      showToast(activo ? '🧼 Cálculo de merma por lavado activado' : 'Merma por lavado desactivada', activo ? 'success' : 'info');
      if (typeof syncToCloud === 'function') syncToCloud();
    });
  }

  if (inputMermaBase20L) {
    inputMermaBase20L.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val >= 0) {
        store.setConfig('mermaLavadoBase20L', val);
        showToast(`Merma base actualizada a ${val} L por cada 20 L (${((val / 20) * 100).toFixed(1)}%)`, 'success');
        if (typeof syncToCloud === 'function') syncToCloud();
      }
    });
  }

  // Control de Ventas con Tanque Vacío Toggle
  const toggleBloquearSinAgua = container.querySelector('#toggle-bloquear-sin-agua');
  const labelStatusBloquearSinAgua = container.querySelector('#label-status-bloquear-sin-agua');
  const sliderBloquearSinAgua = container.querySelector('#slider-bloquear-sin-agua');
  const sliderKnobBloquearSinAgua = container.querySelector('#slider-knob-bloquear-sin-agua');

  if (toggleBloquearSinAgua) {
    toggleBloquearSinAgua.addEventListener('change', (e) => {
      const activo = e.target.checked;
      store.setConfig('bloquearVentaSinAgua', activo);
      if (labelStatusBloquearSinAgua) {
        labelStatusBloquearSinAgua.textContent = activo ? '🔴 Bloqueo Estricto' : '🟡 Alerta y Confirmación';
        labelStatusBloquearSinAgua.style.color = activo ? '#DC2626' : '#D97706';
      }
      if (sliderBloquearSinAgua) {
        sliderBloquearSinAgua.style.backgroundColor = activo ? '#DC2626' : '#CBD5E1';
      }
      if (sliderKnobBloquearSinAgua) {
        sliderKnobBloquearSinAgua.style.left = activo ? '27px' : '3px';
      }
      showToast(activo ? '🔒 Bloqueo estricto sin agua activado' : '⚠️ Modo Alerta y Confirmación sin agua activado', activo ? 'warning' : 'info');
      if (typeof syncToCloud === 'function') syncToCloud();
    });
  }

  let tempLogoBase64 = empresaLogo;
  const inputLogo = container.querySelector('#input-empresa-logo');
  const previewLogo = container.querySelector('#preview-empresa-logo');

  if (inputLogo) {
    inputLogo.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const raw = evt.target.result;
          try {
            if (typeof Utils.compressImage === 'function') {
              const compressed = await Utils.compressImage(raw, 400, 250, 0.85);
              tempLogoBase64 = compressed;
            } else {
              tempLogoBase64 = raw;
            }
          } catch (err) {
            tempLogoBase64 = raw;
          }
          if (previewLogo) previewLogo.src = tempLogoBase64;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const btnRemoveLogo = container.querySelector('#btn-remove-logo');
  if (btnRemoveLogo) {
    btnRemoveLogo.addEventListener('click', () => {
      tempLogoBase64 = './img/logo.png';
      if (previewLogo) previewLogo.src = './img/logo.png';
      if (inputLogo) inputLogo.value = '';
    });
  }

  const btnSaveEmpresa = container.querySelector('#btn-save-empresa-info');
  if (btnSaveEmpresa) {
    btnSaveEmpresa.addEventListener('click', async () => {
      const inputNombre = container.querySelector('#input-empresa-nombre');
      const nombreVal = inputNombre ? inputNombre.value.trim() : 'Tu Empresa';

      store.setConfig('empresaNombre', nombreVal || 'Tu Empresa');
      if (tempLogoBase64) {
        let finalLogo = tempLogoBase64;
        if (typeof Utils.compressImage === 'function' && finalLogo.length > 60000 && finalLogo.startsWith('data:image/')) {
          try {
            finalLogo = await Utils.compressImage(finalLogo, 400, 250, 0.85);
          } catch (e) {}
        }
        store.setConfig('empresaLogo', finalLogo);
      }

      showToast('Datos de la empresa actualizados correctamente', 'success');

      // Actualizar inmediatamente el Sidebar en el DOM
      const sidebarContainer = document.querySelector('.sidebar');
      if (sidebarContainer) {
        sidebarContainer.outerHTML = renderSidebar();
      }
      if (typeof syncToCloud === 'function') syncToCloud(true);
    });
  }

  // ---- Lógica de Zonas y Urbanizaciones ----
  let currentMunicipios = [...store.getZonasMunicipios()];
  let currentUrbanizaciones = [...store.getZonasUrbanizaciones()];

  function renderZonasTags() {
    const contMuni = container.querySelector('#container-tags-municipios');
    const contUrb = container.querySelector('#container-tags-urbanizaciones');
    if (!contMuni || !contUrb) return;

    contMuni.innerHTML = currentMunicipios.map((m, idx) => `
      <span class="badge" style="background: #EFF6FF; color: #1E40AF; border: 1px solid #BFDBFE; font-size: 12px; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;">
        ${Utils.escapeHtml(m)}
        <button type="button" class="btn-del-muni-tag" data-idx="${idx}" style="background:none; border:none; color:#EF4444; font-size:14px; font-weight:bold; cursor:pointer; padding:0; line-height:1;" title="Quitar">×</button>
      </span>
    `).join('') || '<span style="font-size:12px; color:var(--color-text-secondary);">No hay municipios registrados</span>';

    contUrb.innerHTML = currentUrbanizaciones.map((u, idx) => `
      <span class="badge" style="background: #F0FDF4; color: #166534; border: 1px solid #BBF7D0; font-size: 12px; padding: 4px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;">
        ${Utils.escapeHtml(u)}
        <button type="button" class="btn-del-urb-tag" data-idx="${idx}" style="background:none; border:none; color:#EF4444; font-size:14px; font-weight:bold; cursor:pointer; padding:0; line-height:1;" title="Quitar">×</button>
      </span>
    `).join('') || '<span style="font-size:12px; color:var(--color-text-secondary);">No hay urbanizaciones registradas</span>';

    contMuni.querySelectorAll('.btn-del-muni-tag').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(b.dataset.idx);
        currentMunicipios.splice(i, 1);
        renderZonasTags();
      });
    });

    contUrb.querySelectorAll('.btn-del-urb-tag').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = parseInt(b.dataset.idx);
        currentUrbanizaciones.splice(i, 1);
        renderZonasTags();
      });
    });
  }

  renderZonasTags();

  const btnAddMuni = container.querySelector('#btn-add-municipio');
  const inputMuni = container.querySelector('#input-nuevo-municipio');
  if (btnAddMuni && inputMuni) {
    const handleAddMuni = () => {
      const val = inputMuni.value.trim();
      if (!val) return;
      if (!currentMunicipios.some(m => m.toLowerCase() === val.toLowerCase())) {
        currentMunicipios.push(val);
        renderZonasTags();
      }
      inputMuni.value = '';
    };
    btnAddMuni.addEventListener('click', handleAddMuni);
    inputMuni.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMuni(); } });
  }

  const btnAddUrb = container.querySelector('#btn-add-urbanizacion');
  const inputUrb = container.querySelector('#input-nueva-urbanizacion');
  if (btnAddUrb && inputUrb) {
    const handleAddUrb = () => {
      const val = inputUrb.value.trim();
      if (!val) return;
      if (!currentUrbanizaciones.some(u => u.toLowerCase() === val.toLowerCase())) {
        currentUrbanizaciones.push(val);
        renderZonasTags();
      }
      inputUrb.value = '';
    };
    btnAddUrb.addEventListener('click', handleAddUrb);
    inputUrb.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrb(); } });
  }

  const selectPresetZonas = container.querySelector('#select-preset-zonas');
  if (selectPresetZonas) {
    selectPresetZonas.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      const presets = store.getZonasPresets();
      if (presets[val]) {
        currentMunicipios = [...presets[val].municipios];
        currentUrbanizaciones = [...presets[val].urbanizaciones];
        renderZonasTags();
        showToast(`Cargada plantilla: ${presets[val].nombre}. Haz clic en "Guardar Zonas" para confirmar.`, 'info');
      }
      selectPresetZonas.value = '';
    });
  }

  const btnGuardarZonas = container.querySelector('#btn-guardar-zonas-config');
  if (btnGuardarZonas) {
    btnGuardarZonas.addEventListener('click', () => {
      if (currentMunicipios.length === 0) {
        showToast('Debe existir al menos un municipio', 'warning');
        return;
      }
      if (currentUrbanizaciones.length === 0) {
        showToast('Debe existir al menos una urbanización o sector', 'warning');
        return;
      }
      store.setConfig('zonasMunicipios', currentMunicipios);
      store.setConfig('zonasUrbanizaciones', currentUrbanizaciones);
      showToast('Zonas y urbanizaciones de la tienda guardadas correctamente', 'success');
      if (typeof syncToCloud === 'function') syncToCloud();
    });
  }


  const btnSavePassword = container.querySelector('#btn-save-password');
  if (btnSavePassword) {
    btnSavePassword.addEventListener('click', () => {
      const inputActual = container.querySelector('#input-pwd-actual');
      const inputNueva = container.querySelector('#input-pwd-nueva');
      const inputConfirmar = container.querySelector('#input-pwd-confirmar');

      const actualVal = inputActual ? inputActual.value : '';
      const nuevaVal = inputNueva ? inputNueva.value.trim() : '';
      const confirmarVal = inputConfirmar ? inputConfirmar.value.trim() : '';

      if (!store.checkPassword(actualVal)) {
        showToast('La contraseña actual es incorrecta', 'danger');
        if (inputActual) { inputActual.value = ''; inputActual.focus(); }
        return;
      }

      if (!nuevaVal || nuevaVal.length < 4) {
        showToast('La nueva contraseña debe tener al menos 4 caracteres', 'warning');
        if (inputNueva) inputNueva.focus();
        return;
      }

      if (nuevaVal !== confirmarVal) {
        showToast('Las contraseñas nuevas no coinciden', 'danger');
        if (inputConfirmar) { inputConfirmar.value = ''; inputConfirmar.focus(); }
        return;
      }

      store.setPassword(nuevaVal);
      showToast('¡Contraseña de acceso actualizada con éxito!', 'success');
      if (inputActual) inputActual.value = '';
      if (inputNueva) inputNueva.value = '';
      if (inputConfirmar) inputConfirmar.value = '';
    });
  }

  const btnSaveOperarioPin = container.querySelector('#btn-save-operario-pin');
  if (btnSaveOperarioPin) {
    btnSaveOperarioPin.addEventListener('click', () => {
      const inputPin = container.querySelector('#input-operario-pin');
      const pinVal = inputPin ? inputPin.value.trim() : '';

      if (!pinVal || pinVal.length < 2) {
        showToast('El PIN de operario debe tener al menos 2 dígitos', 'warning');
        if (inputPin) inputPin.focus();
        return;
      }

      store.setOperarioPassword(pinVal);
      showToast('¡PIN de Operario actualizado correctamente!', 'success');
      if (typeof syncToCloud === 'function') syncToCloud();
    });
  }

  container.querySelector('#btn-add-tipo').addEventListener('click', () => openTipoModal());

  container.querySelectorAll('.btn-edit-tipo').forEach(btn => {
    btn.addEventListener('click', () => openTipoModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete-tipo').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      const t = tipos.find(x => x.id === id);
      
      if (tipos.length <= 1) {
        showToast('Debe existir al menos un tipo de botellón', 'error');
        return;
      }

      openModal({
        title: 'Confirmar Eliminación',
        content: `¿Estás seguro de que deseas eliminar el tipo <strong>"${t?.nombre}"</strong>? Esta acción no se puede deshacer.`,
        saveLabel: 'Eliminar',
        onSave: () => {
          const nuevosTipos = store.getConfig('tiposBotellon').filter(x => String(x.id) !== String(id));
          store.setConfig('tiposBotellon', nuevosTipos);
          if (typeof Licencia !== 'undefined' && Licencia.sincronizarCatalogoLocalHaciaNube) {
            Licencia.sincronizarCatalogoLocalHaciaNube(nuevosTipos);
          }
          syncToCloud();
          closeModal();
          renderConfiguracion(container);
          showToast('Eliminado correctamente', 'success');
        }
      });
    });
  });

  // Eventos de Tarifas de Delivery
  const btnAddTarifaDeliv = container.querySelector('#btn-add-tarifa-delivery');
  if (btnAddTarifaDeliv) {
    btnAddTarifaDeliv.addEventListener('click', () => openTarifaDeliveryModal());
  }

  container.querySelectorAll('.btn-edit-tarifa-delivery').forEach(btn => {
    btn.addEventListener('click', () => openTarifaDeliveryModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete-tarifa-delivery').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const allTarifas = store.getTarifasDelivery();
      const tObj = allTarifas.find(t => t.id === id);
      if (!tObj) return;
      openModal({
        title: 'Confirmar Eliminación',
        content: `¿Estás seguro de eliminar la tarifa <strong>"${Utils.escapeHtml(tObj.nombre)}"</strong>?`,
        saveLabel: 'Eliminar',
        onSave: () => {
          const nuevas = allTarifas.filter(t => t.id !== id);
          store.saveTarifasDelivery(nuevas);
          closeModal();
          renderConfiguracion(container);
          showToast('Tarifa de delivery eliminada', 'success');
        }
      });
    });
  });

  // Eventos de Repartidores
  const btnAddRep = container.querySelector('#btn-add-repartidor');
  if (btnAddRep) {
    btnAddRep.addEventListener('click', () => openRepartidorModal());
  }

  container.querySelectorAll('.btn-edit-repartidor').forEach(btn => {
    btn.addEventListener('click', () => openRepartidorModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete-repartidor').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const rep = repartidores.find(r => r.id === id);
      openModal({
        title: 'Confirmar Eliminación',
        content: `¿Estás seguro de eliminar al repartidor <strong>"${rep?.nombre}"</strong>?`,
        saveLabel: 'Eliminar',
        onSave: () => {
          const nuevos = (store.getConfig('repartidores') || []).filter(r => r.id !== id);
          store.setConfig('repartidores', nuevos);
          closeModal();
          renderConfiguracion(container);
          showToast('Repartidor eliminado', 'success');
        }
      });
    });
  });

  // Métodos de Pago events
  const btnAddMetodo = container.querySelector('#btn-add-metodo-pago');
  if (btnAddMetodo) {
    btnAddMetodo.addEventListener('click', () => {
      openMetodoPagoModal();
    });
  }

  container.querySelectorAll('.btn-edit-metodo-pago').forEach(btn => {
    btn.addEventListener('click', () => {
      openMetodoPagoModal(btn.dataset.id);
    });
  });

  container.querySelectorAll('.btn-delete-metodo-pago').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const allM = store.getMetodosPago(false);
      const met = allM.find(m => m.id === id);
      openModal({
        title: 'Confirmar Eliminación',
        content: `<p>¿Estás seguro de eliminar el método de pago personalizado <strong>"${met?.label}"</strong>?</p>`,
        saveLabel: 'Eliminar',
        onSave: () => {
          store.deleteMetodoPago(id);
          closeModal();
          renderConfiguracion(container);
          showToast('Método de pago eliminado', 'success');
          if (typeof syncToCloud === 'function') syncToCloud();
        }
      });
    });
  });

  // ---- Respaldo en la Nube (Plan Plus) ----
  const lblLastCloud = container.querySelector('#label-cloud-last-backup');
  if (lblLastCloud) {
    getCloudBackup(usuarioEmail).then(info => {
      if (!lblLastCloud) return;
      if (info && info.ultimaActualizacion) {
        const d = new Date(info.ultimaActualizacion);
        lblLastCloud.innerHTML = `${d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} <span style="color:#64748B; font-weight:normal;">(${info.clientesCount} clientes · ${info.ventasCount} ventas)</span>`;
      } else {
        lblLastCloud.textContent = 'Aún no hay respaldo guardado';
      }
    }).catch(() => {
      if (lblLastCloud) lblLastCloud.textContent = 'Sin conexión a la nube';
    });
  }

  const btnCloudBackup = container.querySelector('#btn-backup-cloud-now');
  if (btnCloudBackup) {
    btnCloudBackup.addEventListener('click', async () => {
      btnCloudBackup.disabled = true;
      btnCloudBackup.innerHTML = '<span>⏳</span> Respaldando en la Nube...';
      try {
        const res = await backupToCloudNow();
        if (res.success) {
          showToast(`☁️ Respaldo guardado con éxito (${res.clientesCount} clientes, ${res.ventasCount} ventas)`, 'success');
          if (lblLastCloud) {
            lblLastCloud.innerHTML = `${new Date().toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} <span style="color:#64748B; font-weight:normal;">(${res.clientesCount} clientes · ${res.ventasCount} ventas)</span>`;
          }
        } else {
          showToast('⚠️ No se pudo completar el respaldo. Verifica tu conexión.', 'warning');
        }
      } catch (err) {
        showToast('Error al respaldar: ' + err.message, 'danger');
      } finally {
        btnCloudBackup.disabled = false;
        btnCloudBackup.innerHTML = '<span>☁️</span> Respaldar Todo en la Nube Ahora';
      }
    });
  }

  const btnCloudRestore = container.querySelector('#btn-restore-cloud-now');
  if (btnCloudRestore) {
    btnCloudRestore.addEventListener('click', async () => {
      btnCloudRestore.disabled = true;
      btnCloudRestore.innerHTML = '<span>⏳</span> Verificando nube...';
      try {
        const info = await getCloudBackup(usuarioEmail);
        btnCloudRestore.disabled = false;
        btnCloudRestore.innerHTML = '<span>🔄</span> Restaurar desde la Nube';

        if (!info || !info.backup) {
          showToast('No se encontró ninguna copia de seguridad en la nube para esta cuenta.', 'warning');
          return;
        }

        const fechaStr = info.ultimaActualizacion
          ? new Date(info.ultimaActualizacion).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })
          : 'Reciente';

        openModal({
          title: '🔄 Restaurar Respaldo desde la Nube',
          content: `
            <div style="text-align: left; padding: 4px;">
              <p style="font-size: 14px; color: var(--color-text-primary); margin-bottom: 14px;">
                Se restaurarán todos los datos almacenados en la nube para la tienda <strong>${info.nombreEmpresa}</strong>.
              </p>
              <div style="background: var(--color-bg-body, #f8fafc); border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; font-size: 13px; margin-bottom: 16px;">
                <div>👥 <strong>Clientes registrados:</strong> ${info.clientesCount}</div>
                <div style="margin-top: 4px;">💧 <strong>Ventas registradas:</strong> ${info.ventasCount}</div>
                <div style="margin-top: 4px;">📦 <strong>Productos / Catálogo:</strong> ${info.productosCount}</div>
                <div style="margin-top: 8px; border-top: 1px solid var(--color-border); padding-top: 6px; font-size: 12px; color: var(--color-text-secondary);">
                  🕒 Fecha del respaldo: <strong>${fechaStr}</strong>
                </div>
              </div>
              <p style="font-size: 13px; color: var(--color-danger, #ef4444); margin-bottom: 16px;">
                ⚠️ <em>Esta acción reemplazará los datos actuales de este navegador con la copia de la nube.</em>
              </p>
              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="btn-cancel-restore-modal">Cancelar</button>
                <button type="button" class="btn btn-primary" id="btn-confirm-restore-modal" style="background: #0284C7; border-color: #0284C7;">
                  Sí, Restaurar Ahora
                </button>
              </div>
            </div>
          `
        });

        const cancelBtn = document.getElementById('btn-cancel-restore-modal');
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        const confirmBtn = document.getElementById('btn-confirm-restore-modal');
        if (confirmBtn) {
          confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '⏳ Restaurando...';
            const res = await restoreFromCloud(usuarioEmail);
            if (res.success) {
              closeModal();
              showToast('✅ Información restaurada exitosamente', 'success');
              setTimeout(() => location.reload(), 1000);
            } else {
              alert('Error al restaurar: ' + res.message);
              confirmBtn.disabled = false;
              confirmBtn.textContent = 'Sí, Restaurar Ahora';
            }
          });
        }
      } catch (e) {
        btnCloudRestore.disabled = false;
        btnCloudRestore.innerHTML = '<span>🔄</span> Restaurar desde la Nube';
        showToast('Error al conectar con la nube: ' + e.message, 'danger');
      }
    });
  }

  // Backup events (Local)
  container.querySelector('#btn-export').addEventListener('click', () => {
    const data = store.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tuempresa_backup_${Utils.todayISO()}.json`;
    a.click();
    showToast('Datos exportados', 'success');
  });

  container.querySelector('#btn-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const ok = await store.importData(ev.target.result);
      if (ok) {
        showToast('Importación correcta', 'success');
        setTimeout(() => location.reload(), 1000);
      } else {
        showToast('Error al importar archivo de respaldo', 'danger');
      }
    };
    reader.readAsText(file);
  });
}

function openTarifaDeliveryModal(id = null) {
  const isEdit = !!id;
  const currentTasa = store.getConfig('tasaCambio') || 40.00;
  const list = store.getTarifasDelivery();
  const tarifa = isEdit ? list.find(t => t.id === id) : null;
  const isFixed = tarifa && (tarifa.id === 'local' || tarifa.id === 'afuera');

  openModal({
    title: isEdit ? `Editar Tarifa: ${tarifa?.nombre || ''}` : 'Nueva Tarifa / Zona de Delivery',
    content: `
      <form id="form-tarifa-delivery">
        <div class="form-group mb-md">
          <label class="form-label" style="font-weight: 700;">Nombre de la Zona / Tarifa *</label>
          <input type="text" class="form-control" name="nombre" value="${Utils.escapeHtml(tarifa?.nombre || '')}" placeholder="Ej: Local, Afuera, Zona Industrial..." required ${isFixed ? 'readonly style="background:#F1F5F9;"' : ''}/>
          ${isFixed ? '<small class="text-muted" style="display:block; margin-top:4px;">El nombre de esta zona principal es fijo para mantener la compatibilidad.</small>' : ''}
        </div>
        <div class="form-group mb-md">
          <label class="form-label" style="font-weight: 700;">Precio sugerido ($ USD) *</label>
          <div style="position: relative; max-width: 200px;">
            <input type="number" step="0.01" min="0" class="form-control" name="precio" id="input-modal-precio-tarifa" value="${tarifa?.precio !== undefined ? tarifa.precio : '0.50'}" required style="padding-left: 24px; font-size: 16px; font-weight: 700;"/>
            <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-weight: bold; color: var(--color-text-secondary);">$</span>
          </div>
          <small class="text-muted" id="preview-precio-tarifa-bs" style="display: block; margin-top: 6px;">
            Equivalente: ~ Bs ${Utils.formatNumber(((tarifa?.precio || 0.5) * currentTasa), true)} (Tasa: ${Utils.formatNumber(currentTasa, true)})
          </small>
        </div>
      </form>
    `,
    saveLabel: 'Guardar Tarifa',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-tarifa-delivery');
      const nombre = (form.querySelector('input[name="nombre"]').value || '').trim();
      const precio = parseFloat(form.querySelector('input[name="precio"]').value);

      if (!nombre) {
        showToast('El nombre de la zona es requerido', 'warning');
        return false;
      }
      if (isNaN(precio) || precio < 0) {
        showToast('Ingrese un precio válido', 'warning');
        return false;
      }

      let allTarifas = [...store.getTarifasDelivery()];
      if (isEdit) {
        const idx = allTarifas.findIndex(t => t.id === id);
        if (idx !== -1) {
          allTarifas[idx] = { ...allTarifas[idx], nombre, precio };
        }
      } else {
        const newId = 'zona_' + Date.now().toString(36);
        allTarifas.push({ id: newId, nombre, precio, activo: true });
      }

      store.saveTarifasDelivery(allTarifas);
      closeModal();
      renderConfiguracion(document.querySelector('.main-content'));
      showToast('Tarifa de delivery guardada correctamente', 'success');
      return true;
    }
  });

  setTimeout(() => {
    const pInput = document.getElementById('input-modal-precio-tarifa');
    const pPrev = document.getElementById('preview-precio-tarifa-bs');
    if (pInput && pPrev) {
      pInput.addEventListener('input', () => {
        const val = parseFloat(pInput.value) || 0;
        pPrev.textContent = `Equivalente: ~ Bs ${Utils.formatNumber(val * currentTasa, true)} (Tasa: ${Utils.formatNumber(currentTasa, true)})`;
      });
    }
  }, 100);
}

function openRepartidorModal(id = null) {
  const isEdit = !!id;
  const reps = store.getConfig('repartidores') || [];
  const rep = isEdit ? reps.find(r => r.id === id) : {};

  openModal({
    title: isEdit ? 'Editar Repartidor' : 'Nuevo Repartidor',
    content: `
      <form id="form-repartidor">
        <div class="form-group">
          <label class="form-label">Nombre del Repartidor</label>
          <input type="text" class="form-control" name="nombre" value="${rep.nombre || ''}" required/>
        </div>
      </form>
    `,
    onSave: (overlay) => {
      const nombre = overlay.querySelector('input[name="nombre"]').value.trim();
      if (!nombre) return;
      
      let list = store.getConfig('repartidores') || [];
      if (isEdit) {
        const idx = list.findIndex(r => r.id === id);
        list[idx] = { ...list[idx], nombre };
      } else {
        list.push({ id: Utils.generateId(), nombre });
      }
      
      store.setConfig('repartidores', list);
      closeModal();
      renderConfiguracion(document.querySelector('.main-content'));
      showToast('Repartidor guardado', 'success');
    }
  });
}

function openTipoModal(id = null) {
  const isEdit = !!id;
  const tipos = store.getConfig('tiposBotellon') || [];
  const tipo = isEdit ? tipos.find(t => t.id === id) : {};
  const currentMoneda = tipo.moneda || 'USD';
  const isProd = tipo.categoria === 'producto';
  const tieneAguaCortesia = isProd ? Utils.esProductoConAguaCortesia(tipo) : false;
  const litrosCortesia = isProd ? Utils.obtenerLitrosAguaProducto(tipo) : 20;

  const content = `
    <form id="form-tipo">
      <div class="form-row">
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Categoría</label>
          <select class="form-control" name="categoria" id="tipo-categoria-select">
            <option value="relleno" ${!isProd ? 'selected' : ''}>Tipo de Relleno (Recarga)</option>
            <option value="producto" ${isProd ? 'selected' : ''}>Tipo de Productos (Físico)</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1.5;">
          <label class="form-label">Nombre del Ítem</label>
          <input type="text" class="form-control" name="nombre" id="tipo-nombre-input" value="${Utils.escapeHtml(tipo.nombre || '')}" placeholder="Ej: Botellón 20L / Forro Botellón" required/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="grupo-litros" style="${isProd ? 'display:none;' : ''}; flex: 1;">
          <label class="form-label">Capacidad (Litros)</label>
          <input type="number" class="form-control" name="litros" value="${tipo.litros !== undefined ? tipo.litros : 20}" min="1" step="0.5"/>
        </div>
        <div class="form-group" id="grupo-stock" style="${!isProd ? 'display:none;' : ''}; flex: 1;">
          <label class="form-label">Stock / Cantidad Disponible</label>
          <input type="number" class="form-control" name="stock" value="${tipo.stock !== undefined ? tipo.stock : 0}" min="0"/>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label">Moneda del Precio</label>
          <select class="form-control" name="moneda" id="tipo-moneda-select">
            <option value="USD" ${currentMoneda === 'USD' ? 'selected' : ''}>Dólares ($)</option>
            <option value="VES" ${currentMoneda === 'VES' || currentMoneda === 'Bs' ? 'selected' : ''}>Bolívares (Bs.)</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label class="form-label" id="label-precio-venta">Precio de Venta (${currentMoneda === 'VES' || currentMoneda === 'Bs' ? 'Bs.' : '$'})</label>
          <input type="text" inputmode="decimal" class="form-control" name="precio" id="input-precio-venta" value="${tipo.precio !== undefined ? tipo.precio : '1.50'}" placeholder="0.00" required/>
        </div>
      </div>
      <div id="grupo-agua-cortesia" style="${!isProd ? 'display:none;' : ''}; margin-top: 8px; padding: 12px; border-radius: 8px; background: #F5F3FF; border: 1px solid #DDD6FE;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; color: #5B21B6; font-size: 13.5px; margin: 0;">
          <input type="checkbox" id="tipo-incluye-agua-cortesia" name="incluyeAguaCortesia" ${tieneAguaCortesia ? 'checked' : ''} style="width: 17px; height: 17px; accent-color: #7C3AED; cursor: pointer;" />
          <span>🎁 Incluye primera recarga de agua gratis (descuenta del tanque)</span>
        </label>
        <div id="grupo-litros-cortesia" style="${tieneAguaCortesia ? 'display:flex;' : 'display:none;'} align-items: center; gap: 10px; margin-top: 10px; padding-left: 25px;">
          <label class="form-label" style="margin: 0; font-size: 12.5px; color: #5B21B6; white-space: nowrap;">Litros de agua de cortesía (L):</label>
          <input type="number" class="form-control" name="litrosCortesia" id="tipo-litros-cortesia" value="${litrosCortesia}" min="1" step="0.5" style="max-width: 110px; height: 34px; font-weight: 700;" />
        </div>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'Editar Tipo' : 'Nuevo Tipo',
    content,
    onOpen: (overlay) => {
      const catSelect = overlay.querySelector('#tipo-categoria-select');
      const grupoLitros = overlay.querySelector('#grupo-litros');
      const grupoStock = overlay.querySelector('#grupo-stock');
      const grupoCortesia = overlay.querySelector('#grupo-agua-cortesia');
      const chkCortesia = overlay.querySelector('#tipo-incluye-agua-cortesia');
      const grupoLitrosCortesia = overlay.querySelector('#grupo-litros-cortesia');
      const inputLitrosCortesia = overlay.querySelector('#tipo-litros-cortesia');
      const inputNombre = overlay.querySelector('#tipo-nombre-input');
      const monSelect = overlay.querySelector('#tipo-moneda-select');
      const labelPrecio = overlay.querySelector('#label-precio-venta');
      let cortesiaTouched = isEdit;

      const toggleLitrosCortesia = () => {
        if (grupoLitrosCortesia && chkCortesia) {
          grupoLitrosCortesia.style.display = chkCortesia.checked ? 'flex' : 'none';
        }
      };

      const toggleFields = () => {
        const isProducto = catSelect.value === 'producto';
        if (grupoLitros) grupoLitros.style.display = isProducto ? 'none' : 'block';
        if (grupoStock) grupoStock.style.display = isProducto ? 'block' : 'none';
        if (grupoCortesia) grupoCortesia.style.display = isProducto ? 'block' : 'none';
        toggleLitrosCortesia();
      };

      if (catSelect) {
        catSelect.addEventListener('change', toggleFields);
        toggleFields(); // sincronizar al abrir
      }

      if (chkCortesia) {
        chkCortesia.addEventListener('change', () => {
          cortesiaTouched = true;
          toggleLitrosCortesia();
        });
      }

      if (inputNombre && !isEdit) {
        inputNombre.addEventListener('input', () => {
          if (cortesiaTouched || !catSelect || catSelect.value !== 'producto') return;
          const mockItem = { categoria: 'producto', nombre: inputNombre.value };
          const sug = Utils.esProductoConAguaCortesia(mockItem);
          if (chkCortesia) chkCortesia.checked = sug;
          if (inputLitrosCortesia && sug) {
            inputLitrosCortesia.value = Utils.obtenerLitrosAguaProducto(mockItem);
          }
          toggleLitrosCortesia();
        });
      }

      if (monSelect && labelPrecio) {
        monSelect.addEventListener('change', () => {
          labelPrecio.textContent = monSelect.value === 'VES' ? 'Precio de Venta (Bs.)' : 'Precio de Venta ($)';
        });
      }
    },
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-tipo');
      const fd = new FormData(form);
      const categoria = fd.get('categoria');
      const nombre = (fd.get('nombre') || '').trim();
      const incluyeAguaCortesia = categoria === 'producto'
        ? !!overlay.querySelector('#tipo-incluye-agua-cortesia')?.checked
        : false;
      const litros = categoria === 'producto'
        ? (incluyeAguaCortesia ? (parseFloat(fd.get('litrosCortesia')) || Utils.obtenerLitrosAguaProducto({ categoria: 'producto', nombre })) : 0)
        : (parseFloat(fd.get('litros')) || 20);
      const stock = categoria === 'producto' ? (parseInt(fd.get('stock')) || 0) : 0;
      const moneda = fd.get('moneda') || 'USD';
      
      // Permitir coma o punto para precio en tablets y móviles
      const rawPrecio = String(fd.get('precio') || '').trim().replace(',', '.');
      const precio = parseFloat(rawPrecio);

      if (!nombre || isNaN(precio) || precio < 0) {
        showToast('Por favor ingrese un nombre y un precio válido', 'warning');
        return;
      }

      if (isEdit) {
        const idx = tipos.findIndex(t => String(t.id) === String(id));
        if (idx !== -1) {
          tipos[idx] = { ...tipos[idx], categoria, nombre, litros, stock, moneda, precio, incluyeAguaCortesia };
        } else {
          tipos.push({ id, categoria, nombre, litros, stock, moneda, precio, incluyeAguaCortesia });
        }
      } else {
        tipos.push({ id: Utils.generateId(), categoria, nombre, litros, stock, moneda, precio, incluyeAguaCortesia });
      }

      store.setConfig('tiposBotellon', tipos);

      // Sincronizar catálogo a Supabase para que la nube no lo anule
      if (typeof Licencia !== 'undefined' && Licencia.sincronizarCatalogoLocalHaciaNube) {
        Licencia.sincronizarCatalogoLocalHaciaNube(tipos);
      }
      syncToCloud();

      closeModal();
      const targetContainer = document.querySelector('.main-content') || document.querySelector('#app-content');
      if (targetContainer) {
        renderConfiguracion(targetContainer);
      }
      showToast('Guardado correctamente', 'success');
    }
  });
}

function openMetodoPagoModal(id = null) {
  const isEdit = !!id;
  const allMethods = store.getMetodosPago(false);
  const metodo = isEdit ? (allMethods.find(m => m.id === id) || {}) : {};
  const currentMoneda = metodo.moneda || 'Bs';
  const currentIcon = metodo.icon || '💳';

  const icons = ['💳', '💵', '📱', '🏦', '🌐', '🪙', '📲', '🤝', '⭐', '🛒', '⚡'];

  const content = `
    <form id="form-metodo-pago" style="padding: 10px 0;">
      <div class="form-group mb-md">
        <label class="form-label" style="font-weight: 700;">Nombre del Método de Pago</label>
        <input type="text" class="form-control" name="label" id="input-metodo-label" value="${Utils.escapeHtml(metodo.label || '')}" placeholder="Ej: Punto de venta (B), Zelle, Banesco Panamá" required style="font-size: 15px; font-weight: 600;" />
        <small class="text-muted" style="font-size: 11px; margin-top: 4px; display: block;">Este nombre se mostrará en el Punto de Venta, Arqueo de Caja y Reportes.</small>
      </div>

      <div class="form-row mb-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-weight: 700;">Moneda de Recepción</label>
          <select class="form-control" name="moneda" id="select-metodo-moneda" style="height: 38px; font-weight: 600;">
            <option value="Bs" ${currentMoneda === 'Bs' ? 'selected' : ''}>💴 Bolívares (Bs)</option>
            <option value="USD" ${currentMoneda === 'USD' ? 'selected' : ''}>💵 Dólares ($ / USD)</option>
          </select>
          <small class="text-muted" style="font-size: 11px; margin-top: 4px; display: block;">Determina si se calcula con la tasa oficial o en $ directo.</small>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-weight: 700;">Ícono / Emoji</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="text" class="form-control" name="icon" id="input-metodo-icon" value="${currentIcon}" style="width: 55px; text-align: center; font-size: 20px;" maxlength="4" />
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${icons.map(ic => `<button type="button" class="btn btn-xs btn-secondary btn-pick-icon" data-icon="${ic}" style="padding: 3px 6px; font-size: 14px;">${ic}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? '✏️ Editar Método de Pago' : '💳 Anexar Nuevo Método de Pago',
    content,
    onOpen: (overlay) => {
      overlay.querySelectorAll('.btn-pick-icon').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelector('#input-metodo-icon').value = btn.dataset.icon;
        });
      });
    },
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-metodo-pago');
      const label = form.querySelector('#input-metodo-label').value.trim();
      const moneda = form.querySelector('#select-metodo-moneda').value;
      const icon = form.querySelector('#input-metodo-icon').value.trim() || '💳';

      if (!label) {
        showToast('Debe ingresar un nombre para el método de pago', 'warning');
        return;
      }

      store.saveMetodoPago({
        id: isEdit ? id : null,
        label,
        moneda,
        icon
      });

      closeModal();
      renderConfiguracion(document.querySelector('.main-content'));
      showToast(isEdit ? 'Método de pago actualizado' : 'Método de pago anexado con éxito', 'success');
      if (typeof syncToCloud === 'function') syncToCloud();
    }
  });
}

// ============================================
// Refill H2O - CRUD Metas Semanales (Lun-Sáb), Sedes y Empleados
// ============================================

function renderMetasSedesItemsHTML(cfg) {
  const sedes = cfg?.sedes || [];
  if (sedes.length === 0) {
    return `<div class="text-muted" style="padding:14px; text-align:center; border:1px dashed var(--color-border); border-radius:8px;">No hay sedes configuradas. Agrega una nueva tienda.</div>`;
  }

  return sedes.map(s => {
    const metasChips = (s.metas || []).map(m => `
      <span style="display:inline-flex; align-items:center; gap:4px; background:#F8FAFC; border:1px solid #CBD5E1; color:#0F172A; font-size:11.5px; font-weight:600; padding:3px 8px; border-radius:6px;">
        M${m.nivel}: <strong>$${Utils.formatNumber(m.montoUSD)}</strong> <span style="color:#047857;">(+$${Utils.formatNumber(m.bonoUSD)})</span>
      </span>
    `).join('');

    const empleados = s.empleados || [];
    const empActivos = empleados.filter(e => e && e.activo !== false);
    const empsHTML = empleados.length > 0
      ? empleados.map(e => `
          <span style="display:inline-flex; align-items:center; gap:4px; background:${e.activo !== false ? '#EEF2FF' : '#F1F5F9'}; border:1px solid ${e.activo !== false ? '#C7D2FE' : '#CBD5E1'}; color:${e.activo !== false ? '#3730A3' : '#64748B'}; font-size:11.5px; font-weight:600; padding:2px 8px; border-radius:999px; ${e.activo === false ? 'text-decoration:line-through;' : ''}">
            👤 ${Utils.escapeHtml(e.nombre)}${e.cargo ? ` (${Utils.escapeHtml(e.cargo)})` : ''}
          </span>
        `).join('')
      : `<span class="text-muted" style="font-size:12px;">Sin empleados registrados</span>`;

    return `
      <div style="background:var(--color-bg, #F8FAFC); border:1px solid var(--color-border); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong style="font-size:15px; color:#0F172A;">🏪 ${Utils.escapeHtml(s.nombre)}</strong>
              <span class="badge ${s.activa !== false ? 'badge-success' : 'badge-warning'}" style="font-size:11px; padding:2px 8px;">
                ${s.activa !== false ? '🟢 Activa' : '⏳ Próximamente'}
              </span>
            </div>
            <div class="text-muted" style="font-size:12px; margin-top:2px;">
              ${s.email ? `📧 ${Utils.escapeHtml(s.email)}` : 'Sin correo POS vinculado aún'}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn btn-xs btn-secondary btn-emp-sede-meta" data-sede-id="${Utils.escapeHtml(s.id)}">
              👥 Empleados (${empActivos.length})
            </button>
            <button type="button" class="btn btn-xs btn-secondary btn-edit-sede-meta" data-sede-id="${Utils.escapeHtml(s.id)}">
              ✏️ Editar
            </button>
            <button type="button" class="btn btn-xs btn-secondary btn-del-sede-meta" data-sede-id="${Utils.escapeHtml(s.id)}" style="color:var(--color-danger);">
              🗑️
            </button>
          </div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
          <span style="font-size:11.5px; font-weight:700; color:#475569; margin-right:2px;">Metas (${(s.metas || []).length}):</span>
          ${metasChips || '<span class="text-muted" style="font-size:12px;">Sin metas</span>'}
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
          <span style="font-size:11.5px; font-weight:700; color:#475569; margin-right:2px;">Personal:</span>
          ${empsHTML}
        </div>
      </div>
    `;
  }).join('');
}

function renderMetasRefillCardHTML(cfg) {
  return `
    <div id="card-metas-refill-config" class="card full-width mb-lg" style="border-left: 4px solid #7C3AED;">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h3 class="card-title" style="display:flex; align-items:center; gap:8px; color:#5B21B6;">
            <span>🏆</span> Metas Semanales y Bonos por Sede (Refill H2O)
          </h3>
          <p class="text-muted" style="font-size: var(--font-size-sm); margin-top:4px;">
            Ciclo de 6 días (Lunes a Sábado) · Venta real cobrada · Bono escalonado por nivel alcanzado. Exclusivo para sedes Refill H2O.
          </p>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-secondary" id="btn-sync-metas-refill">
            🔄 Sincronizar
          </button>
          <button type="button" class="btn btn-sm btn-primary" id="btn-add-sede-meta">
            + Nueva Tienda / Sede
          </button>
        </div>
      </div>

      <div class="card-body mt-md" style="display:flex; flex-direction:column; gap:14px;">
        <div style="background:#F5F3FF; border:1px solid #DDD6FE; border-radius:10px; padding:12px 14px; display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end;">
          <div class="form-group" style="flex:1; min-width:190px; margin-bottom:0;">
            <label class="form-label" style="font-size:12px; font-weight:700; color:#5B21B6;">👤 Responsable de Pagos (WhatsApp)</label>
            <input type="text" id="input-metas-resp-nombre" class="form-control" value="${Utils.escapeHtml(cfg.nombreResponsablePagos || 'Responsable de Pagos')}" placeholder="Ej: Administración / Pagos" style="height:36px; font-size:13px;" />
          </div>
          <div class="form-group" style="flex:1; min-width:190px; margin-bottom:0;">
            <label class="form-label" style="font-size:12px; font-weight:700; color:#5B21B6;">📲 Número de WhatsApp (con código país)</label>
            <input type="text" id="input-metas-wa-pagos" class="form-control" value="${Utils.escapeHtml(cfg.whatsappPagos || '')}" placeholder="Ej: 584121234567" style="height:36px; font-size:13px;" />
          </div>
          <button type="button" id="btn-save-metas-wa" class="btn btn-sm btn-primary" style="height:36px; white-space:nowrap;">
            💾 Guardar Pagador
          </button>
        </div>

        <div id="container-crud-metas-sedes" style="display:flex; flex-direction:column; gap:10px;">
          ${renderMetasSedesItemsHTML(cfg)}
        </div>
      </div>
    </div>
  `;
}

function initMetasRefillConfigEvents(container) {
  const card = container.querySelector('#card-metas-refill-config');
  if (!card) return;

  const refreshMetasUI = (newCfg) => {
    const cfg = newCfg || getMetasRefillConfigLocal(store);
    const inpResp = card.querySelector('#input-metas-resp-nombre');
    const inpWa = card.querySelector('#input-metas-wa-pagos');
    const listCont = card.querySelector('#container-crud-metas-sedes');
    if (inpResp) inpResp.value = cfg.nombreResponsablePagos || 'Responsable de Pagos';
    if (inpWa) inpWa.value = cfg.whatsappPagos || '';
    if (listCont) listCont.innerHTML = renderMetasSedesItemsHTML(cfg);
  };

  cargarMetasRefillDesdeNube(store, true).then(refreshMetasUI).catch(() => {});

  const btnSync = card.querySelector('#btn-sync-metas-refill');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.disabled = true;
      btnSync.textContent = '⏳...';
      try {
        const cfg = await cargarMetasRefillDesdeNube(store, true);
        refreshMetasUI(cfg);
        showToast('Metas y empleados sincronizados desde la nube', 'success');
      } finally {
        btnSync.disabled = false;
        btnSync.textContent = '🔄 Sincronizar';
      }
    });
  }

  const btnSaveWa = card.querySelector('#btn-save-metas-wa');
  if (btnSaveWa) {
    btnSaveWa.addEventListener('click', async () => {
      const respNombre = (card.querySelector('#input-metas-resp-nombre')?.value || '').trim() || 'Responsable de Pagos';
      const wa = (card.querySelector('#input-metas-wa-pagos')?.value || '').trim();
      const cfgActual = getMetasRefillConfigLocal(store);
      btnSaveWa.disabled = true;
      btnSaveWa.textContent = '⏳ Guardando...';
      try {
        const res = await guardarMetasRefillEnNube({
          ...cfgActual,
          nombreResponsablePagos: respNombre,
          whatsappPagos: wa
        }, store);
        refreshMetasUI(res.config);
        showToast(res.ok ? 'Datos del pagador guardados en la nube' : 'Guardado localmente (pendiente sincronización)', res.ok ? 'success' : 'warning');
      } finally {
        btnSaveWa.disabled = false;
        btnSaveWa.textContent = '💾 Guardar Pagador';
      }
    });
  }

  card.querySelector('#btn-add-sede-meta')?.addEventListener('click', () => {
    openSedeMetaModal(null, refreshMetasUI);
  });

  const listCont = card.querySelector('#container-crud-metas-sedes');
  if (listCont) {
    listCont.addEventListener('click', (e) => {
      const btnEmp = e.target.closest('.btn-emp-sede-meta');
      if (btnEmp) {
        openEmpleadosSedeModal(btnEmp.dataset.sedeId, refreshMetasUI);
        return;
      }
      const btnEdit = e.target.closest('.btn-edit-sede-meta');
      if (btnEdit) {
        openSedeMetaModal(btnEdit.dataset.sedeId, refreshMetasUI);
        return;
      }
      const btnDel = e.target.closest('.btn-del-sede-meta');
      if (btnDel) {
        const sedeId = btnDel.dataset.sedeId;
        const cfg = getMetasRefillConfigLocal(store);
        const target = cfg.sedes.find(s => s.id === sedeId);
        if (!target) return;
        openModal({
          title: '🗑️ Eliminar Tienda / Sede',
          content: `<p style="font-size:14px;">¿Seguro deseas eliminar la sede <strong>${Utils.escapeHtml(target.nombre)}</strong> de la configuración de metas y empleados?</p>`,
          saveLabel: 'Sí, Eliminar',
          onSave: async () => {
            const nextCfg = {
              ...cfg,
              sedes: cfg.sedes.filter(s => s.id !== sedeId)
            };
            const res = await guardarMetasRefillEnNube(nextCfg, store);
            closeModal();
            refreshMetasUI(res.config);
            showToast(res.ok ? 'Sede eliminada y sincronizada' : 'Sede eliminada localmente', res.ok ? 'success' : 'warning');
          }
        });
      }
    });
  }
}

function openSedeMetaModal(sedeId = null, onUpdated = null) {
  const cfg = getMetasRefillConfigLocal(store);
  const existente = sedeId ? cfg.sedes.find(s => s.id === sedeId) : null;
  const isEdit = !!existente;

  let metasWork = existente && Array.isArray(existente.metas) && existente.metas.length > 0
    ? existente.metas.map(m => ({ montoUSD: m.montoUSD, bonoUSD: m.bonoUSD }))
    : [
        { montoUSD: 1000, bonoUSD: 10 },
        { montoUSD: 1500, bonoUSD: 20 },
        { montoUSD: 2000, bonoUSD: 30 },
        { montoUSD: 2500, bonoUSD: 40 }
      ];

  const renderMetasRowsHTML = () => metasWork.map((m, i) => `
    <div class="meta-edit-row" data-idx="${i}" style="display:grid; grid-template-columns: 70px 1fr 1fr 34px; gap:8px; align-items:center;">
      <span style="font-size:12px; font-weight:700; color:#5B21B6;">Meta ${i + 1}</span>
      <input type="number" step="1" min="1" class="form-control inp-meta-monto" value="${m.montoUSD}" placeholder="Venta $" style="height:34px; font-size:13px;" />
      <input type="number" step="0.5" min="0" class="form-control inp-meta-bono" value="${m.bonoUSD}" placeholder="Bono $" style="height:34px; font-size:13px;" />
      <button type="button" class="btn btn-xs btn-secondary btn-rm-meta-row" data-idx="${i}" style="height:34px; color:#DC2626;" title="Quitar meta">✕</button>
    </div>
  `).join('');

  const content = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Nombre de la Sede / Tienda *</label>
        <input type="text" id="modal-sede-nombre" class="form-control" value="${Utils.escapeHtml(existente?.nombre || '')}" placeholder="Ej: Los Samanes" required />
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Correo POS Vinculado (opcional si aún no abre)</label>
        <input type="email" id="modal-sede-email" class="form-control" value="${Utils.escapeHtml(existente?.email || '')}" placeholder="Ej: refillh2o.lss@gmail.com" />
      </div>
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; cursor:pointer;">
        <input type="checkbox" id="modal-sede-activa" ${(!existente || existente.activa !== false) ? 'checked' : ''} style="width:16px; height:16px;" />
        <span>Sede activa (mostrar barra de progreso y reporte semanal)</span>
      </label>

      <div style="border-top:1px solid var(--color-border); padding-top:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:12.5px; font-weight:700; color:#0F172A;">🎯 Niveles de Meta (Venta $ / Bono x Emp $)</span>
          <button type="button" id="btn-modal-add-meta-row" class="btn btn-xs btn-secondary">+ Agregar Meta</button>
        </div>
        <div style="display:grid; grid-template-columns: 70px 1fr 1fr 34px; gap:8px; font-size:11px; font-weight:700; color:#64748B; margin-bottom:4px;">
          <span>Nivel</span><span>Venta Meta ($)</span><span>Bono / Emp ($)</span><span></span>
        </div>
        <div id="modal-metas-rows-container" style="display:flex; flex-direction:column; gap:6px;">
          ${renderMetasRowsHTML()}
        </div>
      </div>
    </div>
  `;

  openModal({
    title: isEdit ? `✏️ Editar Sede: ${Utils.escapeHtml(existente.nombre)}` : '🏪 Nueva Tienda / Sede Refill H2O',
    content,
    saveLabel: '💾 Guardar Sede',
    onOpen: (overlay) => {
      const rowsCont = overlay.querySelector('#modal-metas-rows-container');
      const syncInputsToWork = () => {
        const rows = [...rowsCont.querySelectorAll('.meta-edit-row')];
        metasWork = rows.map(r => ({
          montoUSD: parseFloat(r.querySelector('.inp-meta-monto').value) || 0,
          bonoUSD: parseFloat(r.querySelector('.inp-meta-bono').value) || 0
        }));
      };
      const repaintRows = () => {
        rowsCont.innerHTML = renderMetasRowsHTML();
      };
      overlay.querySelector('#btn-modal-add-meta-row')?.addEventListener('click', () => {
        syncInputsToWork();
        const last = metasWork[metasWork.length - 1] || { montoUSD: 0, bonoUSD: 0 };
        metasWork.push({ montoUSD: last.montoUSD + 500, bonoUSD: last.bonoUSD + 10 });
        repaintRows();
      });
      rowsCont.addEventListener('click', (e) => {
        const rm = e.target.closest('.btn-rm-meta-row');
        if (!rm) return;
        syncInputsToWork();
        if (metasWork.length <= 1) {
          showToast('La sede debe tener al menos una meta', 'warning');
          return;
        }
        metasWork.splice(parseInt(rm.dataset.idx, 10), 1);
        repaintRows();
      });
    },
    onSave: async (overlay) => {
      const nombre = (overlay.querySelector('#modal-sede-nombre')?.value || '').trim();
      const email = (overlay.querySelector('#modal-sede-email')?.value || '').trim().toLowerCase();
      const activa = !!overlay.querySelector('#modal-sede-activa')?.checked;
      const rows = [...overlay.querySelectorAll('#modal-metas-rows-container .meta-edit-row')];
      const metasNuevas = rows.map((r, i) => ({
        nivel: i + 1,
        montoUSD: parseFloat(r.querySelector('.inp-meta-monto').value) || 0,
        bonoUSD: parseFloat(r.querySelector('.inp-meta-bono').value) || 0
      })).filter(m => m.montoUSD > 0);

      if (!nombre) {
        showToast('Ingresa el nombre de la sede', 'warning');
        return;
      }
      if (metasNuevas.length === 0) {
        showToast('Configura al menos una meta con monto mayor a 0', 'warning');
        return;
      }

      const nextCfg = getMetasRefillConfigLocal(store);
      if (isEdit) {
        nextCfg.sedes = nextCfg.sedes.map(s =>
          s.id === sedeId ? { ...s, nombre, email, activa, metas: metasNuevas } : s
        );
      } else {
        const slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sede';
        nextCfg.sedes.push({
          id: `${slug}_${Date.now().toString(36)}`,
          nombre,
          email,
          activa,
          metas: metasNuevas,
          empleados: []
        });
      }

      const res = await guardarMetasRefillEnNube(nextCfg, store);
      closeModal();
      if (typeof onUpdated === 'function') onUpdated(res.config);
      showToast(res.ok ? 'Sede guardada y sincronizada' : 'Sede guardada localmente', res.ok ? 'success' : 'warning');
    }
  });
}

function openEmpleadosSedeModal(sedeId, onUpdated = null) {
  const cfg = getMetasRefillConfigLocal(store);
  const sede = cfg.sedes.find(s => s.id === sedeId);
  if (!sede) return;

  let empsWork = (sede.empleados || []).map(e => ({ ...e }));

  const renderEmpsRowsHTML = () => {
    if (empsWork.length === 0) {
      return `<div class="text-muted" style="padding:12px; text-align:center; border:1px dashed var(--color-border); border-radius:8px; font-size:13px;">No hay empleados registrados en esta sede. Agrega el primero arriba.</div>`;
    }
    return empsWork.map((e, i) => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 10px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px;">
        <div style="min-width:0;">
          <div style="font-size:13.5px; font-weight:700; color:${e.activo !== false ? '#0F172A' : '#94A3B8'}; ${e.activo === false ? 'text-decoration:line-through;' : ''}">
            👤 ${Utils.escapeHtml(e.nombre)}
          </div>
          ${e.cargo ? `<div style="font-size:11.5px; color:#64748B;">${Utils.escapeHtml(e.cargo)}</div>` : ''}
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button type="button" class="btn btn-xs btn-secondary btn-toggle-emp-activo" data-idx="${i}">
            ${e.activo !== false ? '🟢 Activo' : '⚪ Inactivo'}
          </button>
          <button type="button" class="btn btn-xs btn-secondary btn-del-emp-row" data-idx="${i}" style="color:#DC2626;">🗑️</button>
        </div>
      </div>
    `).join('');
  };

  const content = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="background:#EEF2FF; border:1px solid #C7D2FE; border-radius:8px; padding:10px 12px; display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end;">
        <div class="form-group" style="flex:1.4; min-width:150px; margin-bottom:0;">
          <label class="form-label" style="font-size:11.5px; font-weight:700; color:#3730A3;">Nombre del Empleado *</label>
          <input type="text" id="inp-nuevo-emp-nombre" class="form-control" placeholder="Ej: Juan Pérez" style="height:34px; font-size:13px;" />
        </div>
        <div class="form-group" style="flex:1; min-width:110px; margin-bottom:0;">
          <label class="form-label" style="font-size:11.5px; font-weight:700; color:#3730A3;">Cargo (opcional)</label>
          <input type="text" id="inp-nuevo-emp-cargo" class="form-control" placeholder="Ej: Operario" style="height:34px; font-size:13px;" />
        </div>
        <button type="button" id="btn-agregar-emp-lista" class="btn btn-sm btn-primary" style="height:34px;">+ Agregar</button>
      </div>

      <div id="modal-emps-lista-cont" style="display:flex; flex-direction:column; gap:6px; max-height:260px; overflow-y:auto;">
        ${renderEmpsRowsHTML()}
      </div>
      <div class="text-muted" style="font-size:11.5px;">
        Los empleados activos recibirán el bono configurado según la meta alcanzada de lunes a sábado.
      </div>
    </div>
  `;

  openModal({
    title: `👥 Empleados · ${Utils.escapeHtml(sede.nombre)}`,
    content,
    saveLabel: '💾 Guardar Cambios',
    onOpen: (overlay) => {
      const inpNom = overlay.querySelector('#inp-nuevo-emp-nombre');
      const inpCargo = overlay.querySelector('#inp-nuevo-emp-cargo');
      const listCont = overlay.querySelector('#modal-emps-lista-cont');

      const repaint = () => {
        listCont.innerHTML = renderEmpsRowsHTML();
      };

      const addEmp = () => {
        const nom = (inpNom.value || '').trim();
        const cargo = (inpCargo.value || '').trim();
        if (!nom) {
          showToast('Escribe el nombre del empleado', 'warning');
          return;
        }
        empsWork.push({
          id: 'emp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          nombre: nom,
          cargo,
          activo: true
        });
        inpNom.value = '';
        inpCargo.value = '';
        inpNom.focus();
        repaint();
      };

      overlay.querySelector('#btn-agregar-emp-lista')?.addEventListener('click', addEmp);
      inpNom?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addEmp();
        }
      });

      listCont.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.btn-toggle-emp-activo');
        if (toggleBtn) {
          const idx = parseInt(toggleBtn.dataset.idx, 10);
          if (empsWork[idx]) {
            empsWork[idx].activo = empsWork[idx].activo === false;
            repaint();
          }
          return;
        }
        const delBtn = e.target.closest('.btn-del-emp-row');
        if (delBtn) {
          empsWork.splice(parseInt(delBtn.dataset.idx, 10), 1);
          repaint();
        }
      });
    },
    onSave: async (overlay) => {
      const nomPendiente = (overlay.querySelector('#inp-nuevo-emp-nombre')?.value || '').trim();
      const cargoPendiente = (overlay.querySelector('#inp-nuevo-emp-cargo')?.value || '').trim();
      if (nomPendiente) {
        empsWork.push({
          id: 'emp_' + Date.now().toString(36),
          nombre: nomPendiente,
          cargo: cargoPendiente,
          activo: true
        });
      }

      const nextCfg = getMetasRefillConfigLocal(store);
      nextCfg.sedes = nextCfg.sedes.map(s =>
        s.id === sedeId ? { ...s, empleados: empsWork } : s
      );
      const res = await guardarMetasRefillEnNube(nextCfg, store);
      closeModal();
      if (typeof onUpdated === 'function') onUpdated(res.config);
      showToast(res.ok ? 'Personal actualizado y sincronizado' : 'Personal guardado localmente', res.ok ? 'success' : 'warning');
    }
  });
}
