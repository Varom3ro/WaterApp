// ============================================
// Tu Empresa - Utilidades
// ============================================

export const Utils = {
  // Generar ID único
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  // Formatear moneda (USD o Bs)
  formatCurrency(amount, currency = 'USD') {
    if (currency === 'Bs' || currency === 'VES') {
      const formatted = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
      return `Bs ${formatted}`;
    }
    const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    if (currency === 'USD') return `$ ${formatted}`;
    return `${currency} ${formatted}`;
  },

  // Formatear número
  formatNumber(num, isBs = false) {
    if (isBs) {
      return new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    }
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  },

  // Formatear fecha
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  },

  // Formatear fecha y hora
  formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  },

  // Fecha actual en formato ISO local
  todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  },

  // Fecha/hora actual ISO
  nowISO() {
    return new Date().toISOString();
  },

  // Diferencia en días entre dos fechas
  daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diff = Math.abs(d2 - d1);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },

  // Convertir litros a botellones
  litrosToBotellones(litros) {
    return Math.floor(litros / 20);
  },

  // Convertir botellones a litros
  botellonesToLitros(botellones) {
    return botellones * 20;
  },

  // Debounce
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  // Escapar HTML
  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Obtener inicio de semana (lunes)
  getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  // Días de la semana
  weekDays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],

  // Meses
  months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],

  // Capacidades de cisterna disponibles
  cisternCapacities: [4500, 7500, 10000, 15000],

  // Métodos de pago
  paymentMethods: [
    { id: 'punto', label: 'Punto de Venta', icon: '💳' },
    { id: 'efectivo_usd', label: 'Efectivo (USD)', icon: '💵' },
    { id: 'efectivo_bs', label: 'Efectivo (Bs)', icon: '💴' },
    { id: 'pago_movil', label: 'Pago Móvil', icon: '📱' },
    { id: 'transferencia', label: 'Transferencia', icon: '🏦' }
  ],

  // Estatus de cliente
  clientStatus: {
    al_dia: { label: 'Al Día', class: 'badge-success' },
    con_abono: { label: 'Con Abono', class: 'badge-info' },
    debe: { label: 'Debe', class: 'badge-warning' },
    moroso: { label: 'Moroso', class: 'badge-danger' }
  }
};
