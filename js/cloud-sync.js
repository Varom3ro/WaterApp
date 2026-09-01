// ============================================
// WaterApp - Sincronización en la Nube (Cloud Sync)
// ============================================

import { store } from './store.js';
import { Utils } from './utils.js';

const SUPABASE_URL = 'https://nxfilgwpguqlrjlfnnwt.supabase.co/rest/v1/tienda_sync_cloud';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54ZmlsZ3dwZ3VxbHJqbGZubnd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMTU0NDQsImV4cCI6MjEwMzc5MTQ0NH0.ZSx3dudM_cmqJL5qkpOtfJBTSQhIdd4GShkZp2t3n_s';

export async function syncToCloud() {
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

    // Calcular ventas de hoy
    const hoyStr = new Date().toISOString().split('T')[0];
    const ventasHoy = ventas.filter(v => v.fecha && v.fecha.startsWith(hoyStr));

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

    const tasa = store.getConfig('tasaCambio') || 40.00;

    ventasHoy.forEach(v => {
      totalUSD += (v.total || 0);
      botellones += (v.botellones || 0);
      litros += (v.litrosTotales || (v.botellones * 20) || 0);

      // Desglose de pagos
      if (v.pagos && Array.isArray(v.pagos)) {
        v.pagos.forEach(p => {
          const m = p.monto || 0;
          if (p.metodo === 'efectivo_usd') efectivoUSD += m;
          else if (p.metodo === 'pago_movil') {
            pagoMovil += m;
            pagoMovilBs += (m * (p.tasa || tasa));
          } else if (p.metodo === 'punto_venta') {
            punto += m;
            puntoBs += (m * (p.tasa || tasa));
          } else if (p.metodo === 'transferencia') {
            transferencia += m;
          }
        });
      } else if (v.metodoPago === 'efectivo_usd') {
        efectivoUSD += (v.total || 0);
      } else if (v.tipo === 'credito') {
        credito += (v.total || 0);
      }
    });

    const totalBs = totalUSD * tasa;

    // Últimos movimientos (ventas + mermas)
    const ultimosMovs = [];
    ventas.slice(-20).reverse().forEach(v => {
      ultimosMovs.push({
        hora: Utils.formatTime(v.fecha),
        fecha: v.fecha,
        tipo: 'Venta',
        icono: '💧',
        descripcion: `${v.botellones} Botellón(es)`,
        monto: Utils.formatCurrency(v.total),
        metodo: v.tipo === 'credito' ? '📋 Crédito' : '💵 Pagado',
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

    // Análisis del mes acumulado
    const mesActualStr = hoyStr.substring(0, 7); // 'YYYY-MM'
    const ventasMes = ventas.filter(v => v.fecha && v.fecha.startsWith(mesActualStr));
    const totalMesUSD = ventasMes.reduce((s, v) => s + (v.total || 0), 0);
    const totalMesBs = totalMesUSD * tasa;
    const totalBotellonesMes = ventasMes.reduce((s, v) => s + (v.botellones || 0), 0);

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
        credito
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
        totalBotellonesMes
      }
    };

    await fetch(`${SUPABASE_URL}?on_conflict=empresa_email`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });

    console.log('[CloudSync] Datos reales de la tienda sincronizados con éxito en Supabase');
  } catch (e) {
    console.warn('[CloudSync] Sincronización en segundo plano falló (modo offline):', e);
  }
}
