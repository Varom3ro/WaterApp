// ============================================
// Tu Empresa - App Entry Point
// ============================================

import { router } from './router.js';
import { store } from './store.js';
import { renderSidebar } from './components/sidebar.js';
import { renderHeader } from './components/header.js';
import { Licencia } from './licencia.js';

// Import modules
import { renderDashboard } from './modules/dashboard.js';
import { renderClientes } from './modules/clientes.js';
import { renderVentas } from './modules/ventas.js';
import { renderInventario } from './modules/inventario.js';
import { renderReportes } from './modules/reportes.js';
import { renderConfiguracion } from './modules/configuracion.js';

class App {
    constructor() {
        this.init();
    }

    async init() {
        // Validar licencia de prueba antes de cualquier otra cosa
        const licenciaValida = await Licencia.validar();
        if (!licenciaValida) return;

        if (!sessionStorage.getItem('isAuthenticated')) {
            this.renderLogin();
            return;
        }

        await store.init();
        this.renderLayout();
        this.registerRoutes();

        // Start router
        router.init('app-content');

        // Update active state on route change
        window.addEventListener('hashchange', () => this.updateActiveLink());
        this.updateActiveLink();
    }

    renderLogin() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="login-container" style="display:flex; flex-direction:column; align-items:center; justify-content:flex-start; min-height:100vh; background:var(--color-bg); padding-top: 8vh; padding-bottom: 2rem; overflow-y: auto; box-sizing: border-box;">
                <div class="card" style="width: 100%; max-width: 400px; text-align: center; padding: 2rem; margin: 1rem;">
                    <img src="./img/logo.png" alt="Tu Empresa Logo" style="width: 80px; height: 80px; margin: 0 auto 1.5rem; object-fit: contain;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%231B4332%22 stroke-width=%222%22><path d=%22M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z%22/></svg>'">
                    <h1 style="color:var(--color-primary-900); font-size:1.8rem; margin-bottom:0.5rem; font-weight: bold;">Tu Empresa</h1>
                    <p style="color:var(--color-text-muted); margin-bottom: 2rem; font-size: 0.9rem;">Sistema de Gestión de Agua Potable</p>
                    
                    <div class="form-group" style="text-align: left;">
                        <label class="form-label">Contraseña de Acceso</label>
                        <div style="position: relative;">
                            <input type="password" id="login-password" class="form-control" style="padding-right: 45px;" placeholder="Ingrese la contraseña" onkeydown="if(event.key === 'Enter') document.getElementById('btn-login').click()">
                            <button type="button" id="toggle-password" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--color-text-muted); cursor: pointer; padding: 5px; display: flex; align-items: center; justify-content: center;">
                                <svg id="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <p id="login-error" style="color: var(--color-danger); font-size: 0.85rem; display: none; margin-bottom: 1rem; text-align: left;">Contraseña incorrecta</p>
                    
                    <button id="btn-login" class="btn btn-primary" style="width:100%; margin-top: 1rem;">Ingresar al Sistema</button>
                </div>
            </div>
        `;

        document.getElementById('toggle-password').addEventListener('click', () => {
            const input = document.getElementById('login-password');
            const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
            input.setAttribute('type', type);

            const icon = document.getElementById('eye-icon');
            if (type === 'text') {
                icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
            } else {
                icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
            }
        });

        document.getElementById('btn-login').addEventListener('click', () => {
            const pwd = document.getElementById('login-password').value;
            if (pwd === 'admins') {
                sessionStorage.setItem('isAuthenticated', 'true');
                this.init();
            } else {
                document.getElementById('login-error').style.display = 'block';
                document.getElementById('login-password').value = '';
                document.getElementById('login-password').focus();
            }
        });

        // Focus the input when rendered
        setTimeout(() => {
            const input = document.getElementById('login-password');
            if (input) input.focus();
        }, 100);
    }

    updateActiveLink() {
        const hash = window.location.hash || '#/inicio';
        const currentRoute = hash.replace('#', '');

        document.querySelectorAll('.sidebar-nav-item').forEach(item => {
            if (item.getAttribute('data-route') === currentRoute) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    renderLayout() {
        const app = document.getElementById('app');
        app.innerHTML = `
          <div class="app-layout">
            ${renderSidebar()}
            <main class="main-content" id="app-content" style="flex:1; overflow-y:auto; padding:var(--space-xl); height:100vh;">
            </main>
          </div>
        `;
        this.attachEvents();
    }

    attachEvents() {
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.style.cursor = 'pointer';
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                sessionStorage.removeItem('isAuthenticated');
                if (window.Android && typeof Android.closeApp === 'function') {
                    window.Android.closeApp();
                } else {
                    window.location.reload();
                }
            });
        }
    }

    registerRoutes() {
        router.register('/inicio', renderDashboard);
        router.register('/clientes', renderClientes);
        router.register('/ventas', renderVentas);
        router.register('/inventario', renderInventario);
        router.register('/reportes', renderReportes);
        router.register('/configuracion', renderConfiguracion);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
