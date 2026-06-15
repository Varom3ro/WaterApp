// ============================================
// Tu Empresa - Sistema de Licencia y Trial
// ============================================

import { Utils } from './utils.js';

const SUPABASE_URL = 'https://zxpcnixarfpnkxrfjbxv.supabase.co/rest/v1/licencia_agua_clientes';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4cGNuaXhhcmZwbmt4cmZqYnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjUzMzIsImV4cCI6MjA5NDcwMTMzMn0.Ih6oX-05xnUqVnlNgpnb4ehiB66jFr7HVYzLkrYSs2A';

export const Licencia = {
  async validar() {
    const licenciaLocal = localStorage.getItem('licencia_usuario');
    
    // Si ya hay licencia local, verificar expiración
    if (licenciaLocal) {
      const user = JSON.parse(licenciaLocal);
      const expirado = this._checkExpirado(user.fecha_registro, user.dias_prueba);
      
      if (expirado) {
        this.bloquearPantalla();
        return false;
      }
      
      // Intentar re-validar online en segundo plano por seguridad (si hay internet)
      this._validarOnlineSilencioso(user.email);
      return true;
    }
    
    // Si no hay licencia local, solicitar registro
    this.mostrarRegistro();
    return false;
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
          if (!user.activo || this._checkExpirado(user.fecha_registro, user.dias_prueba)) {
            this.bloquearPantalla();
          }
        }
      }
    } catch (e) {
      console.warn('[Licencia] Re-validación online falló (modo offline activo):', e);
    }
  },

  mostrarRegistro() {
    const overlay = document.createElement('div');
    overlay.id = 'licencia-overlay';
    overlay.style = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(135deg, var(--color-primary-900), #0F1117);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; font-family: var(--font-family); color: #fff;
      padding: var(--space-md);
    `;

    overlay.innerHTML = `
      <div class="card" style="max-width: 450px; width: 100%; padding: var(--space-xl); background: var(--color-surface); color: var(--color-text-primary); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); border: 1px solid var(--color-border);">
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <h2 style="color: var(--color-primary-900); font-size: 24px; margin-bottom: var(--space-sm);">Demostración Gratuita</h2>
          <p style="color: var(--color-text-secondary); font-size: var(--font-size-base); line-height: 1.5;">Introduce tu correo electrónico para activar tu período de prueba de 7 días y probar la herramienta.</p>
        </div>
        
        <div style="margin-bottom: var(--space-lg);">
          <label class="form-label" style="display: block; margin-bottom: 6px;">Correo Electrónico:</label>
          <input type="email" id="licencia-email" class="form-control" placeholder="ejemplo@correo.com" style="width: 100%; height: 44px; font-size: var(--font-size-md);" required />
          <div id="licencia-error" style="color: var(--color-danger); font-size: var(--font-size-xs); margin-top: 6px; display: none;"></div>
        </div>

        <button id="btn-activar-licencia" class="btn btn-primary" style="width: 100%; height: 46px; font-size: var(--font-size-md); font-weight: bold;">
          🚀 Activar Prueba de 7 Días
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const btn = overlay.querySelector('#btn-activar-licencia');
    const input = overlay.querySelector('#licencia-email');
    const errorDiv = overlay.querySelector('#licencia-error');

    btn.addEventListener('click', async () => {
      const email = input.value.trim();
      if (!email || !email.includes('@')) {
        errorDiv.textContent = 'Por favor introduce un correo electrónico válido.';
        errorDiv.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Procesando...';
      errorDiv.style.display = 'none';

      try {
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
          // Ya existe en la base de datos
          user = data[0];
        } else {
          // Crear un nuevo registro para este cliente
          const deviceInfo = `Browser: ${navigator.userAgent} | Platform: ${navigator.platform}`;
          
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
          this.bloquearPantalla();
        } else {
          // Remover pantalla de registro y recargar app
          document.body.removeChild(overlay);
          window.location.reload();
        }

      } catch (e) {
        errorDiv.textContent = e.message || 'Ocurrió un error al activar la prueba. Inténtalo de nuevo.';
        errorDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '🚀 Activar Prueba de 7 Días';
      }
    });
  },

  bloquearPantalla() {
    // Si ya existe una pantalla de bloqueo anterior, removerla
    const oldOverlay = document.getElementById('licencia-overlay');
    if (oldOverlay) document.body.removeChild(oldOverlay);

    const overlay = document.createElement('div');
    overlay.id = 'licencia-overlay';
    overlay.style = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: linear-gradient(135deg, #1A1D26, #0F1117);
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; font-family: var(--font-family); color: #fff;
      padding: var(--space-md);
    `;

    overlay.innerHTML = `
      <div class="card" style="max-width: 450px; width: 100%; padding: var(--space-xl); background: var(--color-surface); color: var(--color-text-primary); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl); border: 1px solid var(--color-border); text-align: center;">
        <div style="font-size: 50px; margin-bottom: var(--space-md);">🔒</div>
        <h2 style="color: var(--color-danger); font-size: 24px; margin-bottom: var(--space-sm);">Demostración Expirada</h2>
        <p style="color: var(--color-text-secondary); font-size: var(--font-size-base); line-height: 1.5; margin-bottom: var(--space-lg);">
          Tu período de prueba de 7 días ha finalizado. Para continuar administrando tus recargas de agua con todas las funciones activadas, por favor contáctanos para adquirir una licencia completa.
        </p>
        
        <a href="https://wa.me/584166315114?text=Hola,%20quiero%20adquirir%20la%20licencia%20de%20WaterApp" target="_blank" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 46px; font-size: var(--font-size-md); font-weight: bold; text-decoration: none;">
          💬 Solicitar Licencia Completa
        </a>
      </div>
    `;

    document.body.appendChild(overlay);
  }
};
