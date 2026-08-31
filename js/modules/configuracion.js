import { store } from '../store.js';
import { Utils } from '../utils.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderSidebar } from '../components/sidebar.js';

export function renderConfiguracion(container) {
  const tipos = store.getConfig('tiposBotellon') || [{ id: '20l', nombre: 'Botellón 20 Litros', litros: 20, precio: 1.50 }];
  const repartidores = store.getConfig('repartidores') || [];
  const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
  const empresaLogo = store.getConfig('empresaLogo') || './img/logo.png';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Configuración</h1>
        <p class="page-subtitle">Parámetros generales del sistema</p>
      </div>
    </div>

    <div class="dashboard-grid">
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
                  <td>${t.categoria === 'producto' ? 'N/A' : (t.litros + 'L')}</td>
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

  const content = `
    <form id="form-tipo">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <select class="form-control" name="categoria" id="tipo-categoria-select">
            <option value="relleno" ${tipo.categoria !== 'producto' ? 'selected' : ''}>Tipo de Relleno (Recarga)</option>
            <option value="producto" ${tipo.categoria === 'producto' ? 'selected' : ''}>Tipo de Productos (Físico)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Nombre del Ítem</label>
          <input type="text" class="form-control" name="nombre" value="${tipo.nombre || ''}" placeholder="Ej: Botellón 20L" required/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="grupo-litros" style="${tipo.categoria === 'producto' ? 'display:none;' : ''}">
          <label class="form-label">Capacidad (Litros)</label>
          <input type="number" class="form-control" name="litros" value="${tipo.litros !== undefined ? tipo.litros : 20}" required/>
        </div>
        <div class="form-group">
          <label class="form-label">Moneda del Precio</label>
          <select class="form-control" name="moneda" id="tipo-moneda-select">
            <option value="USD" ${currentMoneda === 'USD' ? 'selected' : ''}>Dólares ($)</option>
            <option value="VES" ${currentMoneda === 'VES' || currentMoneda === 'Bs' ? 'selected' : ''}>Bolívares (Bs.)</option>
          </select>
        </div>
        <div class="form-group">
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
      const monSelect = overlay.querySelector('#tipo-moneda-select');
      const labelPrecio = overlay.querySelector('#label-precio-venta');

      if (catSelect && grupoLitros) {
        catSelect.addEventListener('change', () => {
          grupoLitros.style.display = catSelect.value === 'producto' ? 'none' : 'block';
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
      const nombre = fd.get('nombre').trim();
      const litros = categoria === 'producto' ? 0 : parseInt(fd.get('litros'));
      const moneda = fd.get('moneda') || 'USD';
      const precio = parseFloat(fd.get('precio'));

      if (!nombre || (categoria !== 'producto' && isNaN(litros)) || isNaN(precio)) return;

      if (isEdit) {
        const idx = tipos.findIndex(t => t.id === id);
        tipos[idx] = { ...tipos[idx], categoria, nombre, litros, moneda, precio };
      } else {
        tipos.push({ id: Utils.generateId(), categoria, nombre, litros, moneda, precio });
      }

      store.setConfig('tiposBotellon', tipos);
      closeModal();
      renderConfiguracion(document.querySelector('.main-content'));
      showToast('Guardado correctamente', 'success');
    }
  });
}
