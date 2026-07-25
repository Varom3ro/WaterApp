import { store } from '../store.js';
import { Utils } from '../utils.js';

import { renderNuevaVentaForm, renderVentas } from './ventas.js';


export function renderDashboard(container) {
  // Clear the container
  container.innerHTML = `
    <div id="home-venta-container"></div>
    <div id="home-historial-container"></div>
  `;
  // Render the sales form inside the new container
  renderNuevaVentaForm(container.querySelector('#home-venta-container'));
  // Render el historial
  renderVentas(container.querySelector('#home-historial-container'));
}
