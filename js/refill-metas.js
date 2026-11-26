// ============================================
// Refill H2O - Metas Semanales (Lun-Sáb) y Bonos por Empleado
// Módulo exclusivo para cuentas Refill H2O (refillh2o@gmail.com / refillh2o.*)
// ============================================

export const REFILL_MASTER_EMAIL = 'refillh2o@gmail.com';
export const SUPABASE_RPC_URL = 'https://nxfilgwpguqlrjlfnnwt.supabase.co/rest/v1/rpc';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54ZmlsZ3dwZ3VxbHJqbGZubnd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMTU0NDQsImV4cCI6MjEwMzc5MTQ0NH0.ZSx3dudM_cmqJL5qkpOtfJBTSQhIdd4GShkZp2t3n_s';

const REFILL_METAS_LS_KEY = 'refillh2o_metas_cache';
const METAS_FETCH_COOLDOWN_MS = 90000;
let ultimaDescargaMetasTs = 0;

export function esCuentaRefillH2O(email) {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  return clean === 'refillh2o@gmail.com' || clean.startsWith('refillh2o.');
}

export function getEmailLicenciaActiva() {
  try {
    if (typeof localStorage === 'undefined') return '';
    const raw = localStorage.getItem('licencia_usuario');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.email) return String(parsed.email).trim().toLowerCase();
    }
    const fallback = localStorage.getItem('user_email');
    return fallback ? String(fallback).trim().toLowerCase() : '';
  } catch (_) {
    return '';
  }
}

export function getDefaultMetasRefillConfig() {
  return {
    actualizadoEn: '',
    whatsappPagos: '',
    nombreResponsablePagos: 'Responsable de Pagos',
    sedes: [
      {
        id: 'lcf',
        nombre: 'La California Sur',
        email: 'refillh2o.lcf@gmail.com',
        activa: true,
        metas: [
          { nivel: 1, montoUSD: 1000, bonoUSD: 10 },
          { nivel: 2, montoUSD: 1500, bonoUSD: 20 },
          { nivel: 3, montoUSD: 2000, bonoUSD: 30 },
          { nivel: 4, montoUSD: 2500, bonoUSD: 40 }
        ],
        empleados: []
      },
      {
        id: 'ldc',
        nombre: 'Los Dos Caminos',
        email: 'refillh2o.ldc@gmail.com',
        activa: true,
        metas: [
          { nivel: 1, montoUSD: 1000, bonoUSD: 10 },
          { nivel: 2, montoUSD: 1500, bonoUSD: 20 },
          { nivel: 3, montoUSD: 2000, bonoUSD: 30 },
          { nivel: 4, montoUSD: 2500, bonoUSD: 40 }
        ],
        empleados: []
      },
      {
        id: 'se',
        nombre: 'Santa Eduvigis',
        email: 'refillh2o.se@gmail.com',
        activa: true,
        metas: [
          { nivel: 1, montoUSD: 2500, bonoUSD: 10 },
          { nivel: 2, montoUSD: 3000, bonoUSD: 20 },
          { nivel: 3, montoUSD: 3500, bonoUSD: 30 },
          { nivel: 4, montoUSD: 4000, bonoUSD: 40 }
        ],
        empleados: []
      },
      {
        id: 'sp',
        nombre: 'Santa Paula',
        email: 'refillh2o.sp@gmail.com',
        activa: true,
        metas: [
          { nivel: 1, montoUSD: 2500, bonoUSD: 10 },
          { nivel: 2, montoUSD: 3000, bonoUSD: 20 },
          { nivel: 3, montoUSD: 3500, bonoUSD: 30 },
          { nivel: 4, montoUSD: 4000, bonoUSD: 40 }
        ],
        empleados: []
      },
      {
        id: 'sr',
        nombre: 'Santa Rosa',
        email: 'refillh2o.sr@gmail.com',
        activa: true,
        metas: [
          { nivel: 1, montoUSD: 1500, bonoUSD: 10 },
          { nivel: 2, montoUSD: 2000, bonoUSD: 20 },
          { nivel: 3, montoUSD: 2500, bonoUSD: 30 },
          { nivel: 4, montoUSD: 3000, bonoUSD: 40 }
        ],
        empleados: []
      },
      {
        id: 'sf',
        nombre: 'Santa Fe',
        email: 'refillh2o.sf@gmail.com',
        activa: true,
        metas: [
          { nivel: 1, montoUSD: 1500, bonoUSD: 10 },
          { nivel: 2, montoUSD: 2000, bonoUSD: 20 },
          { nivel: 3, montoUSD: 2500, bonoUSD: 30 },
          { nivel: 4, montoUSD: 3000, bonoUSD: 40 }
        ],
        empleados: []
      },
      {
        id: 'ls',
        nombre: 'Los Samanes',
        email: '',
        activa: false,
        metas: [
          { nivel: 1, montoUSD: 400, bonoUSD: 10 },
          { nivel: 2, montoUSD: 600, bonoUSD: 20 },
          { nivel: 3, montoUSD: 800, bonoUSD: 30 }
        ],
        empleados: []
      },
      {
        id: 'lt',
        nombre: 'La Trinidad',
        email: '',
        activa: false,
        metas: [
          { nivel: 1, montoUSD: 1500, bonoUSD: 10 },
          { nivel: 2, montoUSD: 2000, bonoUSD: 20 },
          { nivel: 3, montoUSD: 2500, bonoUSD: 30 },
          { nivel: 4, montoUSD: 3000, bonoUSD: 40 }
        ],
        empleados: []
      }
    ]
  };
}

