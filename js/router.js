// ============================================
// Tu Empresa - Router (Hash-based)
// ============================================

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
        const hash = window.location.hash.slice(1) || '/inicio';
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
