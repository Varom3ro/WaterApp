// ============================================
// Tu Empresa - Inventario Module
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

export function renderInventario(container) {
  const inventario = store.getInventarioActual();
  const cisternas = store.getAll('cisternas').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const mermas = store.getAll('mermas').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const nivelPct = inventario.capacidadTanque > 0
    ? Math.round((inventario.litros / inventario.capacidadTanque) * 100)
    : 0;
  const tanqueClass = nivelPct <= 10 ? 'low' : nivelPct <= 30 ? 'medium' : '';

  // Calcular balance
  const totalCisternas = cisternas.reduce((sum, c) => sum + c.capacidad, 0);
  const ventas = store.getAll('ventas');
  const totalVendido = ventas.reduce((sum, v) => sum + (v.botellones * 20), 0);
  const totalMerma = mermas.reduce((sum, m) => sum + m.litros, 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Inventario de Agua</h1>
        <p class="page-subtitle">Control de cisternas, nivel de tanque y mermas</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-nueva-cisterna">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Registrar Cisterna
        </button>
        <button class="btn btn-secondary" id="btn-registrar-merma">
          🧹 Registrar Merma
        </button>
      </div>
    </div>

    <!-- Metrics -->
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="metric-card accent">
        <div class="metric-label">Nivel del Tanque</div>
        <div class="metric-value">${nivelPct}%</div>
        <div class="metric-change">${Utils.formatNumber(inventario.litros)} / ${Utils.formatNumber(inventario.capacidadTanque)} Litros</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Comprado (Cisternas)</div>
        <div class="metric-value">${Utils.formatNumber(totalCisternas)}</div>
        <div class="metric-change">Litros · ${cisternas.length} cisternas</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Vendido</div>
        <div class="metric-value">${Utils.formatNumber(totalVendido)}</div>
        <div class="metric-change">Litros · ${ventas.reduce((s, v) => s + v.botellones, 0)} botellones</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Tanque Visual -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Nivel del Tanque</h3>
          <button class="btn btn-sm btn-secondary" id="btn-config-tanque">⚙️ Configurar</button>
        </div>
        ${nivelPct <= 10 ? '<div class="alert-panel danger mb-md">⚠️ ¡Nivel crítico! Solicitar cisterna urgente.</div>' : ''}
        ${nivelPct > 10 && nivelPct <= 30 ? '<div class="alert-panel warning mb-md">⚡ Nivel bajo. Considere solicitar cisterna.</div>' : ''}
        <div class="tank-gauge" style="height:250px">
          <div class="tank-gauge-fill ${tanqueClass}" style="height:${Math.min(nivelPct, 100)}%"></div>
          <div class="tank-gauge-label" style="color:${nivelPct > 50 ? 'white' : 'var(--color-text-primary)'}">
            <span class="tank-gauge-percent">${nivelPct}%</span>
            <span class="tank-gauge-liters">${Utils.formatNumber(inventario.litros)} L</span>
          </div>
        </div>

        <div class="mt-lg" style="padding:var(--space-md);background:var(--color-bg);border-radius:var(--radius-md);font-size:var(--font-size-sm)">
          <strong>Fórmula de Balance:</strong><br/>
          Inv. Inicial + Cisternas - Ventas - Merma = Inv. Teórico<br/>
          <span class="text-muted">Merma total registrada: ${Utils.formatNumber(totalMerma)} L</span>
        </div>
      </div>

      <!-- Historial Cisternas -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Historial de Cisternas</h3>
        </div>
        ${cisternas.length > 0 ? `
          <div class="table-container">
            <table class="table">
              <thead><tr><th>Fecha</th><th>Capacidad</th><th>Nota</th><th>Acciones</th></tr></thead>
              <tbody>
                ${cisternas.map(c => `
                  <tr>
                    <td>${Utils.formatDateTime(c.fecha)}</td>
                    <td class="font-semibold">${Utils.formatNumber(c.capacidad)} L</td>
                    <td class="text-muted">${Utils.escapeHtml(c.nota || '-')}</td>
                    <td>
                      <div class="flex gap-sm">
                        <button class="btn btn-sm btn-secondary btn-edit-cisterna" data-id="${c.id}">✏️ Editar</button>
                        <button class="btn btn-sm btn-secondary btn-delete-cisterna" data-id="${c.id}">🗑️</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><span class="empty-state-icon">🚚</span><span class="empty-state-text">No hay cisternas registradas</span></div>'}
      </div>

      <!-- Historial Mermas -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Registro de Mermas (Lavado)</h3>
        </div>
        ${mermas.length > 0 ? `
          <div class="table-container">
            <table class="table">
              <thead><tr><th>Fecha</th><th>Litros</th><th>Motivo</th><th>Acciones</th></tr></thead>
              <tbody>
                ${mermas.map(m => `
                  <tr>
                    <td>${Utils.formatDateTime(m.fecha)}</td>
                    <td class="font-semibold text-warning">${Utils.formatNumber(m.litros)} L</td>
                    <td class="text-muted">${Utils.escapeHtml(m.motivo || 'Lavado de botellones')}</td>
                    <td>
                      <div class="flex gap-sm">
                        <button class="btn btn-sm btn-secondary btn-edit-merma" data-id="${m.id}">✏️ Editar</button>
                        <button class="btn btn-sm btn-secondary btn-delete-merma" data-id="${m.id}">🗑️</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="empty-state"><span class="empty-state-icon">🧹</span><span class="empty-state-text">No hay mermas registradas</span></div>'}
      </div>
    </div>
  `;

  // Events
  container.querySelector('#btn-nueva-cisterna').addEventListener('click', () => openCisternaModal());
  container.querySelector('#btn-registrar-merma').addEventListener('click', () => openMermaModal());
  container.querySelector('#btn-config-tanque').addEventListener('click', openConfigTanqueModal);

  // Edit/Delete Cisternas
  container.querySelectorAll('.btn-edit-cisterna').forEach(btn => {
    btn.addEventListener('click', () => openCisternaModal(btn.dataset.id));
  });
  container.querySelectorAll('.btn-delete-cisterna').forEach(btn => {
    btn.addEventListener('click', () => deleteCisterna(btn.dataset.id, container));
  });

  // Edit/Delete Mermas
  container.querySelectorAll('.btn-edit-merma').forEach(btn => {
    btn.addEventListener('click', () => openMermaModal(btn.dataset.id));
  });
  container.querySelectorAll('.btn-delete-merma').forEach(btn => {
    btn.addEventListener('click', () => deleteMerma(btn.dataset.id, container));
  });
}

function deleteCisterna(id, container) {
  const c = store.getById('cisternas', id);
  if (!c) return;
  openModal({
    title: 'Confirmar Eliminación',
    content: `¿Eliminar registro de cisterna de ${Utils.formatNumber(c.capacidad)}L? Se restará del tanque.`,
    saveLabel: 'Eliminar',
    onSave: () => {
      store.delete('cisternas', id);
      store.agregarCisterna(-c.capacidad);
      closeModal();
      renderInventario(container);
      showToast('Cisterna eliminada', 'success');
    }
  });
}

function deleteMerma(id, container) {
  const m = store.getById('mermas', id);
  if (!m) return;
  openModal({
    title: 'Confirmar Eliminación',
    content: `¿Eliminar registro de merma de ${Utils.formatNumber(m.litros)}L? Se devolverá al tanque.`,
    saveLabel: 'Eliminar',
    onSave: () => {
      store.delete('mermas', id);
      store.registrarMerma(-m.litros);
      closeModal();
      renderInventario(container);
      showToast('Merma eliminada', 'success');
    }
  });
}

function openCisternaModal(id = null) {
  const isEdit = !!id;
  const c = isEdit ? store.getById('cisternas', id) : {};

  const content = `
    <form id="form-cisterna">
      <div class="form-group">
        <label class="form-label">Capacidad de la Cisterna *</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-md)">
          ${Utils.cisternCapacities.map((cap, i) => `
            <label class="form-check" style="padding:var(--space-md);background:var(--color-bg);border-radius:var(--radius-md);border:2px solid var(--color-border);cursor:pointer">
              <input type="radio" name="capacidad" value="${cap}" ${c.capacidad === cap || (!c.capacidad && i === 0) ? 'checked' : ''}/>
              <span class="font-semibold">${Utils.formatNumber(cap)} Litros</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Nota (opcional)</label>
        <input type="text" class="form-control" name="nota" value="${c.nota || ''}" placeholder="Proveedor, observación..."/>
      </div>
    </form>
  `;

  openModal({
    title: 'Registrar Cisterna',
    content,
    saveLabel: 'Registrar Entrada',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-cisterna');
      const fd = new FormData(form);
      const capacidad = parseInt(fd.get('capacidad'));

      if (!capacidad) {
        showToast('Seleccione una capacidad', 'error');
        return;
      }

      if (isEdit) {
        store.update('cisternas', id, { capacidad, nota: fd.get('nota')?.trim() || '' });
        const diff = capacidad - (c.capacidad || 0);
        store.agregarCisterna(diff);
        showToast('Registro de cisterna actualizado', 'success');
      } else {
        const cisterna = {
          id: Utils.generateId(),
          capacidad,
          nota: fd.get('nota')?.trim() || '',
          fecha: Utils.nowISO()
        };
        store.save('cisternas', cisterna);
        store.agregarCisterna(capacidad);
        showToast(`Cisterna de ${Utils.formatNumber(capacidad)} L registrada`, 'success');
      }

      closeModal();
      const container = document.querySelector('.main-content');
      if (container) renderInventario(container);
    }
  });
}

function openMermaModal(id = null) {
  const isEdit = !!id;
  const m = isEdit ? store.getById('mermas', id) : {};

  const content = `
    <form id="form-merma">
      <div class="form-group">
        <label class="form-label">Litros de Merma *</label>
        <input type="number" class="form-control" name="litros" value="${m.litros || ''}" min="1" required placeholder="Ej: 100"/>
      </div>
      <div class="form-group">
        <label class="form-label">Motivo</label>
        <select class="form-control" name="motivo">
          <option value="Lavado de botellones" ${m.motivo === 'Lavado de botellones' ? 'selected' : ''}>🧹 Lavado de botellones</option>
          <option value="Purga del sistema" ${m.motivo === 'Purga del sistema' ? 'selected' : ''}>🔧 Purga del sistema</option>
          <option value="Fuga detectada" ${m.motivo === 'Fuga detectada' ? 'selected' : ''}>💧 Fuga detectada</option>
          <option value="Otro" ${m.motivo === 'Otro' ? 'selected' : ''}>📝 Otro</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Observación (opcional)</label>
        <input type="text" class="form-control" name="observacion" value="${m.observacion || ''}" placeholder="Detalle adicional..."/>
      </div>
    </form>
  `;

  openModal({
    title: 'Registrar Merma',
    content,
    saveLabel: 'Registrar Merma',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-merma');
      const fd = new FormData(form);
      const litros = parseInt(fd.get('litros'));

      if (!litros || litros < 1) {
        showToast('Ingrese una cantidad válida', 'error');
        return;
      }

      if (isEdit) {
        store.update('mermas', id, { 
          litros, 
          motivo: fd.get('motivo'),
          observacion: fd.get('observacion')?.trim() || ''
        });
        const diff = litros - (m.litros || 0);
        store.registrarMerma(diff);
        showToast('Registro de merma actualizado', 'success');
      } else {
        const merma = {
          id: Utils.generateId(),
          litros,
          motivo: fd.get('motivo'),
          observacion: fd.get('observacion')?.trim() || '',
          fecha: Utils.nowISO()
        };
        store.save('mermas', merma);
        store.registrarMerma(litros);
        showToast(`Merma de ${Utils.formatNumber(litros)} L registrada`, 'warning');
      }

      closeModal();
      const container = document.querySelector('.main-content');
      if (container) renderInventario(container);
    }
  });
}

function openConfigTanqueModal() {
  const inv = store.getInventarioActual();

  const content = `
    <form id="form-config-tanque">
      <div class="form-group">
        <label class="form-label">Capacidad Total del Tanque (Litros)</label>
        <input type="number" class="form-control" name="capacidad" value="${inv.capacidadTanque}" min="1000" step="500"/>
      </div>
      <div class="form-group">
        <label class="form-label">Nivel Actual (Litros) — Ajuste manual</label>
        <input type="number" class="form-control" name="litros" value="${inv.litros}" min="0"/>
        <small class="text-muted">Use esto para corregir discrepancias entre el inventario teórico y el real.</small>
      </div>
    </form>
  `;

  openModal({
    title: 'Configurar Tanque',
    content,
    saveLabel: 'Guardar',
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-config-tanque');
      const fd = new FormData(form);
      const capacidad = parseInt(fd.get('capacidad')) || 30000;
      const litros = parseInt(fd.get('litros')) || 0;

      store.setConfig('inventario', { litros, capacidadTanque: capacidad });
      showToast('Configuración de tanque actualizada', 'success');
      closeModal();
      const container = document.querySelector('.main-content');
      if (container) renderInventario(container);
    }
  });
}
