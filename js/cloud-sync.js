// ============================================
// WaterApp - Sincronización en la Nube (Cloud Sync)
// ============================================

import { store } from './store.js';
import { Utils } from './utils.js';

const SUPABASE_URL = 'https://nxfilgwpguqlrjlfnnwt.supabase.co/rest/v1/tienda_sync_cloud';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54ZmlsZ3dwZ3VxbHJqbGZubnd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMTU0NDQsImV4cCI6MjEwMzc5MTQ0NH0.ZSx3dudM_cmqJL5qkpOtfJBTSQhIdd4GShkZp2t3n_s';

export async function syncToCloud(isManual = false) {
  const licenciaLocal = localStorage.getItem('licencia_usuario');
  if (!licenciaLocal) return;

  try {
    const user = JSON.parse(licenciaLocal);
    const email = user.email;
    if (!email) return;

    const ventas = store.getAll('ventas') || [];
    const inventario = store.getInventarioActual();
    const tipos = store.getConfig('tiposBotellon') || [];
    const mermas = store.getAll('mermas') || [];
    const empresaNombre = store.getConfig('empresaNombre') || 'Tu Empresa';
    const tasa = parseFloat(store.getConfig('tasaCambio')) || 40.00;

    // Calcular ventas de hoy usando fecha local
    const now = new Date();
    const hoyLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dayStart = new Date(hoyLocalStr + 'T00:00:00');
    const dayEnd = new Date(hoyLocalStr + 'T23:59:59');

    const ventasHoy = ventas.filter(v => {
      if (!v.fecha) return false;
      const d = new Date(v.fecha);
      return d >= dayStart && d <= dayEnd;
    });

    let totalUSD = 0;
    let botellones = 0;
    let litros = 0;
    let efectivoUSD = 0;
    let efectivoBs = 0;
    let efectivoBsUSD = 0;
    let pagoMovil = 0;
    let pagoMovilBs = 0;
    let punto = 0;
    let puntoBs = 0;
    let transferencia = 0;
    let credito = 0;

    // Mapa dinámico de métodos de pago (estándar y personalizados)
    const allMetodosConfig = (typeof store.getMetodosPago === 'function')
      ? store.getMetodosPago(false)
      : [
          { id: 'efectivo_usd', label: 'Efectivo USD', icon: '💵', moneda: 'USD', color: 'var(--primary)' },
          { id: 'efectivo_bs', label: 'Efectivo Bs', icon: '💴', moneda: 'Bs', color: '#10B981' },
          { id: 'pago_movil', label: 'Pago Móvil', icon: '📱', moneda: 'Bs', color: '#8B5CF6' },
          { id: 'punto', label: 'Punto de Venta', icon: '💳', moneda: 'Bs', color: '#06B6D4' },
          { id: 'transferencia', label: 'Transferencia', icon: '🏦', moneda: 'Bs', color: 'var(--warning)' }
        ];

    const metodosMap = {};
    allMetodosConfig.forEach(m => {
      metodosMap[m.id] = {
        id: m.id,
        label: m.label,
        icon: m.icon || '💳',
        moneda: m.moneda || 'Bs',
        color: m.color || '#3B82F6',
        totalUSD: 0,
        totalBs: 0,
        cantidadVentas: 0
      };
    });

    ventasHoy.forEach(v => {
      const vTotal = parseFloat(v.total) || 0;
      totalUSD += vTotal;
      botellones += (parseInt(v.botellones) || 0);
      litros += (parseFloat(v.litrosTotales) || (parseInt(v.botellones) || 0) * 20 || 0);

      if (v.tipo === 'credito') {
        credito += vTotal;
      } else if (v.pagos && Array.isArray(v.pagos) && v.pagos.length > 0) {
        v.pagos.forEach(p => {
          const m = parseFloat(p.monto) || 0;
          const currentTasa = parseFloat(p.tasa) || tasa;
          let metId = p.metodo || 'efectivo_usd';
          if (metId === 'punto_venta') metId = 'punto';
          const montoBs = p.montoBs ? parseFloat(p.montoBs) : (m * currentTasa);

          if (!metodosMap[metId]) {
            metodosMap[metId] = {
              id: metId,
              label: p.metodoNombre || metId,
              icon: '💳',
              moneda: 'Bs',
              color: '#3B82F6',
              totalUSD: 0,
              totalBs: 0,
              cantidadVentas: 0
            };
          }

          metodosMap[metId].totalUSD += m;
          metodosMap[metId].totalBs += montoBs;
          metodosMap[metId].cantidadVentas += 1;

          if (metId === 'efectivo_usd') efectivoUSD += m;
          else if (metId === 'efectivo_bs') { efectivoBsUSD += m; efectivoBs += montoBs; }
          else if (metId === 'pago_movil') { pagoMovil += m; pagoMovilBs += montoBs; }
          else if (metId === 'punto') { punto += m; puntoBs += montoBs; }
          else if (metId === 'transferencia') { transferencia += m; }
        });
      } else {
        let metId = v.metodoPago || 'efectivo_usd';
        if (metId === 'punto_venta') metId = 'punto';
        const montoBs = vTotal * tasa;

        if (!metodosMap[metId]) {
          metodosMap[metId] = {
            id: metId,
            label: metId,
            icon: '💳',
            moneda: 'Bs',
            color: '#3B82F6',
            totalUSD: 0,
            totalBs: 0,
            cantidadVentas: 0
          };
        }

        metodosMap[metId].totalUSD += vTotal;
        metodosMap[metId].totalBs += montoBs;
        metodosMap[metId].cantidadVentas += 1;

        if (metId === 'efectivo_usd') efectivoUSD += vTotal;
        else if (metId === 'efectivo_bs') { efectivoBsUSD += vTotal; efectivoBs += montoBs; }
        else if (metId === 'pago_movil') { pagoMovil += vTotal; pagoMovilBs += montoBs; }
        else if (metId === 'punto') { punto += vTotal; puntoBs += montoBs; }
        else if (metId === 'transferencia') { transferencia += vTotal; }
      }
    });

    // Lista de métodos ordenada para el visor
    const desgloseMetodos = [];
    const processedIds = new Set();
    const ordenBase = ['efectivo_bs', 'efectivo_usd', 'pago_movil', 'punto', 'transferencia', 'credito'];

    metodosMap['credito'] = {
      id: 'credito',
      label: 'Crédito',
      icon: '📋',
      moneda: 'USD',
      color: '#F43F5E',
      totalUSD: credito,
      totalBs: credito * tasa,
      cantidadVentas: 0
    };
    
    ordenBase.forEach(id => {
      const item = metodosMap[id];
      if (item) {
        processedIds.add(id);
        desgloseMetodos.push(item);
      }
    });

    Object.values(metodosMap).forEach(item => {
      if (!processedIds.has(item.id)) {
        processedIds.add(item.id);
        desgloseMetodos.push(item);
      }
    });

    const totalBs = totalUSD * tasa;

    const clientes = store.getAll('clientes') || [];

    // 🛡️ ESCUDO PROTECTOR ANTI-SOBRESCRITURA:
    // Si este dispositivo tiene 0 ventas, 0 clientes y tanque en 0,
    // comprobar si la tienda ya tiene datos en la nube para NO borrar el respaldo ni el tanque con ceros.
    if (ventas.length === 0 && clientes.length === 0 && (!inventario.litros || inventario.litros === 0) && !isManual) {
      try {
        const checkRes = await fetch(`${SUPABASE_URL}?empresa_email=eq.${encodeURIComponent(email)}`, {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });
        if (checkRes.ok) {
          const cloudData = await checkRes.json();
          if (cloudData && cloudData.length > 0) {
            const remote = cloudData[0];
            const hasBackup = remote.respaldo_completo && (
              (remote.respaldo_completo.clientes && remote.respaldo_completo.clientes.length > 0) ||
              (remote.respaldo_completo.ventas && remote.respaldo_completo.ventas.length > 0)
            );
            const remoteTotalMes = remote.analisis_mes?.totalMesUSD || 0;
            const remoteLitros = remote.nivel_tanque?.litros || 0;
            const remoteMovs = remote.ultimos_movimientos?.length || 0;

            if (hasBackup || remoteTotalMes > 0 || remoteLitros > 0 || remoteMovs > 0) {
              console.log('[CloudSync] 🛡️ Dispositivo vacío detectado. Se protegen datos activos de la nube (respaldo, tanque, mes).');
              if (remoteLitros > 0 && inventario.litros === 0) {
                store.setConfig('inventario', remote.nivel_tanque);
              }
              return true;
            }
          }
        }
      } catch (checkErr) {
        console.warn('[CloudSync] Error al verificar datos remotos:', checkErr);
      }
    }

    // Mermas de hoy
    const mermasHoy = mermas.filter(m => {
      if (!m.fecha) return false;
      const d = new Date(m.fecha);
      return d >= dayStart && d <= dayEnd;
    });
    const litrosMermasHoy = mermasHoy.reduce((s, m) => s + (parseInt(m.litros) || 0), 0);

    // Últimos movimientos (ventas + mermas)
    // 🛡️ Ordenar cronológicamente ANTES de extraer para asegurar que siempre se tomen las ventas más recientes
    const ultimosMovs = [];
    const ventasCronologicas = [...ventas]
      .filter(v => v && v.fecha)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    ventasCronologicas.slice(0, 35).forEach(v => {
      let metodoLabel = '💵 Pagado';
      if (v.tipo === 'credito') metodoLabel = '📋 Crédito';
      else if (v.pagos && v.pagos[0]) {
        const m = v.pagos[0].metodo;
        const allM = store.getMetodosPago(false);
        const found = allM.find(item => item.id === m);
        if (found) {
          metodoLabel = `${found.icon || '💳'} ${found.label}`;
        } else if (m === 'pago_movil') metodoLabel = '📱 Pago Móvil';
        else if (m === 'punto_venta' || m === 'punto') metodoLabel = '💳 Punto Venta';
        else if (m === 'transferencia') metodoLabel = '🏦 Transferencia';
        else if (m === 'efectivo_usd') metodoLabel = '💵 Efectivo $';
      }

      const horaStr = (typeof Utils.formatTime === 'function')
        ? Utils.formatTime(v.fecha)
        : (v.fecha ? new Date(v.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '');

      ultimosMovs.push({
        hora: horaStr,
        fecha: v.fecha,
        tipo: 'Venta',
        icono: '💧',
        descripcion: `${v.botellones || 1} Botellón(es)`,
        monto: Utils.formatCurrency(v.total),
        metodo: metodoLabel,
        cliente: v.clienteNombre || 'Cliente Mostrador'
      });
    });

    const mermasCronologicas = [...mermas]
      .filter(m => m && m.fecha)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    mermasCronologicas.slice(0, 10).forEach(m => {
      const horaMerma = (typeof Utils.formatTime === 'function')
        ? Utils.formatTime(m.fecha)
        : (m.fecha ? new Date(m.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '');

      ultimosMovs.push({
        hora: horaMerma,
        fecha: m.fecha,
        tipo: 'Merma',
        icono: '🧹',
        descripcion: m.motivo || 'Lavado de botellones',
        monto: `${m.litros} L`,
        metodo: 'Tanque',
        cliente: 'Interno'
      });
    });

    // Ordenar cronológicamente descendente
    ultimosMovs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Nivel tanque
    const nivelPct = inventario.capacidadTanque > 0
      ? Math.round((inventario.litros / inventario.capacidadTanque) * 100)
      : 0;

    // Stock de productos físicos
    const prodsFisicos = tipos.filter(t => t.categoria === 'producto').map(p => ({
      nombre: p.nombre,
      stock: p.stock !== undefined ? p.stock : 0,
      precio: p.precio || 0
    }));

    // Análisis del mes acumulado (Septiembre 2026)
    const mesActualStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ventasMes = ventas.filter(v => {
      if (!v.fecha) return false;
      return v.fecha.startsWith(mesActualStr);
    });
    const totalMesUSD = ventasMes.reduce((s, v) => s + (parseFloat(v.total) || 0), 0);
    const totalMesBs = totalMesUSD * tasa;
    const totalBotellonesMes = ventasMes.reduce((s, v) => s + (parseInt(v.botellones) || 0), 0);

    // Análisis de productos más vendidos reales
    const productCounts = {};
    ventas.forEach(v => {
      if (v.detalles && Array.isArray(v.detalles) && v.detalles.length > 0) {
        v.detalles.forEach(it => {
          const prod = tipos.find(t => t.id === it.tipoBotellonId);
          const name = prod ? prod.nombre : (it.nombre || 'Botellón 20 Litros');
          const cant = parseInt(it.cantidad) || 1;
          productCounts[name] = (productCounts[name] || 0) + cant;
        });
      } else if (v.items && Array.isArray(v.items) && v.items.length > 0) {
        v.items.forEach(it => {
          const prod = tipos.find(t => t.id === (it.tipoBotellonId || it.id));
          const name = prod ? prod.nombre : (it.nombre || it.nombreTipo || 'Botellón 20 Litros');
          const cant = parseInt(it.cantidad) || 1;
          productCounts[name] = (productCounts[name] || 0) + cant;
        });
      } else {
        const bot = parseInt(v.botellones) || 1;
        productCounts['Botellón 20 Litros'] = (productCounts['Botellón 20 Litros'] || 0) + bot;
      }
    });

    const totalItemsSold = Object.values(productCounts).reduce((a, b) => a + b, 0) || 1;
    const productosMasVendidos = Object.entries(productCounts)
      .map(([nombre, cantidad]) => ({
        nombre,
        cantidad,
        porcentaje: Math.round((cantidad / totalItemsSold) * 100)
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // Ventas por día de la semana (Lun a Dom) reales
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const ventasPorDia = { 'Lun': 0, 'Mar': 0, 'Mié': 0, 'Jue': 0, 'Vie': 0, 'Sáb': 0, 'Dom': 0 };
    
    ventas.forEach(v => {
      if (v.fecha) {
        const dayIdx = new Date(v.fecha).getDay();
        const dayName = diasSemana[dayIdx];
        if (ventasPorDia.hasOwnProperty(dayName)) {
          ventasPorDia[dayName] += (parseFloat(v.total) || 0);
        }
      }
    });

    let maxDia = 'Lun';
    let maxMonto = 0;
    Object.entries(ventasPorDia).forEach(([d, m]) => {
      if (m > maxMonto) {
        maxMonto = m;
        maxDia = d;
      }
    });

    // Generar respaldo completo para recuperación ante desastres (Plan Plus)
    let respaldoObj = null;
    try {
      const backupStr = store.exportData();
      respaldoObj = JSON.parse(backupStr);
      // 🛡️ Filtro de seguridad de tamaño: Evitar que imágenes gigantes bloqueen el respaldo o agoten el timeout en Supabase
      if (respaldoObj && Array.isArray(respaldoObj.configuracion)) {
        respaldoObj.configuracion = respaldoObj.configuracion.map(c => {
          if (c.id === 'empresaLogo' && typeof c.value === 'string' && c.value.length > 70000) {
            return { ...c, value: './img/logo.png' };
          }
          return c;
        });
      }
    } catch (bErr) {
      console.warn('[CloudSync] Error generando snapshot de respaldo:', bErr);
    }

    const payload = {
      empresa_email: email,
      nombre_empresa: empresaNombre,
      ultima_actualizacion: new Date().toISOString(),
      resumen_hoy: {
        totalUSD,
        totalBs,
        botellones,
        litros,
        numVentas: ventasHoy.length,
        efectivoUSD,
        efectivoBs,
        efectivoBsUSD,
        pagoMovil,
        pagoMovilBs,
        punto,
        puntoBs,
        transferencia,
        credito,
        litrosMermasHoy,
        desglose_metodos: desgloseMetodos
      },
      nivel_tanque: {
        litros: inventario.litros || 0,
        capacidadTanque: inventario.capacidadTanque || 30000,
        nivelPct
      },
      stock_productos: prodsFisicos,
      ultimos_movimientos: ultimosMovs.slice(0, 35),
      analisis_mes: {
        totalMesUSD,
        totalMesBs,
        totalBotellonesMes,
        productosMasVendidos,
        ventasPorDia,
        maxDia,
        maxMonto
      },
      respaldo_completo: respaldoObj
    };

    const res = await fetch(`${SUPABASE_URL}?on_conflict=empresa_email`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log('[CloudSync] ✅ Datos y respaldo íntegro de la tienda sincronizados con Supabase:', payload);
      return true;
    } else {
      console.warn('[CloudSync] Error en respuesta de Supabase:', await res.text());
      return false;
    }
  } catch (e) {
    console.error('[CloudSync] Sincronización en segundo plano falló:', e);
    return false;
  }
}

/**
 * Consulta la copia de seguridad de una cuenta en Supabase.
 */
export async function getCloudBackup(emailParam = null) {
  try {
    let email = emailParam;
    if (!email) {
      const licenciaLocal = localStorage.getItem('licencia_usuario');
      if (!licenciaLocal) return null;
      email = JSON.parse(licenciaLocal).email;
    }
    if (!email) return null;

    const res = await fetch(`${SUPABASE_URL}?empresa_email=eq.${encodeURIComponent(email)}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;

    const remote = data[0];
    const backup = remote.respaldo_completo;
    if (!backup) return null;

    const clientesCount = Array.isArray(backup.clientes) ? backup.clientes.length : 0;
    const ventasCount = Array.isArray(backup.ventas) ? backup.ventas.length : 0;
    const prodsCfg = backup.configuracion?.find(c => c.id === 'tiposBotellon');
    const productosCount = prodsCfg && Array.isArray(prodsCfg.value) ? prodsCfg.value.length : 0;

    return {
      email,
      nombreEmpresa: remote.nombre_empresa || 'Tu Empresa',
      ultimaActualizacion: remote.ultima_actualizacion,
      nivelTanque: remote.nivel_tanque,
      clientesCount,
      ventasCount,
      productosCount,
      backup
    };
  } catch (e) {
    console.error('[CloudSync] Error al consultar respaldo de la nube:', e);
    return null;
  }
}

/**
 * Restaura toda la base de datos (clientes, inventario, ventas, etc.) desde la nube.
 */
export async function restoreFromCloud(emailParam = null) {
  try {
    const backupInfo = await getCloudBackup(emailParam);
    if (!backupInfo || !backupInfo.backup) {
      return { success: false, message: 'No se encontró una copia de seguridad en la nube para esta cuenta.' };
    }

    const ok = store.importData(backupInfo.backup);
    if (!ok) {
      return { success: false, message: 'Error al procesar el archivo de respaldo.' };
    }

    // Restaurar nivel de tanque si está disponible
    if (backupInfo.nivelTanque && backupInfo.nivelTanque.litros !== undefined) {
      store.setConfig('inventario', backupInfo.nivelTanque);
    }

    console.log('[CloudSync] ✅ Respaldo restaurado desde la nube exitosamente:', backupInfo);
    return {
      success: true,
      email: backupInfo.email,
      nombreEmpresa: backupInfo.nombreEmpresa,
      clientesCount: backupInfo.clientesCount,
      ventasCount: backupInfo.ventasCount,
      productosCount: backupInfo.productosCount,
      ultimaActualizacion: backupInfo.ultimaActualizacion
    };
  } catch (e) {
    console.error('[CloudSync] Error al restaurar desde la nube:', e);
    return { success: false, message: e.message || 'Error inesperado al restaurar.' };
  }
}

/**
 * Disparador para respaldo manual inmediato desde la interfaz.
 */
export async function backupToCloudNow() {
  const ok = await syncToCloud(true);
  const clientes = store.getAll('clientes') || [];
  const ventas = store.getAll('ventas') || [];
  const tipos = store.getConfig('tiposBotellon') || [];
  return {
    success: ok,
    clientesCount: clientes.length,
    ventasCount: ventas.length,
    productosCount: tipos.length,
    fecha: new Date().toISOString()
  };
}

// Exponer globalmente
if (typeof window !== 'undefined') {
  window.syncToCloud = syncToCloud;
  window.getCloudBackup = getCloudBackup;
  window.restoreFromCloud = restoreFromCloud;
  window.backupToCloudNow = backupToCloudNow;
}
