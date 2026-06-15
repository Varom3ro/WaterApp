import { store } from '../store.js';
import { Utils } from '../utils.js';
import { showToast } from '../components/toast.js';
import { openModal, closeModal } from '../components/modal.js';

export function renderConfiguracion(container) {
  const tipos = store.getConfig('tiposBotellon') || [{ id: '20l', nombre: 'Botellón 20 Litros', litros: 20, precio: 1.50 }];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Configuración</h1>
        <p class="page-subtitle">Parámetros generales del sistema</p>
      </div>
    </div>

    <div class="dashboard-grid">
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
                <th>Nombre</th>
                <th>Capacidad</th>
                <th>Precio de Venta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="tipos-tbody">
              ${tipos.map(t => `
                <tr>
                  <td class="font-semibold">${Utils.escapeHtml(t.nombre)}</td>
                  <td>${t.litros}L</td>
                  <td class="text-success font-semibold">${Utils.formatCurrency(t.precio || 0)}</td>
                  <td>
                    <div class="flex gap-sm">
                      <button class="btn btn-sm btn-secondary btn-edit-tipo" data-id="${t.id}">✏️ Editar</button>
                      <button class="btn btn-sm btn-secondary btn-delete-tipo" data-id="${t.id}">🗑️</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
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
          showToast('Tipo eliminado', 'success');
        }
      });
    });
  });

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

function openTipoModal(id = null) {
  const isEdit = !!id;
  const tipos = store.getConfig('tiposBotellon') || [];
  const tipo = isEdit ? tipos.find(t => t.id === id) : {};

  const content = `
    <form id="form-tipo">
      <div class="form-group">
        <label class="form-label">Nombre del Botellón</label>
        <input type="text" class="form-control" name="nombre" value="${tipo.nombre || ''}" placeholder="Ej: Botellón 20L" required/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Capacidad (Litros)</label>
          <input type="number" class="form-control" name="litros" value="${tipo.litros || 20}" required/>
        </div>
        <div class="form-group">
          <label class="form-label">Precio de Venta ($)</label>
          <input type="number" class="form-control" name="precio" value="${tipo.precio || 1.50}" step="0.01" required/>
        </div>
      </div>
    </form>
  `;

  openModal({
    title: isEdit ? 'Editar Tipo' : 'Nuevo Tipo',
    content,
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-tipo');
      const fd = new FormData(form);
      const nombre = fd.get('nombre').trim();
      const litros = parseInt(fd.get('litros'));
      const precio = parseFloat(fd.get('precio'));

      if (!nombre || !litros || isNaN(precio)) return;

      if (isEdit) {
        const idx = tipos.findIndex(t => t.id === id);
        tipos[idx] = { ...tipos[idx], nombre, litros, precio };
      } else {
        tipos.push({ id: Utils.generateId(), nombre, litros, precio });
      }

      store.setConfig('tiposBotellon', tipos);
      closeModal();
      renderConfiguracion(document.querySelector('.main-content'));
      showToast('Guardado correctamente', 'success');
    }
  });
}
