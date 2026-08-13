import { store } from '../store.js';
import { Utils } from '../utils.js';
import { renderNuevaVentaForm, renderVentas } from './ventas.js';
import { getCumpleanerosHoy, getWhatsAppBirthdayUrl } from './clientes.js';

export function renderDashboard(container) {
  const todayStr = Utils.todayISO();
  const notificadosKey = `cumpleaneros_notificados_${todayStr}`;
  const notificadosIds = JSON.parse(sessionStorage.getItem(notificadosKey) || '[]');

  const todosCumpleaneros = getCumpleanerosHoy();
  const cumpleanerosPendientes = todosCumpleaneros.filter(c => !notificadosIds.includes(c.id));

  container.innerHTML = `
    ${cumpleanerosPendientes.length > 0 ? `
      <div id="banner-cumpleanos-dashboard" class="card mb-lg" style="background: linear-gradient(135deg, #FFF9E6, #FEF3C7); border: 2px solid #F59E0B; padding: 16px 20px; position: relative;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 32px;">🎉</span>
            <div>
              <h3 style="margin: 0; font-size: 16px; color: #92400E; font-weight: 700;">¡Hoy está de cumpleaños! 🎂</h3>
              <p style="margin: 2px 0 0 0; font-size: 14px; color: #B45309;">
                ${cumpleanerosPendientes.map(c => `<strong>${Utils.escapeHtml(c.nombre)}</strong>`).join(', ')}
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${cumpleanerosPendientes.map(c => `
              <div style="display: inline-flex; gap: 4px; align-items: center;">
                <a href="${getWhatsAppBirthdayUrl(c)}" target="_blank" class="btn btn-sm" style="background: #25D366; color: white; border: none; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 6px;">
                  💬 Felicitar a ${Utils.escapeHtml(c.nombre.split(' ')[0])} por WhatsApp
                </a>
                <button class="btn btn-sm btn-dismiss-cumple" data-id="${c.id}" title="Marcar como ya notificado hoy" style="background: rgba(180, 83, 9, 0.15); color: #B45309; border: none; padding: 8px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer;">
                  ✕ Ya Notificado
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    ` : ''}
    <div id="home-venta-container"></div>
    <div id="home-historial-container"></div>
  `;

  const banner = container.querySelector('#banner-cumpleanos-dashboard');
  if (banner) {
    banner.querySelectorAll('.btn-dismiss-cumple').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentNotificados = JSON.parse(sessionStorage.getItem(notificadosKey) || '[]');
        if (!currentNotificados.includes(id)) {
          currentNotificados.push(id);
          sessionStorage.setItem(notificadosKey, JSON.stringify(currentNotificados));
        }
        renderDashboard(container);
      });
    });
  }

  // Render the sales form inside the new container
  renderNuevaVentaForm(container.querySelector('#home-venta-container'));
  // Render el historial
  renderVentas(container.querySelector('#home-historial-container'));
}