export function normalizarMetasRefillConfig(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sedes) || raw.sedes.length === 0) {
    return getDefaultMetasRefillConfig();
  }

  const sedes = raw.sedes.map((s, idx) => {
    const metasOrdenadas = (Array.isArray(s.metas) ? s.metas : [])
      .map(m => ({
        montoUSD: Math.max(0, parseFloat(m?.montoUSD) || 0),
        bonoUSD: Math.max(0, parseFloat(m?.bonoUSD) || 0)
      }))
      .filter(m => m.montoUSD > 0)
      .sort((a, b) => a.montoUSD - b.montoUSD)
      .map((m, i) => ({ nivel: i + 1, montoUSD: m.montoUSD, bonoUSD: m.bonoUSD }));

    const empleados = (Array.isArray(s.empleados) ? s.empleados : [])
      .filter(e => e && String(e.nombre || '').trim().length > 0)
      .map((e, i) => ({
        id: e.id || `emp_${idx}_${i}`,
        nombre: String(e.nombre).trim(),
        cargo: String(e.cargo || '').trim(),
        activo: e.activo !== false
      }));

    return {
      id: s.id || `sede_${idx}_${Date.now()}`,
      nombre: String(s.nombre || 'Sede').trim(),
      email: String(s.email || '').trim().toLowerCase(),
      activa: s.activa !== false,
      metas: metasOrdenadas,
      empleados
    };
  });

  return {
    actualizadoEn: raw.actualizadoEn || '',
    whatsappPagos: String(raw.whatsappPagos || '').trim(),
    nombreResponsablePagos: String(raw.nombreResponsablePagos || 'Responsable de Pagos').trim() || 'Responsable de Pagos',
    sedes
  };
}

function formatLocalDateISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDDMM(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function getRangoSemanaLunSab(fechaRefISO = null, offsetSemanas = 0) {
  let baseDate;
  if (fechaRefISO && /^\d{4}-\d{2}-\d{2}/.test(String(fechaRefISO))) {
    const [y, m, d] = String(fechaRefISO).slice(0, 10).split('-').map(Number);
    baseDate = new Date(y, m - 1, d);
  } else {
    const now = new Date();
    baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const dow = baseDate.getDay(); // 0=Dom, 1=Lun..6=Sab
  const diffToMonday = dow === 0 ? -6 : (1 - dow);
  const lunesDate = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + diffToMonday + (offsetSemanas * 7)
  );
  const sabadoDate = new Date(lunesDate.getFullYear(), lunesDate.getMonth(), lunesDate.getDate() + 5);
  const finDate = new Date(sabadoDate.getFullYear(), sabadoDate.getMonth(), sabadoDate.getDate(), 23, 59, 59, 999);

  const nombresDias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dias = nombresDias.map((label, idx) => {
    const dt = new Date(lunesDate.getFullYear(), lunesDate.getMonth(), lunesDate.getDate() + idx);
    return {
      iso: formatLocalDateISO(dt),
      label,
      shortDate: formatShortDDMM(dt)
    };
  });

  const lunesISO = dias[0].iso;
  const sabadoISO = dias[5].iso;
  const diaActualIdx = offsetSemanas !== 0 ? 6 : (dow === 0 ? 6 : dow);

  return {
    lunesISO,
    sabadoISO,
    inicioDate: lunesDate,
    finDate,
    dias,
    diaActualIdx,
    esDomingo: dow === 0 && offsetSemanas === 0,
    etiquetaRango: `Lun ${dias[0].shortDate} – Sáb ${dias[5].shortDate}`
  };
}

function toLocalDateISO(dateValue) {
  if (!dateValue) return '';
  const str = String(dateValue).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  return formatLocalDateISO(d);
}

export function calcularVentaRealSemana(ventas = [], abonos = [], rangoSemana) {
  const porDia = {};
  (rangoSemana?.dias || []).forEach(d => {
    porDia[d.iso] = 0;
  });

  if (!rangoSemana || !rangoSemana.lunesISO || !rangoSemana.sabadoISO) {
    return { totalUSD: 0, porDia, cantidadVentas: 0 };
  }

  let totalUSD = 0;
  let cantidadVentas = 0;

  (Array.isArray(ventas) ? ventas : []).forEach(v => {
    if (!v) return;
    const dayISO = toLocalDateISO(v.fecha);
    if (!dayISO || dayISO < rangoSemana.lunesISO || dayISO > rangoSemana.sabadoISO) return;
    if (['credito', 'convenio', 'garantia', 'cortesia'].includes(v.tipo)) return;

    let montoVenta = 0;
    if (Array.isArray(v.pagos) && v.pagos.length > 0) {
      v.pagos.forEach(p => {
        if (!p || p.metodo === 'saldo_favor') return;
        const val = parseFloat(p.montoUSD !== undefined ? p.montoUSD : p.monto);
        if (!isNaN(val) && val > 0) montoVenta += val;
      });
    } else if (v.metodoPago !== 'saldo_favor') {
      const val = parseFloat(v.total);
      if (!isNaN(val) && val > 0) montoVenta = val;
    }

    if (montoVenta > 0) {
      totalUSD += montoVenta;
      porDia[dayISO] = (porDia[dayISO] || 0) + montoVenta;
      cantidadVentas += 1;
    }
  });

  (Array.isArray(abonos) ? abonos : []).forEach(a => {
    if (!a) return;
    if (a.esExcedenteVenta || a.referencia === 'Excedente de venta') return;
    const dayISO = toLocalDateISO(a.fecha);
    if (!dayISO || dayISO < rangoSemana.lunesISO || dayISO > rangoSemana.sabadoISO) return;
    const val = parseFloat(a.monto);
    if (!isNaN(val) && val > 0) {
      totalUSD += val;
      porDia[dayISO] = (porDia[dayISO] || 0) + val;
    }
  });

  Object.keys(porDia).forEach(k => {
    porDia[k] = Math.round(porDia[k] * 100) / 100;
  });

  return {
    totalUSD: Math.round(totalUSD * 100) / 100,
    porDia,
    cantidadVentas
  };
}

export function evaluarProgresoMetasSede(sedeConfig, totalSemanalUSD = 0) {
  const venta = Math.max(0, parseFloat(totalSemanalUSD) || 0);
  const metas = [...(sedeConfig?.metas || [])]
    .filter(m => m && (parseFloat(m.montoUSD) || 0) > 0)
    .sort((a, b) => a.montoUSD - b.montoUSD)
    .map((m, i) => ({
      nivel: m.nivel || (i + 1),
      montoUSD: parseFloat(m.montoUSD) || 0,
      bonoUSD: parseFloat(m.bonoUSD) || 0
    }));

  let metaAlcanzada = null;
  let proximaMeta = null;

  for (const m of metas) {
    if (venta >= m.montoUSD) {
      metaAlcanzada = m;
    } else if (!proximaMeta) {
      proximaMeta = m;
    }
  }

  const metaMaximaUSD = metas.length > 0 ? metas[metas.length - 1].montoUSD : 1;
  const progresoPctGlobal = metaMaximaUSD > 0
    ? Math.min(100, Math.max(0, Math.round((venta / metaMaximaUSD) * 1000) / 10))
    : 0;
  const faltanteProximaUSD = proximaMeta ? Math.max(0, Math.round((proximaMeta.montoUSD - venta) * 100) / 100) : 0;
  const bonoPorEmpleadoUSD = metaAlcanzada ? metaAlcanzada.bonoUSD : 0;
  const empleadosActivos = (sedeConfig?.empleados || []).filter(e => e && e.activo !== false && String(e.nombre || '').trim());
  const totalBonoSedeUSD = Math.round((empleadosActivos.length * bonoPorEmpleadoUSD) * 100) / 100;

  const hitos = metas.map(m => ({
    ...m,
    alcanzada: venta >= m.montoUSD,
    pctPos: metaMaximaUSD > 0 ? Math.min(100, Math.max(0, (m.montoUSD / metaMaximaUSD) * 100)) : 0
  }));

  return {
    totalSemanalUSD: Math.round(venta * 100) / 100,
    metaAlcanzada,
    proximaMeta,
    metaMaximaUSD,
    progresoPctGlobal,
    faltanteProximaUSD,
    bonoPorEmpleadoUSD,
    empleadosActivos,
    totalBonoSedeUSD,
    hitos
  };
}

export function getMetasRefillConfigLocal(storeInstance = null) {
  try {
    if (storeInstance && typeof storeInstance.getConfig === 'function') {
      const fromStore = storeInstance.getConfig('metasRefillH2O', null);
      if (fromStore && Array.isArray(fromStore.sedes) && fromStore.sedes.length > 0) {
        return normalizarMetasRefillConfig(fromStore);
      }
    }
  } catch (_) {}

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(REFILL_METAS_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sedes) && parsed.sedes.length > 0) {
          return normalizarMetasRefillConfig(parsed);
        }
      }
    }
  } catch (_) {}

  return getDefaultMetasRefillConfig();
}

