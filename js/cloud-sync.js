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
    let pagoMovil = 0;
    let pagoMovilBs = 0;
    let punto = 0;
    let puntoBs = 0;
    let transferencia = 0;
    let credito = 0;

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
          if (p.metodo === 'efectivo_usd') {
            efectivoUSD += m;
          } else if (p.metodo === 'pago_movil') {
            pagoMovil += m;
            pagoMovilBs += (m * currentTasa);
          } else if (p.metodo === 'punto_venta' || p.metodo === 'punto') {
            punto += m;
            puntoBs += (m * currentTasa);
          } else if (p.metodo === 'transferencia') {
            transferencia += m;
          }
        });
      } else {
        if (v.metodoPago === 'pago_movil') {
          pagoMovil += vTotal;
          pagoMovilBs += (vTotal * tasa);
        } else if (v.metodoPago === 'punto_venta' || v.metodoPago === 'punto') {
          punto += vTotal;
          puntoBs += (vTotal * tasa);
        } else if (v.metodoPago === 'transferencia') {
          transferencia += vTotal;
        } else {
          efectivoUSD += vTotal;
        }
      }
    });

    const totalBs = totalUSD * tasa;

    // 🛡️ ESCUDO PROTECTOR ANTI-SOBRESCRITURA:
    // Si este dispositivo tiene 0 ventas en todo su historial y el tanque en 0,
    // comprobar si la tienda ya tiene datos en la nube para NO borrar el tanque ni el mes con ceros.
    if (ventas.length === 0 && (!inventario.litros || inventario.litros === 0) && !isManual) {
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
            const remoteTotalMes = remote.analisis_mes?.totalMesUSD || 0;
            const remoteLitros = remote.nivel_tanque?.litros || 0;
            const remoteMovs = remote.ultimos_movimientos?.length || 0;

            if (remoteTotalMes > 0 || remoteLitros > 0 || remoteMovs > 0) {
              console.log('[CloudSync] 🛡️ Dispositivo vacío detectado. Se protegen datos activos de la nube (tanque, mes, movimientos).');
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
    const ultimosMovs = [];
    ventas.slice(-25).reverse().forEach(v => {
      let metodoLabel = '💵 Pagado';
      if (v.tipo === 'credito') metodoLabel = '📋 Crédito';
      else if (v.pagos && v.pagos[0]) {
        const m = v.pagos[0].metodo;
        if (m === 'pago_movil') metodoLabel = '📱 Pago Móvil';
        else if (m === 'punto_venta' || m === 'punto') metodoLabel = '💳 Punto Venta';
        else if (m === 'transferencia') metodoLabel = '🏦 Transferencia';
        else if (m === 'efectivo_usd') metodoLabel = '💵 Efectivo $';
      }

      ultimosMovs.push({
        hora: Utils.formatTime(v.fecha),
        fecha: v.fecha,
        tipo: 'Venta',
        icono: '💧',
        descripcion: `${v.botellones || 1} Botellón(es)`,
        monto: Utils.formatCurrency(v.total),
        metodo: metodoLabel,
        cliente: v.clienteNombre || 'Cliente Mostrador'
      });
    });

    mermas.slice(-5).reverse().forEach(m => {
      ultimosMovs.push({
        hora: Utils.formatTime(m.fecha),
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
      if (v.items && Array.isArray(v.items) && v.items.length > 0) {
        v.items.forEach(it => {
          const name = it.nombre || it.nombreTipo || 'Botellón 20 Litros';
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
        pagoMovil,
        pagoMovilBs,
        punto,
        puntoBs,
        transferencia,
        credito,
        litrosMermasHoy
      },
      nivel_tanque: {
        litros: inventario.litros || 0,
        capacidadTanque: inventario.capacidadTanque || 30000,
        nivelPct
      },
      stock_productos: prodsFisicos,
      ultimos_movimientos: ultimosMovs.slice(0, 20),
      analisis_mes: {
        totalMesUSD,
        totalMesBs,
        totalBotellonesMes,
        productosMasVendidos,
        ventasPorDia,
        maxDia,
        maxMonto
      }
    };

    const res = await fetch(`${SUPABASE_URL}?on_conflict=empresa_email`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log('[CloudSync] ✅ Datos reales de la tienda sincronizados con Supabase:', payload);
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

// Exponer globalmente
if (typeof window !== 'undefined') {
  window.syncToCloud = syncToCloud;
}
