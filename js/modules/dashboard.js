// ============================================
// Tu Empresa - Home Module
// ============================================

import { store } from '../store.js';
import { Utils } from '../utils.js';

export function renderDashboard(container) {
  container.innerHTML = `
    <div class="home-container">
      <div class="home-nav-grid">
        <a href="#/clientes" class="nav-card">
          <div class="nav-card-icon color-1">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="nav-card-info">
            <h3 class="nav-card-title">Clientes</h3>
            <p class="nav-card-desc">Base de datos, abonos y morosos</p>
          </div>
        </a>

        <a href="#/inventario" class="nav-card">
          <div class="nav-card-icon color-2">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
            </svg>
          </div>
          <div class="nav-card-info">
            <h3 class="nav-card-title">Inventario</h3>
            <p class="nav-card-desc">Control de litros y botellones</p>
          </div>
        </a>

        <a href="#/ventas" class="nav-card">
          <div class="nav-card-icon color-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
          </div>
          <div class="nav-card-info">
            <h3 class="nav-card-title">Ventas</h3>
            <p class="nav-card-desc">Registrar y liquidar ventas</p>
          </div>
        </a>

        <a href="#/reportes" class="nav-card">
          <div class="nav-card-icon color-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <div class="nav-card-info">
            <h3 class="nav-card-title">Reportes</h3>
            <p class="nav-card-desc">Estadísticas y cierre de caja</p>
          </div>
        </a>
      </div>
    </div>
  `;
}
