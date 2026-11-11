# WIKI: WaterApp / Refill H2O (Recarga de Agua)

**Última actualización:** 2026-11-07 22:45  
**Ruta del Sistema:** `D:\Recarga de agua\WaterApp`  
**Repositorio GitHub:** [Varom3ro/WaterApp](https://github.com/Varom3ro/WaterApp)  
**Versión de Producción:** `v2.8.54`  
**Stack Tecnológico:** HTML5, CSS3 Moderno, JavaScript Vanilla (ES Modules), Supabase Cloud (`tienda_sync_cloud`), Service Workers (PWA Offline-First), html2pdf.js, QRCode.js.

---

## 1. Resumen Ejecutivo y Propósito

**WaterApp** (comercializado operativamente bajo la marca **Refill H2O**) es una solución vertical de Punto de Venta (POS) y Telemetría Ejecutiva Móvil en Tiempo Real diseñada específicamente para plantas purificadoras y expendios de recarga de agua potable, con capacidad extendida para minimarkets y bodegones anexos.

### Retos Operativos que Resuelve
1. **Control Físico y Rotación de Envases (Botellones):** Monitoreo estricto del balance entre recargas de líquido (solo llenado), venta de envases plásticos nuevos y control de botellones prestados/en consignación a clientes recurrentes.
2. **Economía Bimoneda (USD / Bs.):** Registro simultáneo de operaciones en divisas (USD efectivo, Zelle) y moneda local venezolana (Bolívares en efectivo, Punto de Venta, Pago Móvil) aplicando tasas de cambio en tiempo real o fijadas por turno.
3. **Resiliencia Operativa Offline-First:** El sistema POS opera al 100% sin conexión a Internet en la planta, sincronizando deltas con la nube tan pronto detecta conectividad.
4. **Supervisión Remota Gerencial:** El propietario no requiere estar en planta para auditar el negocio; accede mediante un visor PWA ligero (`visor.html`) conectado a Supabase para verificar en vivo los cierres de caja, nivel de ventas por método de pago y volumen de litros despachados.
5. **Control de Licenciamiento y Cobranza:** Mecanismo centralizado de activación mediante hash de licencia, bloqueo por vencimiento de suscripción y pasarela de recordatorio de pago vía WhatsApp ($15 USD/mes por sede).

---

## 2. Arquitectura y Componentes Clave

El ecosistema está construido con una arquitectura modular desacoplada basada en Vanilla JS, prescindiendo deliberadamente de frameworks pesados para garantizar tiempos de carga sub-segundo en equipos de bajo costo en planta.

```
D:\Recarga de agua\WaterApp
├── index.html                   # Entry point del POS Principal de Planta
├── visor.html                   # Entry point del Visor Ejecutivo Remoto (Dueño / Celular)
├── visor-supervisor.html        # Entry point del Visor Operativo de Supervisores (Inventario, Tanque, Catálogo)
├── superadmin.html              # Panel de Gestión de Licencias y Alta de Clientes
├── admin-catalogo.html          # Herramienta de inyección remota de productos por sucursal
├── propuesta-comercial.html     # Landing de propuesta comercial WaterApp estándar
├── propuesta-comercial-integral.html # Landing comercial WaterApp + Módulo Bodegón
├── plantilla-cobro-whatsapp.md  # Copys de cobranza para recordatorio de suscripción ($15/mes)
├── sw.js / sw-visor.js / sw-visor-supervisor.js # Service Workers para operación offline y caché PWA
├── manifest.json / manifest-visor.json / manifest-visor-supervisor.json # Manifiestos de instalación PWA
├── css/styles.css               # Sistema de diseño
