// ============================================
// Tu Empresa - Sistema de Licencia y Trial
// ============================================

import { Utils } from './utils.js';
import { getCloudBackup, restoreFromCloud } from './cloud-sync.js';

const SUPABASE_URL = 'https://nxfilgwpguqlrjlfnnwt.supabase.co/rest/v1/licencia_agua_clientes';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54ZmlsZ3dwZ3VxbHJqbGZubnd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMTU0NDQsImV4cCI6MjEwMzc5MTQ0NH0.ZSx3dudM_cmqJL5qkpOtfJBTSQhIdd4GShkZp2t3n_s';

export const Licencia = {
  // Identificador único persistente para este navegador / equipo
  getDeviceId() {
    let deviceId = localStorage.getItem('waterapp_device_uuid');
    if (!deviceId) {
      deviceId = 'dev_' + Utils.generateId() + '_' + Date.now().toString(36);
      localStorage.setItem('waterapp_device_uuid', deviceId);
    }
    return deviceId;
  },

  async validar() {
    const licenciaLocal = localStorage.getItem('licencia_usuario');
    
    // Si ya hay licencia local, verificar y actualizar en caliente
    if (licenciaLocal) {
      const user = JSON.parse(licenciaLocal);
      const localDeviceId = this.getDeviceId();
      
      // Intentar actualizar datos en caliente (días de licencia, catálogo y validación de hardware)
      const onlineOk = await this._revalidarOnline(user.email);
      if (!onlineOk) {
        // Si _revalidarOnline detectó bloqueo de dispositivo o expiración, verificar estado
        const checkLocal = localStorage.getItem('licencia_usuario');
        if (checkLocal) {
          const u = JSON.parse(checkLocal);
          if (u.device_id && u.device_id !== localDeviceId) return false;
          if (!u.activo || this._checkExpirado(u.fecha_registro, u.dias_prueba)) return false;
        }
      }
      
      const freshLocal = localStorage.getItem('licencia_usuario') || licenciaLocal;
      const freshUser = JSON.parse(freshLocal);

      // Verificación de seguridad local/offline de dispositivo
      if (freshUser.device_id && freshUser.device_id !== localDeviceId) {
        this.bloquearDispositivoNoAutorizado(freshUser);
        return false;
      }
      
      if (!freshUser.activo || this._checkExpirado(freshUser.fecha_registro, freshUser.dias_prueba)) {
        this.bloquearPantalla();
        return false;
      }
      return true;
    }
    
    // Si no hay licencia local, solicitar registro
    this.mostrarRegistro();
    return false;
  },

  async _revalidarOnline(email) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout max
      
      const res = await fetch(`${SUPABASE_URL}?email=eq.${encodeURIComponent(email)}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const user = data[0];
          const localDeviceId = this.getDeviceId();

          // 🛡️ BLINDAJE POR DISPOSITIVO ÚNICO (Opción A):
          if (!user.device_id) {
            // El usuario no tiene equipo registrado aún (o el admin lo reseteó a null en Supabase).
            // Vincular automáticamente este equipo actual como el oficial de la tienda.
            const deviceInfo = `Browser: ${navigator.userAgent} | Platform: ${navigator.platform} | Vinculado: ${new Date().toISOString()}`;
            try {
              await fetch(`${SUPABASE_URL}?email=eq.${encodeURIComponent(email)}`, {
                method: 'PATCH',
                headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  device_id: localDeviceId,
                  device_info: deviceInfo
                })
              });
              user.device_id = localDeviceId;
              user.device_info = deviceInfo;
              console.log('[Licencia] 💻 Dispositivo vinculado exitosamente a la cuenta:', localDeviceId);
            } catch (errPatch) {
              console.warn('[Licencia] Error registrando device_id en Supabase:', errPatch);
            }
          } else if (user.device_id !== localDeviceId) {
            // 🛑 DISPOSITIVO NO AUTORIZADO (Intento de usar en otra PC o navegador distinto)
            console.warn('[Licencia] 🛑 Dispositivo no autorizado:', localDeviceId, 'vs registrado:', user.device_id);
            this.bloquearDispositivoNoAutorizado(user);
            return false;
          }

          localStorage.setItem('licencia_usuario', JSON.stringify(user));
          this.aplicarCatalogoRemotoSiExiste();

          if (!user.activo || this._checkExpirado(user.fecha_registro, user.dias_prueba)) {
            this.bloquearPantalla();
            return false;
          }
          return true;
        }
      }
      return false;
    } catch (e) {
      console.warn('[Licencia] Re-validación online falló (modo offline activo):', e);
      return false;
    }
  },

  _checkExpirado(fechaRegistroStr, diasPrueba) {
    const registro = new Date(fechaRegistroStr);
    const limite = new Date(registro.getTime() + (diasPrueba * 24 * 60 * 60 * 1000));
    return new Date() > limite;
  },

  async _validarOnlineSilencioso(email) {
    try {
      const res = await fetch(`${SUPABASE_URL}?email=eq.${encodeURIComponent(email)}`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          const user = data[0];
          localStorage.setItem('licencia_usuario', JSON.stringify(user));
          this.aplicarCatalogoRemotoSiExiste();
          if (!user.activo || this._checkExpirado(user.fecha_registro, user.dias_prueba)) {
            this.bloquearPantalla();
          }
        }
      }
    } catch (e) {
      console.warn('[Licencia] Re-validación online falló (modo offline activo):', e);
    }
  },

  aplicarCatalogoRemotoSiExiste(storeInstance = null) {
    const licenciaLocal = localStorage.getItem('licencia_usuario');
    if (!licenciaLocal) return;
    try {
      const user = JSON.parse(licenciaLocal);
      if (user.catalogo_inicial && Array.isArray(user.catalogo_inicial) && user.catalogo_inicial.length > 0) {
        const versionAplicada = localStorage.getItem('catalogo_remoto_aplicado');
        const hashActual = JSON.stringify(user.catalogo_inicial);
        if (versionAplicada !== hashActual) {
          const s = storeInstance || (window.__app_store || null);
          if (s) {
            s.setConfig('tiposBotellon', user.catalogo_inicial);
            localStorage.setItem('catalogo_remoto_aplicado', hashActual);
            console.log('[Licencia] Catálogo remoto inyectado exitosamente');
          }
        }
      }
    } catch (e) {
      console.warn('[Licencia] Error al aplicar catálogo remoto:', e);
    }
  },

  mostrarRegistro() {
    const overlay = document.createElement('div');
    overlay.id = 'licencia-overlay';
    overlay.style = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(135deg, var(--color-primary-900, #1B4332), #0F1117);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; font-family: var(--font-family, system-ui, sans-serif); color: #fff;
      padding: var(--space-md, 16px);
    `;

    overlay.innerHTML = `
      <div class="card" style="max-width: 460px; width: 100%; padding: var(--space-xl, 24px); background: var(--color-surface, #ffffff); color: var(--color-text-primary, #1e293b); border-radius: var(--radius-lg, 12px); box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.3)); border: 1px solid var(--color-border, #e2e8f0);">
        <div style="text-align: center; margin-bottom: var(--space-lg, 20px);">
          <div style="font-size: 44px; margin-bottom: 8px;">💧</div>
          <h2 style="color: var(--color-primary-900, #1B4332); font-size: 22px; font-weight: 800; margin-bottom: 6px;">Acceso a WaterApp</h2>
          <p style="color: var(--color-text-secondary, #64748b); font-size: var(--font-size-base, 14px); line-height: 1.5;">Introduce el correo electrónico registrado de tu tienda para activar o ingresar a tu sistema.</p>
        </div>
        
        <div style="margin-bottom: var(--space-lg, 20px);">
          <label class="form-label" style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">Correo Electrónico Registrado:</label>
          <input type="email" id="licencia-email" class="form-control" placeholder="ejemplo@correo.com" style="width: 100%; height: 44px; font-size: 15px;" required />
          <div id="licencia-error" style="color: var(--color-danger, #ef4444); font-size: 13px; margin-top: 6px; display: none;"></div>
        </div>

        <button id="btn-activar-licencia" class="btn btn-primary" style="width: 100%; height: 46px; font-size: 15px; font-weight: bold; cursor: pointer;">
          🚀 Ingresar al Sistema
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const btn = overlay.querySelector('#btn-activar-licencia');
    const input = overlay.querySelector('#licencia-email');
    const errorDiv = overlay.querySelector('#licencia-error');

    btn.addEventListener('click', async () => {
      const email = input.value.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        errorDiv.textContent = 'Por favor introduce un correo electrónico válido.';
        errorDiv.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Verificando licencia...';
      errorDiv.style.display = 'none';

      try {
        const localDeviceId = this.getDeviceId();

        // 1. Consultar si el correo ya está registrado en Supabase
        let res = await fetch(`${SUPABASE_URL}?email=eq.${encodeURIComponent(email)}`, {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          }
        });

        if (!res.ok) throw new Error('Error al conectar con el servidor.');

        let data = await res.json();
        let user = null;

        if (data && data.length > 0) {
          user = data[0];

          // 🛡️ Verificar si ya está vinculado a otro equipo
          if (user.device_id && user.device_id !== localDeviceId) {
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            this.bloquearDispositivoNoAutorizado(user);
            return;
          }

          // Si el device_id está libre (nuevo o reseteado desde Supabase por el admin)
          if (!user.device_id) {
            const deviceInfo = `Browser: ${navigator.userAgent} | Platform: ${navigator.platform} | Vinculado: ${new Date().toISOString()}`;
            await fetch(`${SUPABASE_URL}?email=eq.${encodeURIComponent(email)}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                device_id: localDeviceId,
                device_info: deviceInfo
              })
            });
            user.device_id = localDeviceId;
            user.device_info = deviceInfo;
          }
        } else {
          // Crear un nuevo registro para este cliente
          const deviceInfo = `Browser: ${navigator.userAgent} | Platform: ${navigator.platform} | Creado: ${new Date().toISOString()}`;
          
          res = await fetch(SUPABASE_URL, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              email: email,
              device_id: localDeviceId,
              device_info: deviceInfo
            })
          });

          if (!res.ok) throw new Error('No se pudo registrar la licencia.');
          const createdData = await res.json();
          user = createdData[0];
        }

        // Guardar licencia localmente
        localStorage.setItem('licencia_usuario', JSON.stringify(user));

        // Validar si está activo y no expirado
        if (!user.activo || this._checkExpirado(user.fecha_registro, user.dias_prueba)) {
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
          this.bloquearPantalla();
          return;
        }

        // Remover pantalla de registro
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);

        // ☁️ Verificar si hay respaldo en la nube para restaurar automáticamente
        await this.verificarYOfrecerRestauracion(user.email);

      } catch (e) {
        errorDiv.textContent = e.message || 'Ocurrió un error al verificar la licencia. Inténtalo de nuevo.';
        errorDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '🚀 Ingresar al Sistema';
      }
    });
  },

  async verificarYOfrecerRestauracion(email) {
    try {
      const backupInfo = await getCloudBackup(email);
      if (!backupInfo || !backupInfo.backup) {
        window.location.reload();
        return;
      }

      // Si hay respaldo y tiene clientes o ventas:
      if (backupInfo.clientesCount > 0 || backupInfo.ventasCount > 0) {
        const modal = document.createElement('div');
        modal.id = 'modal-restauracion-cloud';
        modal.style = `
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 100000; font-family: var(--font-family, system-ui, sans-serif); color: #fff;
          padding: 16px;
        `;

        const fechaStr = backupInfo.ultimaActualizacion
          ? new Date(backupInfo.ultimaActualizacion).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
          : 'Reciente';

        modal.innerHTML = `
          <div class="card" style="max-width: 460px; width: 100%; padding: 26px; background: #1E293B; color: #F8FAFC; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #38BDF8; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 8px;">🎉☁️</div>
            <h2 style="color: #38BDF8; font-size: 21px; font-weight: 800; margin-bottom: 6px;">¡Copia de Seguridad Encontrada!</h2>
            <p style="color: #CBD5E1; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
              Detectamos un respaldo en la nube de tu tienda <strong>${backupInfo.nombreEmpresa}</strong>.
            </p>

            <div style="background: rgba(15, 23, 42, 0.7); padding: 14px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #334155; text-align: left; font-size: 13px; color: #E2E8F0;">
              <div style="margin-bottom: 6px;">👥 <strong>Clientes registrados:</strong> ${backupInfo.clientesCount}</div>
              <div style="margin-bottom: 6px;">💧 <strong>Historial de ventas:</strong> ${backupInfo.ventasCount}</div>
              <div style="margin-bottom: 6px;">📦 <strong>Productos y precios:</strong> ${backupInfo.productosCount}</div>
              <div style="color: #94A3B8; font-size: 12px; margin-top: 8px; border-top: 1px solid #334155; padding-top: 6px;">
                🕒 Última actualización: <strong>${fechaStr}</strong>
              </div>
            </div>

            <p style="color: #94A3B8; font-size: 13px; margin-bottom: 20px;">
              ¿Deseas restaurar todos tus clientes, deudas y catálogo en este equipo ahora?
            </p>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <button id="btn-confirmar-restaurar-login" class="btn btn-primary" style="height: 46px; font-size: 15px; font-weight: 700; background: #0284C7; border: none; border-radius: 8px; cursor: pointer; color: white;">
                🔄 Sí, Restaurar Todos Mis Datos
              </button>
              <button id="btn-omitir-restaurar-login" style="height: 38px; font-size: 13px; background: transparent; border: 1px solid #475569; color: #94A3B8; border-radius: 8px; cursor: pointer;">
                Empezar con tienda vacía
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#btn-confirmar-restaurar-login').addEventListener('click', async (e) => {
          const btn = e.target;
          btn.disabled = true;
          btn.textContent = '⏳ Restaurando datos...';
          const res = await restoreFromCloud(email);
          if (res.success) {
            btn.textContent = '✅ ¡Restaurado con éxito!';
            setTimeout(() => {
              window.location.reload();
            }, 800);
          } else {
            alert('Error al restaurar: ' + res.message);
            btn.disabled = false;
            btn.textContent = '🔄 Reintentar Restauración';
          }
        });

        modal.querySelector('#btn-omitir-restaurar-login').addEventListener('click', () => {
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    } catch (e) {
      console.warn('[Licencia] Error al verificar respaldo cloud al inicio:', e);
      window.location.reload();
    }
  },

  bloquearDispositivoNoAutorizado(user) {
    const oldOverlay = document.getElementById('licencia-overlay');
    if (oldOverlay && oldOverlay.parentNode) oldOverlay.parentNode.removeChild(oldOverlay);

    const overlay = document.createElement('div');
    overlay.id = 'licencia-overlay';
    overlay.style = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(135deg, #0F172A, #020617);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; font-family: var(--font-family, system-ui, sans-serif); color: #fff;
      padding: 16px;
    `;

    const userEmail = user?.email || 'tu cuenta';
    const whatsappMsg = encodeURIComponent(`Hola, necesito autorizar el cambio de equipo para mi cuenta de WaterApp: ${userEmail}`);

    overlay.innerHTML = `
      <div class="card" style="max-width: 480px; width: 100%; padding: 28px; background: #1E293B; color: #F8FAFC; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); border: 1px solid #334155; text-align: center;">
        <div style="font-size: 52px; margin-bottom: 12px;">💻🔒</div>
        <h2 style="color: #F87171; font-size: 22px; font-weight: 800; margin-bottom: 8px;">Licencia Activa en Otro Equipo</h2>
        
        <div style="background: rgba(0, 0, 0, 0.3); padding: 8px 14px; border-radius: 8px; font-family: monospace; font-size: 13px; margin-bottom: 16px; color: #94A3B8; display: inline-block; border: 1px solid #334155;">
          Cuenta: <strong style="color:#38BDF8;">${userEmail}</strong>
        </div>

        <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6; margin-bottom: 20px; text-align: left;">
          Por seguridad de tu inventario y según los términos de tu licencia, cada <strong>Punto de Venta</strong> funciona en un único equipo autorizado.
          <br><br>
          Esta cuenta ya se encuentra activa en otra computadora o navegador. Si cambiaste de equipo, formateaste la máquina o deseas habilitar una caja adicional, por favor comunícate con Soporte Técnico para autorizar este acceso.
        </p>
        
        <a href="https://wa.me/584166315114?text=${whatsappMsg}" target="_blank" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 48px; font-size: 15px; font-weight: 700; text-decoration: none; margin-bottom: 14px; background: #25D366; color: #fff; border: none; border-radius: 8px;">
          💬 Solicitar Autorización por WhatsApp
        </a>

        <div style="border-top: 1px solid #334155; padding-top: 14px;">
          <button id="btn-cambiar-cuenta-bloqueo" style="width: 100%; height: 38px; font-size: 13px; background: transparent; border: 1px solid #475569; color: #94A3B8; cursor: pointer; border-radius: 8px; font-weight: 500;">
            🔑 Usar otra cuenta / Ingresar otro correo
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btnCambiar = overlay.querySelector('#btn-cambiar-cuenta-bloqueo');
    if (btnCambiar) {
      btnCambiar.addEventListener('click', () => {
        localStorage.removeItem('licencia_usuario');
        window.location.reload();
      });
    }
  },

  bloquearPantalla() {
    const oldOverlay = document.getElementById('licencia-overlay');
    if (oldOverlay && oldOverlay.parentNode) oldOverlay.parentNode.removeChild(oldOverlay);

    // Obtener información del correo registrado localmente si existe
    const licenciaLocal = localStorage.getItem('licencia_usuario');
    let emailInfo = '';
    if (licenciaLocal) {
      try {
        const user = JSON.parse(licenciaLocal);
        if (user && user.email) {
          emailInfo = `<div style="background: rgba(0, 0, 0, 0.05); padding: 8px var(--space-md, 16px); border-radius: var(--radius-sm, 4px); font-family: monospace; font-size: var(--font-size-sm, 13px); margin-bottom: var(--space-md, 16px); color: var(--color-text-secondary, #64748b); display: inline-block;">Cuenta activa: ${user.email}</div>`;
        }
      } catch (e) {
        console.error(e);
      }
    }

    const overlay = document.createElement('div');
    overlay.id = 'licencia-overlay';
    overlay.style = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(135deg, #1A1D26, #0F1117);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; font-family: var(--font-family, system-ui, sans-serif); color: #fff;
      padding: var(--space-md, 16px);
    `;

    overlay.innerHTML = `
      <div class="card" style="max-width: 450px; width: 100%; padding: var(--space-xl, 24px); background: var(--color-surface, #ffffff); color: var(--color-text-primary, #1e293b); border-radius: var(--radius-lg, 12px); box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.3)); border: 1px solid var(--color-border, #e2e8f0); text-align: center;">
        <div style="font-size: 50px; margin-bottom: var(--space-md, 16px);">🔒</div>
        <h2 style="color: var(--color-danger, #ef4444); font-size: 24px; margin-bottom: var(--space-sm, 8px);">Demostración Expirada</h2>
        ${emailInfo}
        <p style="color: var(--color-text-secondary, #64748b); font-size: var(--font-size-base, 14px); line-height: 1.5; margin-bottom: var(--space-lg, 20px);">
          Tu período de prueba ha finalizado o la cuenta está inactiva. Para continuar administrando tus recargas de agua con todas las funciones activadas, por favor contáctanos para adquirir una licencia completa.
        </p>
        
        <a href="https://wa.me/584166315114?text=Hola,%20quiero%20adquirir%20la%20licencia%20de%20WaterApp" target="_blank" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 46px; font-size: var(--font-size-md, 15px); font-weight: bold; text-decoration: none; margin-bottom: var(--space-md, 16px);">
          💬 Solicitar Licencia Completa
        </a>

        <div style="margin-top: var(--space-sm, 8px); border-top: 1px solid var(--color-border, #e2e8f0); padding-top: var(--space-md, 16px);">
          <button id="btn-cambiar-licencia" class="btn btn-secondary" style="width: 100%; height: 40px; font-size: var(--font-size-sm, 13px); background: transparent; border: 1px solid var(--color-border, #e2e8f0); color: var(--color-text-secondary, #64748b); cursor: pointer; border-radius: var(--radius-sm, 4px); font-weight: 500;">
            🔑 Usar otra cuenta / Registrar otro correo
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btnCambiar = overlay.querySelector('#btn-cambiar-licencia');
    if (btnCambiar) {
      btnCambiar.addEventListener('click', () => {
        if (confirm('¿Seguro que deseas usar otra cuenta? Esto eliminará la sesión local actual.')) {
          localStorage.removeItem('licencia_usuario');
          window.location.reload();
        }
      });
    }
  }
};