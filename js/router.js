// ============================================
// Tu Empresa - Router (Hash-based)
// ============================================

import { store } from './store.js';

class Router {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
        this.container = null;
        window.addEventListener('hashchange', () => this._handleRoute());
    }

    init(containerId) {
        this.container = document.getElementById(containerId);
        this._handleRoute();
    }

    register(path, handler) {
        this.routes[path] = handler;
    }

    navigate(path) {
        window.location.hash = path;
    }

    _handleRoute() {
        let hash = window.location.hash.slice(1) || '/inicio';

        // Proteger rutas administrativas contra rol operario
        if (store.isOperario() && ['/reportes', '/configuracion'].includes(hash)) {
            hash = '/inicio';
            if (window.location.hash !== '#/inicio') {
                window.location.hash = '#/inicio';
                return;
            }
        }

        const route = this.routes[hash];

        if (route && this.container) {
            this.currentRoute = hash;
            this.container.innerHTML = '';
            route(this.container);
        } else if (this.container) {
            this.navigate('/inicio');
        }
    }

    getCurrentRoute() {
        return this.currentRoute;
    }
}

export const router = new Router();