export function setMetasRefillConfigLocal(storeInstance, config) {
  const norm = normalizarMetasRefillConfig(config);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REFILL_METAS_LS_KEY, JSON.stringify(norm));
    }
  } catch (_) {}
  try {
    if (storeInstance && typeof storeInstance.setConfig === 'function') {
      storeInstance.setConfig('metasRefillH2O', norm);
    }
  } catch (_) {}
  return norm;
}

export async function cargarMetasRefillDesdeNube(storeInstance = null, force = false) {
  const ahora = Date.now();
  if (!force && ultimaDescargaMetasTs > 0 && (ahora - ultimaDescargaMetasTs) < METAS_FETCH_COOLDOWN_MS) {
    return getMetasRefillConfigLocal(storeInstance);
  }

  try {
    const email = getEmailLicenciaActiva();
    const deviceId = (typeof localStorage !== 'undefined' ? localStorage.getItem('waterapp_device_uuid') : '') || '';
    if (!email || !deviceId) return getMetasRefillConfigLocal(storeInstance);

    const res = await fetch(`${SUPABASE_RPC_URL}/rpc_pos_get_refill_metas`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_email: email,
        p_device_id: deviceId
      })
    });
    if (!res.ok) return getMetasRefillConfigLocal(storeInstance);
    const data = await res.json();
    ultimaDescargaMetasTs = ahora;

    if (data && data.ok && data.metas) {
      return setMetasRefillConfigLocal(storeInstance, data.metas);
    }
  } catch (e) {
    console.warn('[RefillMetas] No se pudo consultar configuración remota:', e);
  }

  return getMetasRefillConfigLocal(storeInstance);
}

export async function guardarMetasRefillEnNube(config, storeInstance = null) {
  const normalized = normalizarMetasRefillConfig({
    ...config,
    actualizadoEn: new Date().toISOString()
  });

  setMetasRefillConfigLocal(storeInstance, normalized);
  ultimaDescargaMetasTs = Date.now();

  try {
    const email = getEmailLicenciaActiva();
    const deviceId = (typeof localStorage !== 'undefined' ? localStorage.getItem('waterapp_device_uuid') : '') || '';
    if (!email || !deviceId) {
      return { ok: false, config: normalized, error: 'Licencia o dispositivo no identificado.' };
    }

    const res = await fetch(`${SUPABASE_RPC_URL}/rpc_pos_save_refill_metas`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_email: email,
        p_device_id: deviceId,
        p_metas: normalized
      })
    });

    if (!res.ok) {
      return { ok: false, config: normalized, error: `RPC HTTP ${res.status}` };
    }
    const data = await res.json();
    if (!data || !data.ok) {
      return { ok: false, config: normalized, error: data?.error || 'Error guardando metas en Supabase' };
    }

    return { ok: true, config: normalized };
  } catch (e) {
    console.warn('[RefillMetas] Error guardando metas en Supabase:', e);
    return { ok: false, config: normalized, error: e.message || 'Error de conexión' };
  }
}
