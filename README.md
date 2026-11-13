# Tienda Sync — Tu inventario convertido en tienda web

Plantilla de **tienda en línea y panel de administración** para comercios en Venezuela que ya llevan su inventario en un **sistema administrativo**. Toma el reporte de inventario en Excel, publica el catálogo con precios en **dólares y bolívares (tasa BCV automática)** y recibe los pedidos por **WhatsApp**. El dueño la mantiene al día desde el celular, compartiendo el reporte con el panel. No hay que cargar productos dos veces ni cambiar de sistema.

**Diseñada para cualquier sistema que exporte el inventario a Excel** (Fina, Valery, Saint, Profit, A2 o una hoja propia): el importador detecta los encabezados y la persona confirma una sola vez qué columna es cada dato. **Probada en producción con Fina.**

> Basada en un sistema en producción para una perfumería en Venezuela (incluye decants y fichas olfativas, opcionales para otros rubros). Se adapta a un negocio nuevo editando un solo archivo de configuración, los colores y el logo (ver [Adaptar a un negocio](#adaptar-a-un-negocio)).

**Stack:** Next.js 16 (React 19, App Router, Server Actions) · TypeScript · Supabase (Postgres, Auth, Storage, Edge Functions, `pg_cron`, RLS) · Tailwind CSS 4 · ExcelJS · Gemini / Claude · Vitest.

## Funcionalidades

| Parte | Dónde |
| --- | --- |
| Catálogo con filtros, ficha de producto con decants, selector Divisas / Bolívares | `app/(tienda)` |
| Carrito que crea el pedido en la base de datos y abre WhatsApp con el mensaje listo | `app/(tienda)/carrito`, `lib/whatsapp.ts` |
| Panel: resumen, alertas de tasa, sincronización del inventario, pedidos web del mes | `app/admin/(panel)` |
| Importador del reporte de inventario (XLSX de cualquier sistema): mapeo de columnas, se aplica solo cuando es seguro, vista previa cuando hace falta, cola de revisión | `app/admin/(panel)/importar`, `lib/inventario/` |
| Panel instalable (PWA) que recibe el reporte con **"Compartir"** desde Android | `app/manifest.ts`, `app/admin/compartir` |
| Productos: ficha, fotos, decants y **fichas redactadas con IA en segundo plano** | `app/admin/(panel)/productos`, `lib/ia.ts`, `app/api/fichas-ia` |
| Pedidos web: lista y resumen por mes, enlace al WhatsApp del cliente, checklist de entrega | `app/admin/(panel)/pedidos` |
| Configuración: tasa manual, recargo, redondeo, métodos de pago, zonas, equipo | `app/admin/(panel)/configuracion` |
| Tasa BCV automática (BCV con respaldo DolarAPI, respeta la fecha valor) | `supabase/functions/actualizar-tasa` |

## Reglas que el sistema garantiza

- **El sistema administrativo es la única fuente de verdad** para stock y precios en dólares: la web no duplica ventas ni inventario. El precio en bolívares se calcula siempre en la base de datos: `USD × tasa BCV × (1 + recargo %)`, con el redondeo configurado.
- **El cliente nunca envía precios:** `crear_pedido()` los calcula en el servidor y guarda la tasa y el recargo usados en cada pedido.
- **Permisos en la base de datos (RLS)** y funciones con privilegios cerradas a usuarios anónimos. Un empleado no puede cambiar el recargo ni ver los pedidos web aunque manipule la página.
- **Máximo 3 pedidos por hora con el mismo teléfono**, aplicado en la base de datos.
- No se puede pedir más de lo que hay en inventario, y el visitante ve "Disponible", "Últimas unidades" o "Agotado", **nunca el stock exacto**.
- El importador **no oculta productos** si el reporte parece incompleto, y no repite el trabajo si es el mismo archivo.

## Arquitectura

```
Sistema administrativo ──(XLSX)──▶ Panel (PWA) ──▶ lib/inventario/ ──▶ Supabase (Postgres + RLS)
                                                                        │
BCV / DolarAPI ◀── Edge Function actualizar-tasa ◀── pg_cron (cada 2 h) ─┤
Gemini / Claude ◀── /api/fichas-ia ◀────────────── pg_cron (cada 1 min) ─┤
                                                                        ▼
Cliente ──▶ Tienda (Next.js) ──▶ crear_pedido() ──▶ WhatsApp del negocio
```

## Adaptar a un negocio

1. **`marca.config.ts`:** nombre, nombre del panel, sistema administrativo del negocio, ciudad, dirección, textos de la portada, pagos, logo, contexto para la IA y colores de la barra del navegador.
2. **`app/globals.css`:** colores de la marca (bloque `@theme` y modo oscuro).
3. **`public/`:** `logo.png` (PNG transparente, aprox. 3:4) e íconos del panel (`icono-192.png`, `icono-512.png`, `icono-maskable-512.png`, `apple-touch-icon.png`).
4. **Tipografías:** en `app/layout.tsx` (Google Fonts) y las variables `--font-*` de `app/globals.css`.
5. **Desde el panel**, una vez en marcha: WhatsApp del negocio, recargo, redondeo, métodos de pago y zonas de delivery.

## Puesta en marcha

1. **Supabase:** crear el proyecto y ejecutar en el SQL Editor, en orden, las migraciones `0001` a `0008` de `supabase/migrations/`. La `0009` se ejecuta con la guía de fichas con IA (paso 5).
2. **Variables de entorno:** copiar `.env.example` a `.env.local` y completar la URL y la anon key de Supabase. Para las fichas con IA, `GEMINI_API_KEY` (por defecto, con capa gratuita) o `ANTHROPIC_API_KEY` con `TIENDA_IA_PROVEEDOR=anthropic`.
3. **Crear al dueño:** en Supabase, Authentication › Add user, y luego:
   ```sql
   update public.perfiles set rol = 'dueno' where email = 'correo-del-dueno@ejemplo.com';
   ```
4. **Instalar y correr:**
   ```bash
   npm install
   npm run dev        # http://localhost:3000 · panel en /admin
   npm test           # pruebas de la lógica (importador, precios, WhatsApp, tasa)
   npm run typecheck
   ```
5. **Tareas automáticas** (todo desde el panel web de Supabase, sin CLI):
   - Tasa BCV: [`supabase/TASA_AUTOMATICA.md`](supabase/TASA_AUTOMATICA.md)
   - Fichas con IA en segundo plano: [`supabase/FICHAS_IA.md`](supabase/FICHAS_IA.md)
6. **Configurar la tienda** en `/admin/configuracion` y hacer la **primera carga** en `/admin/importar`: elegir el reporte de inventario y confirmar qué columna es cada dato (se recuerda para las próximas veces). Los productos entran como borrador y se publican al completar foto y descripción.
7. **Publicar** en Vercel con las mismas variables de entorno.

## Actualizar el inventario (para el dueño y los empleados)

En el Resumen, **"Actualizar inventario"** → elegir el reporte de inventario descargado del sistema administrativo:

- **Si todo está en orden, se aplica directo** con una confirmación como *"Listo. 132 productos actualizados, 3 nuevos en borrador, 2 por revisar"*.
- **Si algo necesita una mirada** (columnas distintas, reporte incompleto, demasiados productos por ocultar), se muestra la vista previa con el motivo y un botón para aplicar.
- **Si es el mismo archivo que la última vez**, no se toca nada.
- Las filas dudosas nunca bloquean: quedan en "Por revisar".

**Android:** instalar el panel desde Chrome y, desde la app del sistema o del correo, **Compartir** el reporte con el panel. El inventario se actualiza solo.
**iPhone:** Safari › Compartir › *Agregar a inicio*, y desde ahí "Actualizar inventario".

## Limitaciones conocidas

- La importación aplica los cambios en varios pasos, no en una sola transacción. Si falla a mitad, basta con volver a subir el mismo reporte.
- La página del BCV a veces falla o rechaza conexiones de fuera de Venezuela. En ese caso se usa DolarAPI; si ambas fallan, el panel muestra una alerta y se conserva la última tasa válida.
- Las cuentas de cliente (favoritos e historial) tienen tablas y permisos listos, pero aún no tienen pantallas.

## Autor

**Luis Manuel Angulo Ramírez** — Estudiante de Ingeniería en Sistemas (Universidad Metropolitana, Caracas). Desarrollo full-stack, automatización e IA.

- LinkedIn: [luis-angulo-ramirez](https://www.linkedin.com/in/luis-angulo-ramirez)
- GitHub: [@luisma-2601](https://github.com/luisma-2601)

Para implementar esta tienda en tu negocio, escríbeme por [LinkedIn](https://www.linkedin.com/in/luis-angulo-ramirez).
