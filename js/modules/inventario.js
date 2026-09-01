// ============================================
// Tu Empresa - Inventario Module (Agua y Productos)
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { syncToCloud } from '../cloud-sync.js';

export function renderInventario(container) {
  const inventario = store.getInventarioActual();
  const cisternas = store.getAll('cisternas').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const mermas = store.getAll('mermas').sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const tipos = store.getConfig('tiposBotellon') || [];
  const productosFisicos = tipos.filter(t => t.categoria === 'producto');
  const totalStockProductos = productosFisicos.reduce((sum, p) => sum + (p.stock || 0), 0);

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
        <h1 class="page-title">Control de Inventario</h1>
        <p class="page-subtitle">Nivel de tanque de agua, cisternas y stock de productos físicos</p>
      </div>
      <div class="page-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-nueva-cisterna">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Registrar Cisterna
        </button>
        <button class="btn btn-secondary" id="btn-registrar-merma">
          🧹 Registrar Merma
        </button>
        ${productosFisicos.length > 0 ? `
          <button class="btn btn-secondary" id="btn-entrada-stock-general" style="background:#EFF6FF; color:#1D4ED8; border-color:#BFDBFE; font-weight:600;">
            📦 + Entrada de Mercancía
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Metrics -->
    <div class="metrics-grid" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr))">
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
      <div class="metric-card" style="border-left: 4px solid #3B82F6;">
        <div class="metric-label">Stock de Productos Físicos</div>
        <div class="metric-value" style="color: #2563EB;">${totalStockProductos}</div>
        <div class="metric-change">${productosFisicos.length} tipo(s) de productos registrados</div>
      </div>
    </div>

    <!-- Sección de Productos Físicos -->
    <div class="card mb-lg">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h3 class="card-title">📦 Inventario de Productos Físicos</h3>
          <p class="text-muted" style="font-size:var(--font-size-xs); margin-top:2px;">Botellones nuevos, agarraderas, bombas, tapas y accesorios.</p>
        </div>
        <div class="flex gap-sm">
          <a href="#/configuracion" class="btn btn-sm btn-secondary" style="font-size:12px;">⚙️ Administrar Productos</a>
        </div>
      </div>

      ${productosFisicos.length > 0 ? `
        <div class="table-container mt-md">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 35%;">Producto</th>
                <th style="width: 20%;">Precio de Venta</th>
                <th style="width: 20%;">Stock Disponible</th>
                <th style="width: 15%;">Estado</th>
                <th style="width: 10%; text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${productosFisicos.map(p => {
                const stock = p.stock !== undefined ? p.stock : 0;
                const isBs = p.moneda === 'VES' || p.moneda === 'Bs';
                const precioStr = isBs ? `Bs ${Utils.formatNumber(p.precio, true)}` : Utils.formatCurrency(p.precio);
                
                let badgeEstado = '<span class="badge badge-success">🟢 En Stock</span>';
                if (stock === 0) {
                  badgeEstado = '<span class="badge badge-danger">🔴 Agotado</span>';
                } else if (stock <= 5) {
                  badgeEstado = '<span class="badge badge-warning">🟡 Stock Bajo</span>';
                }

                return `
                  <tr>
                    <td>
                      <div class="font-semibold" style="font-size:15px;">📦 ${Utils.escapeHtml(p.nombre)}</div>
                    </td>
                    <td>
                      <span class="font-semibold">${precioStr}</span>
                    </td>
                    <td>
                      <span style="font-size: 16px; font-weight: 700; color: ${stock === 0 ? 'var(--color-danger)' : (stock <= 5 ? 'var(--color-warning)' : 'var(--color-text-primary)')};">
                        ${stock} unidades
                      </span>
                    </td>
                    <td>
                      ${badgeEstado}
                    </td>
                    <td style="text-align: right;">
                      <button class="btn btn-sm btn-primary btn-ajustar-stock" data-id="${p.id}" style="padding: 4px 10px; font-size: 12px; white-space: nowrap;">
                        ➕ Entrada / Ajuste
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="empty-state" style="padding: 30px 15px;">
          <span class="empty-state-icon">📦</span>
          <span class="empty-state-text">No has creado productos físicos aún (agarraderas, bombas, botellones vacíos, tapas).</span>
          <a href="#/configuracion" class="btn btn-sm btn-primary mt-md">+ Crear Producto en Configuración</a>
        </div>
      `}
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
          <strong>Fórmula de Balance de Agua:</strong><br/>
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

  const btnEntradaStockGen = container.querySelector('#btn-entrada-stock-general');
  if (btnEntradaStockGen) {
    btnEntradaStockGen.addEventListener('click', () => openAjustarStockModal(null, container));
  }

  container.querySelectorAll('.btn-ajustar-stock').forEach(btn => {
    btn.addEventListener('click', () => openAjustarStockModal(btn.dataset.id, container));
  });

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

function openAjustarStockModal(selectedId = null, container = null) {
  const tipos = store.getConfig('tiposBotellon') || [];
  const prods = tipos.filter(t => t.categoria === 'producto');

  if (prods.length === 0) {
    showToast('No hay productos físicos registrados aún', 'warning');
    return;
  }

  const defaultProd = selectedId ? prods.find(p => p.id === selectedId) : prods[0];

  const content = `
    <form id="form-ajuste-stock">
      <div class="form-group mb-md">
        <label class="form-label">Seleccionar Producto Físico</label>
        <select class="form-control" name="productoId" id="select-ajuste-producto">
          ${prods.map(p => `
            <option value="${p.id}" ${p.id === (defaultProd ? defaultProd.id : '') ? 'selected' : ''} data-stock="${p.stock || 0}">
              📦 ${Utils.escapeHtml(p.nombre)} (Stock actual: ${p.stock || 0} un.)
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-group mb-md">
        <label class="form-label">Tipo de Movimiento</label>
        <select class="form-control" name="tipoMovimiento" id="select-tipo-mov">
          <option value="entrada">➕ Entrada de Mercancía / Compra (Sumar unidades)</option>
          <option value="fijar">✏️ Ajuste Manual (Establecer stock exacto)</option>
          <option value="salida">➖ Salida / Merma de Producto (Restar unidades)</option>
        </select>
      </div>

      <div class="form-group mb-md">
        <label class="form-label" id="label-cant-ajuste">Cantidad de Unidades a Sumar *</label>
        <input type="number" class="form-control" name="cantidad" id="input-cant-ajuste" min="1" placeholder="Ingrese cantidad..." required autofocus/>
      </div>

      <div class="alert-panel info" id="panel-resumen-stock" style="margin-bottom: 0; padding: 10px 14px; font-size: 14px;">
        Stock resultante estimado: <strong style="margin-left: 6px;" id="val-nuevo-stock">${defaultProd.stock || 0} unidades</strong>
      </div>
    </form>
  `;

  openModal({
    title: '📦 Entrada y Ajuste de Stock',
    content,
    saveLabel: 'Guardar Movimiento',
    onOpen: (overlay) => {
      const selectProd = overlay.querySelector('#select-ajuste-producto');
      const selectMov = overlay.querySelector('#select-tipo-mov');
      const inputCant = overlay.querySelector('#input-cant-ajuste');
      const labelCant = overlay.querySelector('#label-cant-ajuste');
      const valNuevoStock = overlay.querySelector('#val-nuevo-stock');

      const recalc = () => {
        const opt = selectProd.selectedOptions[0];
        const currentStock = opt ? parseInt(opt.getAttribute('data-stock')) || 0 : 0;
        const mov = selectMov.value;
        const cant = parseInt(inputCant.value) || 0;

        let nuevo = currentStock;
        if (mov === 'entrada') {
          labelCant.textContent = 'Cantidad de Unidades a Sumar *';
          nuevo = currentStock + cant;
        } else if (mov === 'fijar') {
          labelCant.textContent = 'Nuevo Stock Total Exacto *';
          nuevo = inputCant.value.trim() === '' ? currentStock : cant;
        } else if (mov === 'salida') {
          labelCant.textContent = 'Cantidad de Unidades a Restar *';
          nuevo = Math.max(0, currentStock - cant);
        }

        if (valNuevoStock) valNuevoStock.textContent = `${nuevo} unidades`;
      };

      selectProd.addEventListener('change', recalc);
      selectMov.addEventListener('change', recalc);
      inputCant.addEventListener('input', recalc);
      recalc();
      setTimeout(() => { if (inputCant) inputCant.focus(); }, 100);
    },
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-ajuste-stock');
      const fd = new FormData(form);
      const prodId = fd.get('productoId');
      const mov = fd.get('tipoMovimiento');
      const cant = parseInt(fd.get('cantidad'));

      if (!prodId || isNaN(cant) || cant < 0) {
        showToast('Ingrese una cantidad válida', 'warning');
        return;
      }

      const allTipos = store.getConfig('tiposBotellon') || [];
      const idx = allTipos.findIndex(p => p.id === prodId);
      if (idx === -1) return;

      const current = allTipos[idx].stock || 0;
      let nuevoStock = current;

      if (mov === 'entrada') {
        nuevoStock = current + cant;
      } else if (mov === 'fijar') {
        nuevoStock = cant;
      } else if (mov === 'salida') {
        nuevoStock = Math.max(0, current - cant);
      }

      allTipos[idx].stock = nuevoStock;
      store.setConfig('tiposBotellon', allTipos);
      syncToCloud();

      closeModal();
      showToast(`Stock de "${allTipos[idx].nombre}" actualizado a ${nuevoStock} un.`, 'success');
      if (container) {
        renderInventario(container);
      } else {
        const main = document.querySelector('.main-content');
        if (main) renderInventario(main);
      }
    }
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
      syncToCloud();
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
      syncToCloud();
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
        showToast(`Cisterna de ${Utils.formatNumber(capacidad)}L registrada`, 'success');
      }

      syncToCloud();
      closeModal();
      const main = document.querySelector('.main-content');
      if (main) renderInventario(main);
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
        <input type="number" class="form-control" name="litros" value="${m.litros || ''}" placeholder="Ej: 50" min="1" required/>
      </div>
      <div class="form-group">
        <label class="form-label">Motivo de la Merma</label>
        <select class="form-control" name="motivo">
          <option value="Lavado de botellones" ${m.motivo === 'Lavado de botellones' ? 'selected' : ''}>Lavado de botellones</option>
          <option value="Fuga o goteo" ${m.motivo === 'Fuga o goteo' ? 'selected' : ''}>Fuga o goteo</option>
          <option value="Derrame accidental" ${m.motivo === 'Derrame accidental' ? 'selected' : ''}>Derrame accidental</option>
          <option value="Mantenimiento de filtros" ${m.motivo === 'Mantenimiento de filtros' ? 'selected' : ''}>Mantenimiento de filtros</option>
          <option value="Otro" ${m.motivo === 'Otro' ? 'selected' : ''}>Otro</option>
        </select>
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

      if (!litros || litros <= 0) {
        showToast('Ingrese una cantidad válida', 'error');
        return;
      }

      if (isEdit) {
        store.update('mermas', id, { litros, motivo: fd.get('motivo') });
        const diff = litros - (m.litros || 0);
        store.registrarMerma(diff);
        showToast('Merma actualizada', 'success');
      } else {
        const merma = {
          id: Utils.generateId(),
          litros,
          motivo: fd.get('motivo'),
          fecha: Utils.nowISO()
        };
        store.save('mermas', merma);
        store.registrarMerma(litros);
        showToast(`Merma de ${Utils.formatNumber(litros)}L registrada`, 'success');
      }

      syncToCloud();
      closeModal();
      const main = document.querySelector('.main-content');
      if (main) renderInventario(main);
    }
  });
}

function openConfigTanqueModal() {
  const inv = store.getInventarioActual();

  const content = `
    <form id="form-config-tanque">
      <div class="form-group">
        <label class="form-label">Capacidad Máxima del Tanque (Litros)</label>
        <input type="number" class="form-control" name="capacidadTanque" value="${inv.capacidadTanque || 30000}" min="1000" step="500" required/>
      </div>
      <div class="form-group">
        <label class="form-label">Litros Actuales en Tanque</label>
        <input type="number" class="form-control" name="litros" value="${inv.litros || 0}" min="0" step="100" required/>
      </div>
    </form>
  `;

  openModal({
    title: 'Configurar Tanque',
    content,
    onSave: (overlay) => {
      const form = overlay.querySelector('#form-config-tanque');
      const fd = new FormData(form);
      const capacidadTanque = parseInt(fd.get('capacidadTanque'));
      const litros = parseInt(fd.get('litros'));

      if (!capacidadTanque || litros < 0) {
        showToast('Valores inválidos', 'error');
        return;
      }

      store.setConfig('inventario', { litros: Math.min(litros, capacidadTanque), capacidadTanque });
      syncToCloud();
      showToast('Configuración del tanque guardada', 'success');
      closeModal();
      const main = document.querySelector('.main-content');
      if (main) renderInventario(main);
    }
  });
}
