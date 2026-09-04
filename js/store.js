// ============================================
// Tu Empresa - Store (Capa de Datos Local)
// Usa IndexedDB con cache-en-memoria (Síncrono/Flush)
// Soporta tanto ejecuciones Web independientes como integración Android WebView
// ============================================

import { Utils } from './utils.js';

const DB_NAME = 'TuEmpresaDB';
const DB_VERSION = 3;
const COLLECTIONS = ['clientes', 'ventas', 'abonos', 'configuracion', 'cisternas', 'mermas', 'propinas'];

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
            if (!this.db || !this.db.objectStoreNames.contains(storeName)) {
                return resolve([]);
            }
            try {
                const tx = this.db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            } catch (e) {
                resolve([]);
            }
        });
    }

    _putDB(storeName, item) {
        if (!this.db || !this.db.objectStoreNames.contains(storeName)) return Promise.resolve(true);
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).put(item);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
        });
    }

    _deleteDB(storeName, id) {
        if (!this.db || !this.db.objectStoreNames.contains(storeName)) return Promise.resolve(true);
        return new Promise((resolve) => {
            try {
                const tx = this.db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).delete(id);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (e) {
                resolve(false);
            }
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
        this._triggerCloudSync(collection);
        return item;
    }

    update(collection, id, updates) {
        const arr = this.cache[collection];
        const idx = arr.findIndex(item => item.id === id);
        if (idx === -1) return null;
        arr[idx] = { ...arr[idx], ...updates, updatedAt: new Date().toISOString() };
        this._putDB(collection, arr[idx]);
        this._autoBackup();
        this._triggerCloudSync(collection);
        return arr[idx];
    }

    delete(collection, id) {
        const arr = this.cache[collection];
        const initialLen = arr.length;
        this.cache[collection] = arr.filter(item => item.id !== id);
        if (this.cache[collection].length < initialLen) {
            this._deleteDB(collection, id);
            this._autoBackup();
            this._triggerCloudSync(collection);
        }
        return this.cache[collection].length < initialLen;
    }

    _triggerCloudSync(collection) {
        if (['ventas', 'cisternas', 'mermas', 'configuracion', 'abonos'].includes(collection)) {
            if (typeof window !== 'undefined' && typeof window.syncToCloud === 'function') {
                try {
                    window.syncToCloud();
                } catch (e) {
                    console.warn('[Store] Auto CloudSync error:', e);
                }
            }
        }
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

    // ---- Zonas y Ubicaciones de Clientes ----

    getZonasPresets() {
        return {
            oeste: {
                nombre: 'Caracas Oeste (El Paraíso / Libertador)',
                municipios: ['Libertador', 'Chacao', 'Baruta', 'Sucre', 'El Hatillo'],
                urbanizaciones: [
                    'El Paraíso',
                    'Montalbán',
                    'Vista Alegre',
                    'La Quebradita',
                    'Bella Vista',
                    'San Martín',
                    'Juan Pablo II'
                ]
            },
            este: {
                nombre: 'Caracas Este (La California / Sucre / Chacao)',
                municipios: ['Sucre', 'Chacao', 'Baruta', 'Libertador', 'El Hatillo'],
                urbanizaciones: [
                    'La California Sur',
                    'La California Norte',
                    'Macaracuay',
                    'Los Ruices',
                    'Los Cortijos',
                    'El Llanito',
                    'La Urbina',
                    'Boleíta Sur',
                    'Boleíta Norte',
                    'Montecristo',
                    'Campo Claro',
                    'Los Dos Caminos',
                    'Palo Verde',
                    'Petare',
                    'Terrazas del Ávila',
                    'Lomas del Ávila',
                    'Santa Cecilia',
                    'Sebucán',
                    'Chacao',
                    'Los Palos Grandes',
                    'Altamira'
                ]
            }
        };
    }

    getZonasMunicipios() {
        const conf = this.getConfig('zonasMunicipios');
        if (Array.isArray(conf) && conf.length > 0) {
            return conf;
        }
        return ['Libertador', 'Chacao', 'Baruta', 'Sucre', 'El Hatillo'];
    }

    getZonasUrbanizaciones() {
        const conf = this.getConfig('zonasUrbanizaciones');
        if (Array.isArray(conf) && conf.length > 0) {
            return conf;
        }
        return [
            'El Paraíso',
            'Montalbán',
            'Vista Alegre',
            'La Quebradita',
            'Bella Vista',
            'San Martín',
            'Juan Pablo II'
        ];
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

        const saldo = this.getSaldoNetoCliente(clienteId);

        if (saldo < 0) return 'con_abono';
        if (saldo === 0) return 'al_dia';

        const limMonto = cliente.limiteMonto || Infinity;
        const limDias = cliente.limiteDias || Infinity;
        const limConsumo = cliente.limiteConsumo || Infinity;

        const ventasCredito = this.getAll('ventas').filter(v => v.clienteId === clienteId && v.tipo === 'credito');
        const abonos = this.getAll('abonos').filter(a => a.clienteId === clienteId);

        const ultimaVentaCredito = ventasCredito.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const ultimoAbono = abonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
        const ultimaFecha = ultimoAbono ? ultimoAbono.fecha : (ultimaVentaCredito ? ultimaVentaCredito.fecha : null);
        const diasSinAbono = ultimaFecha ? Math.floor((Date.now() - new Date(ultimaFecha)) / (1000 * 60 * 60 * 24)) : 0;

        const botellonesCredito = ventasCredito.reduce((sum, v) => sum + v.botellones, 0);

        if (saldo > limMonto || diasSinAbono > limDias || botellonesCredito > limConsumo) {
            return 'moroso';
        }
        return 'debe';
    }

    getDeudaCliente(clienteId) {
        const saldo = this.getSaldoNetoCliente(clienteId);
        return Math.max(0, saldo);
    }

    getSaldoNetoCliente(clienteId) {
        const ventas = this.getAll('ventas').filter(v => v.clienteId === clienteId);
        const abonos = this.getAll('abonos').filter(a => a.clienteId === clienteId);
        
        let totalDeuda = 0;
        for (const v of ventas) {
            if (v.tipo === 'credito') {
                totalDeuda += (v.total || 0);
            } else if (v.pagos && Array.isArray(v.pagos)) {
                for (const p of v.pagos) {
                    if (p.metodo === 'saldo_favor') {
                        totalDeuda += (parseFloat(p.monto) || 0);
                    }
                }
            }
        }
        const totalAbonos = abonos.reduce((sum, a) => sum + (parseFloat(a.monto) || 0), 0);
        return totalDeuda - totalAbonos;
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

    // ---- Métodos de Pago Personalizados ----

    getMetodosPago(onlyActivos = false) {
        const baseMethods = (Utils && Utils.paymentMethods) ? Utils.paymentMethods : [
            { id: 'efectivo_usd', label: 'Efectivo (USD)', icon: '💵', moneda: 'USD', color: '#2D6A4F', isCustom: false },
            { id: 'efectivo_bs', label: 'Efectivo (Bs)', icon: '💴', moneda: 'Bs', color: '#40916C', isCustom: false },
            { id: 'punto', label: 'Punto de Venta', icon: '💳', moneda: 'Bs', color: '#52B788', isCustom: false },
            { id: 'pago_movil', label: 'Pago Móvil', icon: '📱', moneda: 'Bs', color: '#74C69D', isCustom: false },
            { id: 'transferencia', label: 'Transferencia', icon: '🏦', moneda: 'Bs', color: '#95D5B2', isCustom: false }
        ];

        const customMethods = this.getConfig('metodosPagoPersonalizados') || [];
        const allMethods = [...baseMethods, ...customMethods];

        if (onlyActivos) {
            return allMethods.filter(m => m.activo !== false);
        }
        return allMethods;
    }

    saveMetodoPago(data) {
        const customMethods = this.getConfig('metodosPagoPersonalizados') || [];
        const isEditing = data.id && customMethods.some(m => m.id === data.id);

        if (isEditing) {
            const updated = customMethods.map(m => {
                if (m.id === data.id) {
                    return {
                        ...m,
                        label: data.label.trim(),
                        icon: data.icon || '💳',
                        moneda: data.moneda || 'Bs',
                        activo: data.activo !== undefined ? data.activo : true,
                        updatedAt: new Date().toISOString()
                    };
                }
                return m;
            });
            this.setConfig('metodosPagoPersonalizados', updated);
            return updated.find(m => m.id === data.id);
        } else {
            const newMethod = {
                id: 'custom_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
                label: data.label.trim(),
                icon: data.icon || '💳',
                moneda: data.moneda || 'Bs',
                color: data.moneda === 'USD' ? '#2D6A4F' : '#3B82F6',
                activo: true,
                isCustom: true,
                createdAt: new Date().toISOString()
            };
            customMethods.push(newMethod);
            this.setConfig('metodosPagoPersonalizados', customMethods);
            return newMethod;
        }
    }

    deleteMetodoPago(id) {
        const customMethods = this.getConfig('metodosPagoPersonalizados') || [];
        const filtered = customMethods.filter(m => m.id !== id);
        this.setConfig('metodosPagoPersonalizados', filtered);
        return true;
    }

    // ---- Cierre de Caja y Arqueo ----

    getCierreCaja(fecha) {
        const day = new Date(fecha + 'T00:00:00');
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

        const allMethods = this.getMetodosPago(false);

        const cierre = {
            credito: 0, total: 0, botellones: 0, cantidadVentas: ventas.length,
            cobros_credito: 0, // Suma de todos los abonos cobrados hoy
            real_ingresado: 0, // Dinero real que entró (Ventas Contado + Cobros de Crédito)
            bs: { credito: 0, total: 0, cobros_credito: 0, real_ingresado: 0 }
        };

        // Inicializar claves para todos los métodos de pago
        allMethods.forEach(m => {
            cierre[m.id] = 0;
            cierre.bs[m.id] = 0;
        });

        const currentTasa = this.getConfig('tasaCambio') || 40.00;

        // Procesar ventas del día
        for (const v of ventas) {
            cierre.botellones += (v.botellones || 0);
            cierre.total += (v.total || 0);
            
            const tasa = v.tasa || currentTasa;
            cierre.bs.total += (v.total || 0) * tasa;

            if (v.tipo === 'credito') {
                cierre.credito += (v.total || 0);
                cierre.bs.credito += (v.total || 0) * tasa;
            } else if (v.pagos && Array.isArray(v.pagos)) {
                for (const p of v.pagos) {
                    const mId = p.metodo;
                    const monto = parseFloat(p.monto) || 0;
                    if (cierre[mId] === undefined) {
                        cierre[mId] = 0;
                        cierre.bs[mId] = 0;
                    }
                    cierre[mId] += monto;
                    cierre.bs[mId] += monto * tasa;

                    if (mId !== 'saldo_favor') {
                        cierre.real_ingresado += monto;
                        cierre.bs.real_ingresado += monto * tasa;
                    }
                }
            } else if (v.metodoPago) {
                const mId = v.metodoPago;
                const monto = parseFloat(v.total) || 0;
                if (cierre[mId] === undefined) {
                    cierre[mId] = 0;
                    cierre.bs[mId] = 0;
                }
                cierre[mId] += monto;
                cierre.bs[mId] += monto * tasa;

                if (mId !== 'saldo_favor') {
                    cierre.real_ingresado += monto;
                    cierre.bs.real_ingresado += monto * tasa;
                }
            }
        }

        // Procesar cobros de créditos (abonos) realizados hoy
        for (const a of abonos) {
            const monto = parseFloat(a.monto) || 0;
            cierre.cobros_credito += monto;
            cierre.real_ingresado += monto;
            
            const tasa = a.tasa || currentTasa;
            cierre.bs.cobros_credito += monto * tasa;
            cierre.bs.real_ingresado += monto * tasa;

            const mId = a.metodo;
            if (cierre[mId] === undefined) {
                cierre[mId] = 0;
                cierre.bs[mId] = 0;
            }
            cierre[mId] += monto;
            cierre.bs[mId] += monto * tasa;
        }

        // Procesar propinas digitales / bancarias recibidas hoy (Punto de venta, Pago móvil, etc.)
        const propinas = this.getAll('propinas').filter(p => {
            const d = new Date(p.fecha);
            return d >= day && d < nextDay;
        });

        let totalPropinasUSD = 0;
        let totalPropinasBs = 0;
        for (const prop of propinas) {
            const tasa = prop.tasa || currentTasa;
            let montoUSD = 0;
            let montoBs = 0;

            if (prop.moneda === 'Bs' || prop.moneda === 'VES') {
                montoBs = parseFloat(prop.monto) || 0;
                montoUSD = tasa > 0 ? montoBs / tasa : 0;
            } else {
                montoUSD = parseFloat(prop.monto) || 0;
                montoBs = montoUSD * tasa;
            }

            totalPropinasUSD += montoUSD;
            totalPropinasBs += montoBs;

            const mId = prop.metodo || 'punto';
            if (cierre[mId] === undefined) {
                cierre[mId] = 0;
                cierre.bs[mId] = 0;
            }
            cierre[mId] += montoUSD;
            cierre.bs[mId] += montoBs;

            cierre.real_ingresado += montoUSD;
            cierre.bs.real_ingresado += montoBs;
        }

        cierre.ventasDetalle = ventas;
        cierre.abonosDetalle = abonos;
        cierre.propinasDetalle = propinas;
        cierre.totalPropinasUSD = totalPropinasUSD;
        cierre.totalPropinasBs = totalPropinasBs;

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

    // ---- Caudalímetro / Reloj Medidor de Agua ----

    getLecturaCaudalimetro(fecha) {
        const key = `caudalimetro_${fecha}`;
        return this.getConfig(key) || {
            fecha,
            inicial: null,
            final: null,
            litrosReloj: 0,
            horaInicial: null,
            horaFinal: null
        };
    }

    saveLecturaCaudalimetro(fecha, data) {
        const key = `caudalimetro_${fecha}`;
        const current = this.getLecturaCaudalimetro(fecha);
        const inicial = data.inicial !== undefined && data.inicial !== null && data.inicial !== '' ? parseFloat(data.inicial) : current.inicial;
        const final = data.final !== undefined && data.final !== null && data.final !== '' ? parseFloat(data.final) : current.final;
        
        let litrosReloj = 0;
        if (inicial !== null && final !== null && !isNaN(inicial) && !isNaN(final)) {
            const factor = this.getConfig('unidadCaudalimetro') === 'm3' ? 1000 : 1;
            litrosReloj = Math.max(0, (final - inicial) * factor);
        }

        const updated = {
            fecha,
            inicial: (inicial !== null && !isNaN(inicial)) ? inicial : null,
            final: (final !== null && !isNaN(final)) ? final : null,
            litrosReloj,
            horaInicial: data.horaInicial || current.horaInicial || (inicial !== null ? new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : null),
            horaFinal: data.horaFinal || current.horaFinal || (final !== null ? new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : null),
            updatedAt: new Date().toISOString()
        };

        this.setConfig(key, updated);
        return updated;
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
        if (this.getConfig('moduloCaudalimetro') === undefined) {
            this.setConfig('moduloCaudalimetro', false);
        }
        if (this.getConfig('unidadCaudalimetro') === undefined) {
            this.setConfig('unidadCaudalimetro', 'L');
        }
    }
}

export const store = new Store();
