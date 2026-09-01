import { store } from '../store.js';
import { Utils } from '../utils.js';

export function renderSidebar() {
  const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
  const empresaLogo = store.getConfig('empresaLogo') || './img/logo.png';

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

  return `
    <aside class="sidebar">
      <div class="sidebar-logo" style="flex-direction: column; align-items: flex-start; padding: 14px 16px 12px 16px;">
        <div style="width: 100%; display: flex; justify-content: center; align-items: center; margin-bottom: 12px;">
          <img src="${empresaLogo}" alt="${Utils.escapeHtml(empresaNombre)}" class="logo-img" style="width: 100%; max-width: 100%; height: auto; max-height: 210px; object-fit: contain; display: block; border-radius: 6px;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%231B4332%22 stroke-width=%222%22><path d=%22M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z%22/></svg>'">
        </div>
        <h1 style="font-size: 15px; font-weight: 700; color: var(--color-text-main); margin: 0; text-align: left; line-height: 1.25; word-break: break-word; width: 100%;">
          ${Utils.escapeHtml(empresaNombre)}
        </h1>
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 6px;">
          <span style="font-size: 11px; color: #888; font-weight: normal; padding: 2px 8px; background: #eee; border-radius: 10px;" id="app-version">v2.6</span>
          ${diasRestantesText ? `
            <span style="font-size: 10px; color: #065F46; background: #DCFCE7; font-weight: 700; padding: 2px 6px; border-radius: 6px;">
              🟢 ${diasRestantesText}
            </span>
          ` : ''}
        </div>
        <div style="font-size: 11px; color: #1E293B; background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 8px; margin-top: 8px; word-break: break-all; width: 100%; display: flex; align-items: center; gap: 6px;">
          <span>👤</span>
          <span style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${Utils.escapeHtml(usuarioEmail)}">
            ${Utils.escapeHtml(usuarioEmail)}
          </span>
        </div>
      </div>

      <span class="sidebar-section-title">Menú</span>
      <nav class="sidebar-nav" id="main-nav">
        <a class="sidebar-nav-item active" data-route="/inicio" href="#/inicio">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </span>
          Inicio
        </a>
        <a class="sidebar-nav-item" data-route="/clientes" href="#/clientes">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </span>
          Clientes
          <span class="nav-badge" id="badge-morosos" style="display:none">0</span>
        </a>
        <a class="sidebar-nav-item" data-route="/ventas" href="#/ventas">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
          </span>
          Ventas
        </a>
        <a class="sidebar-nav-item" data-route="/cierre-caja" href="#/cierre-caja">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4h16v16H4z"/>
              <path d="M4 8h16"/>
              <path d="M8 4v4"/>
            </svg>
          </span>
          Cierre de Caja
        </a>
        <a class="sidebar-nav-item" data-route="/inventario" href="#/inventario">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
          </span>
          Inventario
        </a>
        <a class="sidebar-nav-item" data-route="/reportes" href="#/reportes">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </span>
          Reportes
        </a>
      </nav>

      <span class="sidebar-section-title" style="margin-top:var(--space-xl)">General</span>
      <nav class="sidebar-nav">
        <a class="sidebar-nav-item" data-route="/configuracion" href="#/configuracion">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </span>
          Configuración
        </a>
        <a id="btn-logout" class="sidebar-nav-item" style="color:var(--color-danger)">
          <span class="nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </span>
          Salir
        </a>
      </nav>
    </aside>
  `;
}
