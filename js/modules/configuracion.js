import { store } from '../store.js';
import { Utils } from '../utils.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderSidebar } from '../components/sidebar.js';
import { syncToCloud } from '../cloud-sync.js';

export function renderConfiguracion(container) {
  const tipos = store.getConfig('tiposBotellon') || [{ id: '20l', nombre: 'Botellón 20 Litros', litros: 20, precio: 1.50 }];
  const repartidores = store.getConfig('repartidores') || [];
  const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
  const empresaLogo = store.getConfig('empresaLogo') || './img/logo.png';
  const moduloCaudalimetro = store.getConfig('moduloCaudalimetro') || false;
  const unidadCaudalimetro = store.getConfig('unidadCaudalimetro') || 'L';
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
                      <span class="badge ${ (t.stock || 0) > 0 ? 'badge-info' : 'badge-warning'}" style="font-size: 11px; padding: 3px 8px;">
                        📦 Stock: <b>${t.stock !== undefined ? t.stock : 0}</b> un.
                      </span>
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

      <!-- Repartidores de Delivery -->
      <div class="card full-width">
        <div class="card-header">
          <h3 class="card-title">🛵 Repartidores de Delivery</h3>
          <button class="btn btn-sm btn-primary" id="btn-add-repartidor">
            + Agregar Repartidor
          </button>
        </div>
        <div class="table-container mt-md">
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

      <!-- Delivery Config -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🚚 Tarifa de Delivery</h3>
        </div>
        <p class="text-muted mb-md" style="font-size:var(--font-size-sm)">Monto predeterminado del servicio de envío.</p>
        <div class="form-group" style="max-width: 200px;">
          <label class="form-label">Precio ($)</label>
          <div style="display:flex; gap:10px;">
            <input type="number" id="input-config-delivery" class="form-control" step="0.01" value="${store.getConfig('precioDelivery') ?? '0.50'}" />
            <button class="btn btn-primary" id="btn-save-delivery">Guardar</button>
          </div>
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
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="btn-preset-zonas-este" class="btn btn-xs btn-secondary" style="font-size: 11px; font-weight: 600;" title="Cargar zonas de La California, Sucre y Caracas Este">
              📍 Plantilla: La California / Sucre
            </button>
            <button type="button" id="btn-preset-zonas-oeste" class="btn btn-xs btn-secondary" style="font-size: 11px; font-weight: 600;" title="Cargar zonas de El Paraíso y Caracas Oeste">
              📍 Plantilla: El Paraíso / Libertador
            </button>
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

      <!-- Seguridad y Contraseña -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🔐 Seguridad y Contraseña de Acceso</h3>
        </div>
        <p class="text-muted mb-md" style="font-size:var(--font-size-sm)">Personaliza la clave de ingreso para la caja y administración.</p>
        <div style="display: flex; flex-direction: column; gap: var(--space-sm); max-width: 320px;">
          <div class="form-group mb-sm">
            <label class="form-label" style="font-size: var(--font-size-xs);">Contraseña Actual</label>
            <input type="password" id="input-pwd-actual" class="form-control" placeholder="Clave actual (por defecto admins)" />
          </div>
          <div class="form-group mb-sm">
            <label class="form-label" style="font-size: var(--font-size-xs);">Nueva Contraseña</label>
            <input type="password" id="input-pwd-nueva" class="form-control" placeholder="Nueva clave (mín. 4 caracteres)" />
          </div>
          <div class="form-group mb-sm">
            <label class="form-label" style="font-size: var(--font-size-xs);">Confirmar Nueva Contraseña</label>
            <input type="password" id="input-pwd-confirmar" class="form-control" placeholder="Repite la nueva clave" />
          </div>
          <div style="margin-top: 6px;">
            <button class="btn btn-primary" id="btn-save-password" style="width: 100%;">
              🔑 Actualizar Contraseña
            </button>
          </div>
        </div>
      </div>

      <!-- Backup -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">💾 Respaldo de Datos</h3>
        </div>
        <p class="text-muted mb-md" style="font-size:var(--font-size-sm)">Exporta o importa la base de datos completa.</p>
        <div class="flex gap-md" style="flex-wrap:wrap">
          <button class="btn btn-primary" id="btn-export">📥 Exportar</button>
          <label class="btn btn-secondary" style="cursor:pointer">
            📤 Importar
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
      const ok = await syncToCloud();
      btnSyncManual.disabled = false;
      btnSyncManual.textContent = '☁️ Sincronizar Nube Ahora';
      if (ok) {
        showToast('☁️ Datos reales sincronizados con la Nube con éxito', 'success');
      } else {
        showToast('⚠️ No se pudo sincronizar. Verifica tu conexión a internet.', 'warning');
      }
    });
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

  let tempLogoBase64 = empresaLogo;
  const inputLogo = container.querySelector('#input-empresa-logo');
  const previewLogo = container.querySelector('#preview-empresa-logo');

  if (inputLogo) {
    inputLogo.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          tempLogoBase64 = evt.target.result;
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
    btnSaveEmpresa.addEventListener('click', () => {
      const inputNombre = container.querySelector('#input-empresa-nombre');
      const nombreVal = inputNombre ? inputNombre.value.trim() : 'Tu Empresa';

      store.setConfig('empresaNombre', nombreVal || 'Tu Empresa');
      if (tempLogoBase64) {
        store.setConfig('empresaLogo', tempLogoBase64);
      }

      showToast('Datos de la empresa actualizados correctamente', 'success');

      // Actualizar inmediatamente el Sidebar en el DOM
      const sidebarContainer = document.querySelector('.sidebar');
      if (sidebarContainer) {
        sidebarContainer.outerHTML = renderSidebar();
      }
    });
  }

  const btnSaveDeliv = container.querySelector('#btn-save-delivery');
  if (btnSaveDeliv) {
    btnSaveDeliv.addEventListener('click', () => {
      const val = parseFloat(container.querySelector('#input-config-delivery').value);
      if (!isNaN(val) && val >= 0) {
        store.setConfig('precioDelivery', val);
        showToast('Tarifa de delivery actualizada', 'success');
      }
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

  const btnPresetEste = container.querySelector('#btn-preset-zonas-este');
  if (btnPresetEste) {
    btnPresetEste.addEventListener('click', () => {
      const presets = store.getZonasPresets();
      currentMunicipios = [...presets.este.municipios];
      currentUrbanizaciones = [...presets.este.urbanizaciones];
      renderZonasTags();
      showToast('Cargada plantilla de La California / Sucre. Haz clic en "Guardar Zonas" para confirmar.', 'info');
    });
  }

  const btnPresetOeste = container.querySelector('#btn-preset-zonas-oeste');
  if (btnPresetOeste) {
    btnPresetOeste.addEventListener('click', () => {
      const presets = store.getZonasPresets();
      currentMunicipios = [...presets.oeste.municipios];
      currentUrbanizaciones = [...presets.oeste.urbanizaciones];
      renderZonasTags();
      showToast('Cargada plantilla de El Paraíso / Libertador. Haz clic en "Guardar Zonas" para confirmar.', 'info');
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
          const nuevosTipos = store.getConfig('tiposBotellon').filter(x => x.id !== id);
          store.setConfig('tiposBotellon', nuevosTipos);
          closeModal();
          renderConfiguracion(container);
          showToast('Eliminado correctamente', 'success');
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

  // Backup events
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
    reader.onload = (ev) => {
      if (store.importData(ev.target.result)) {
        showToast('Importación correcta', 'success');
        setTimeout(() => location.reload(), 1000);
      }
    };
    reader.readAsText(file);
  });
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
          <input type="text" class="form-control" name="nombre" value="${tipo.nombre || ''}" placeholder="Ej: Botellón 20L / Agarradera" required/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="grupo-litros" style="${isProd ? 'display:none;' : ''}; flex: 1;">
          <label class="form-label">Capacidad (Litros)</label>
          <input type="number" class="form-control" name="litros" value="${tipo.litros !== undefined ? tipo.litros : 20}" min="1"/>
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
          <input type="number" class="form-control" name="precio" id="input-precio-venta" value="${tipo.precio !== undefined ? tipo.precio : 1.50}" step="0.01" min="0" required/>
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
      const monSelect = overlay.querySelector('#tipo-moneda-select');
      const labelPrecio = overlay.querySelector('#label-precio-venta');

      const toggleFields = () => {
        const isProducto = catSelect.value === 'producto';
        if (grupoLitros) grupoLitros.style.display = isProducto ? 'none' : 'block';
        if (grupoStock) grupoStock.style.display = isProducto ? 'block' : 'none';
      };

      if (catSelect) {
        catSelect.addEventListener('change', toggleFields);
        toggleFields(); // sincronizar al abrir
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
      const nombre = fd.get('nombre').trim();
      const litros = categoria === 'producto' ? 0 : (parseInt(fd.get('litros')) || 20);
      const stock = categoria === 'producto' ? (parseInt(fd.get('stock')) || 0) : 0;
      const moneda = fd.get('moneda') || 'USD';
      const precio = parseFloat(fd.get('precio'));

      if (!nombre || isNaN(precio)) {
        showToast('Por favor complete los campos obligatorios', 'warning');
        return;
      }

      if (isEdit) {
        const idx = tipos.findIndex(t => t.id === id);
        tipos[idx] = { ...tipos[idx], categoria, nombre, litros, stock, moneda, precio };
      } else {
        tipos.push({ id: Utils.generateId(), categoria, nombre, litros, stock, moneda, precio });
      }

      store.setConfig('tiposBotellon', tipos);
      closeModal();
      renderConfiguracion(document.querySelector('.main-content'));
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
