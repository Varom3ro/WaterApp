## Documentación Técnica (Cómo conectarse)

Integrar nuestra API en tu aplicación web, móvil o sistema de caja (POS) toma menos de 5 minutos. 

### 1. Credenciales de Acceso
Para conectarte, necesitarás una `API_KEY` (Clave Pública Anónima) que te proporcionaremos al contratar el servicio. Esta clave es segura para utilizarse desde aplicaciones *frontend* (navegadores) o *backend* (servidores).

### 2. Los Endpoints (Elige tu estrategia)

Debes realizar una petición HTTP `POST` a UNA de las siguientes URLs, dependiendo de la lógica que desees aplicar en tu negocio:

> **Opción A (Conservadora):** `https://wfuynlfknawjkhevooal.supabase.co/rest/v1/rpc/obtener_tasa_vigente`
> *Usa esta URL si deseas respetar la fecha calendario actual.*

> **Opción B (Agresiva):** `https://wfuynlfknawjkhevooal.supabase.co/rest/v1/rpc/obtener_tasa_publicada`
> *Usa esta URL si deseas aplicar inmediatamente la última tasa publicada por el BCV (ideal para fines de semana).*

*(Nota: Utilizamos el método `POST` por razones de seguridad de infraestructura RPC, aunque la acción sea de solo lectura).*

### 3. Cabeceras (Headers) Requeridas
Debes incluir las siguientes cabeceras en tu petición sin importar qué Endpoint elijas:
*   `Content-Type: application/json`
*   `apikey: <TU_API_KEY>`
*   `Authorization: Bearer <TU_API_KEY>`

---

## Ejemplos de Integración

### Usando JavaScript (Fetch API) - Ideal para Frontend y Node.js
```javascript
const obtenerTasaBCV = async () => {
  const API_KEY = 'TU_API_KEY';
  
  // Cambia a 'obtener_tasa_publicada' si prefieres la lógica agresiva
  const endpoint = 'obtener_tasa_vigente'; 
  const url = `https://wfuynlfknawjkhevooal.supabase.co/rest/v1/rpc/${endpoint}`;

  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    const datos = await respuesta.json();
    
    // Extraer la tasa del arreglo devuelto
    const tasaActual = datos[0];
    
    console.log(`Para cálculos usa: ${tasaActual.tasa}`); // 742.8105
    console.log(`Para mostrar en pantalla usa: Bs. ${tasaActual.tasa_formateada}`); // Bs. 742,81
    
  } catch (error) {
    console.error("Error obteniendo la tasa:", error);
  }
};
```

### Usando cURL - Ideal para pruebas en Terminal
```bash
# Ejemplo usando la lógica de Tasa Publicada (Agresiva)
curl -X POST "https://wfuynlfknawjkhevooal.supabase.co/rest/v1/rpc/obtener_tasa_publicada" \
     -H "Content-Type: application/json" \
     -H "apikey: TU_API_KEY" \
     -H "Authorization: Bearer TU_API_KEY"
```

---

## Estructura de la Respuesta

El servidor siempre responderá con un código HTTP `200 OK` y un Arreglo JSON conteniendo un solo objeto con la tasa solicitada:

```json
[
  {
    "id": "6f92db13-a483-436a-8018-5c5897b70664",
    "moneda": "USD",
    "tasa": 745.6371,
    "tasa_formateada": "745,64",
    "fecha_valor_texto": "Jueves, 30 Julio 2026",
    "fecha_valor_fecha": "2026-07-30",
    "creado_en": "2026-07-30T06:46:49.866062+00:00"
  }
]
```

### Diccionario de Datos
*   **`moneda`**: La divisa de referencia (Siempre "USD").
*   **`tasa`**: El valor numérico de tipo flotante (Float). Úsalo para operaciones matemáticas.
*   **`tasa_formateada`**: El valor en formato de texto (String), con dos decimales y separador de coma, listo para la UI de usuario.
*   **`fecha_valor_fecha`**: La fecha real legal a la que pertenece esta tasa en formato `YYYY-MM-DD`.
*   **`fecha_valor_texto`**: El texto exacto extraído de la página oficial del BCV.
