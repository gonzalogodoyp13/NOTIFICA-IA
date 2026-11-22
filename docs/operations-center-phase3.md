# Centro de Operaciones — Fase 3

Implementado localmente; no desplegado. Se mantiene el acceso OWNER con MFA (AAL2 y factor verificado), la auditoría de consultas y los filtros por oficina. No se agregan permisos a administradores de oficina. Bootstrap: `docs/operations-center-phase2.md`; no se ha promovido ninguna cuenta.

## Cobertura

- `/operaciones/trabajos`: elementos de firma en todos sus estados, intentos, equipo/certificado, solicitante/documento, edad, último avance, claims vencidos, validación, versión almacenada y entrega al receptor por separado. En el detalle se conservan los vínculos de incidentes y trabajos de reportes.
- `/operaciones/reportes`: programación, zona horaria, próxima ejecución, tolerancia de atraso, último intento/éxito, historial de ejecuciones, generación y despacho separados. La cola activa se muestra aunque sea anterior al período. Las métricas de vencimiento usan todo el estado actual de la oficina, independientemente de la página.
- `/operaciones/recibos`: reservas, carga frente a confirmación, fallos, posibles necesidades de conciliación, operaciones masivas registradas y avance de despachos.
- `/operaciones/correos`: aceptación y fallos por despacho, intentos y reenvíos, salud persistida del proveedor y checkpoints de respuestas. No se seleccionan cuerpos, asuntos, direcciones de buzón, cursores, credenciales ni mensajes de error libres.
- `/operaciones/salud`: observaciones persistidas de app, DB, autenticación, metadatos de storage y procesos programados; cola de auditoría; evidencia histórica de validación, revocación y sellado de tiempo. Infraestructura global etiquetada explícitamente; registros de negocio siempre filtrados por oficina.

Listas de hasta 25 filas, consulta de 26 para detectar página siguiente; página máxima 1000. Relacionados anidados acotados a 1 o 5. Fechas predeterminadas: 7 días, rango máximo 366 días. Paginación común por tabla. El panel solo lee evidencia almacenada; no lanza sondas ni reprocesamientos.

## Reglas y límites

- Firma: claims CLAIMED/SIGNING vencidos o sin lease; cola de más de 15 min (regla de atención existente). No se infiere desconexión del token de un equipo offline.
- Reportes: lease vencido o ausente; disponible sin comenzar por más de 15 min; ejecución abierta por más de 60 min como atención, no timeout del procesador. Atrasos de programas usan `latenessThresholdMinutes` real. Un programa sin próxima fecha es desconocido. El siguiente horario almacenado no reconstruye ejecuciones históricas perdidas.
- Recibos: RESERVED/UPLOADED sin actualización por más de 15 min es una alerta de revisión, **no** una autorización de liberar/reintentar. El sistema no registra progreso en vivo de edición masiva; solo el registro final. Los despachos sí tienen contadores persistidos.
- Outbox: PROCESSING sin actualización por más de 5 min utiliza la regla existente. Los estados DEAD y el backlog se muestran aunque no haya excepción reciente.
- `sent`/SENT y sus contadores significan aceptación, nunca entrega al buzón. No hay webhooks de entrega/rebote autoritativos conectados. `dry-run` sigue etiquetado como simulación del procesador.
- El endpoint de auth comprueba disponibilidad del servicio, no un login/MFA completo. Storage comprueba acceso a metadatos, no lectura/escritura de documentos. TSA, revocación y validador no tienen sondeo independiente: éxito histórico no significa salud actual.
- No hay fuente autoritativa de backups, pruebas de restauración ni calendario de mantenimiento del proveedor. Se muestra «No disponible».
- Las rutas legacy de envío diario/mensual encolan trabajos visibles, pero no almacenan un calendario externo esperado. Para detectar ejecuciones omitidas use los programas persistidos y el tick de reportes; no se supone un horario para llamadas legacy.

## Configuración pendiente: monitor y programadores

No se encontró un monitor externo de uptime conectado y no se ha activado ninguno. No se modifica `vercel.json` ni se crean schedulers remotos.

1. En el servidor, configurar `OPERATIONS_MONITOR_SECRET` con un secreto aleatorio de al menos 32 caracteres, exclusivo para este monitor. No usar `NEXT_PUBLIC_`. Mantener las variables existentes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Una credencial ausente produce evidencia desconocida; nunca se inventa una conexión.
2. En el scheduler autorizado, ejecutar **cada minuto** `POST https://<dominio>/api/internal/operations/health` con `Authorization: Bearer <OPERATIONS_MONITOR_SECRET>`. Sin cuerpo. Respuesta 200 `{ok:true,skipped:false}` cuando ejecuta; `skipped:true` si otro tick adquirió la ventana de 60 segundos. 401: credencial inválida; 503: no se pudo completar. Ventana de observación: 180 segundos. Tiempo límite HTTP: 3 segundos por dependencia; consulta DB: 2,5 segundos dentro de transacción; límite de respuesta del tick: 20 segundos. No configurar redirects.
3. Mantener/revisar los schedulers de negocio existentes (no duplicarlos):

| Proceso | Método / ruta | Frecuencia esperada por el panel | Credencial existente |
|---|---|---|---|
| Reportes | POST `/api/internal/reports/tick`, JSON `{"maxJobs":5}` | 1 min; evidencia vence a 3 min | `REPORT_AUTOMATION_SECRET` |
| Firma | GET `/api/internal/signing/maintenance` | 5 min; vence a 10 min | `CRON_SECRET` |
| Respuestas | POST `/api/internal/recibos/replies/sync` | 5 min; vence a 15 min | `REPLY_SYNC_SECRET` |
| Auditoría | POST `/api/internal/activity-outbox/process` | 1 min; vence a 3 min | `ACTIVITY_OUTBOX_SECRET` |

Todas usan `Authorization: Bearer <credencial>`. Son los procesadores existentes: **no** ejecutarlos manualmente como una prueba de salud, pues procesan trabajo real. El monitor nuevo no llama a estas rutas. Un tick dirigido a un trabajo/oficina no refresca el heartbeat global de reportes. Ausencia/vencimiento de heartbeat se muestra desconocido / ejecución esperada no observada. Ajustar `serviceCatalog` si se adopta otra cadencia autorizada.

4. En el proveedor de uptime que se elija, crear un check **GET** a `https://<dominio>/api/health`, cada 60 segundos, timeout 5 segundos, esperar HTTP 200 y JSON `{"status":"ok"}`. Alertar después de 2 fallos consecutivos y recuperación después de 2 éxitos. No enviar credenciales. HTTP 503 contiene únicamente `{"status":"unavailable"}`. Requiere las cuatro observaciones frescas de app/DB/auth/storage; falla cerrado ante falta de datos o DB inaccesible. Cache compartida por proceso de 10 segundos para limitar lecturas, no cache de CDN. No confirma la salud de todo flujo de negocio ni reemplaza el panel.
5. Verificar externamente las respuestas y la recepción de alertas después de un despliegue autorizado. Hasta entonces el monitor externo **no está activo**.

Fuentes oficiales de las sondas: [Supabase Auth health](https://supabase.com/kb/troubleshooting/how-do-i-check-gotrueapi-version-of-a-supabase-project-lQAnOR), [Storage listBuckets](https://supabase.com/docs/reference/javascript/file-buckets-listbuckets). Se descarta el cuerpo de respuesta.

## Persistencia y seguridad

Migración aditiva `20261120020000_operations_health`, comprometida como `5a53245`: tablas `operations_pulses` y `operations_observations`, RLS habilitado y permisos retirados a anon/authenticated. Aplicada con Prisma local `migrate deploy`, seguida de `generate`; sin reset ni migrate dev.

Claves de procesos/servicios fijas; sin payloads de negocio ni errores libres. Latest pulse por clave y como máximo una observación histórica por clave/minuto con advisory lock transaccional. `OPERATIONS_HEALTH_RETENTION_DAYS`: 7 por defecto, acotado a 1–30 días. Limpieza incremental por servicio y por tick; no borra historial de negocio/auditoría. La retención continúa en los heartbeats aunque falte el tick de salud. Las operaciones existentes conservan sus resultados y excepciones; escribir telemetría agrega como máximo dos esperas acotadas de 2,2 segundos por invocación. Los errores del monitor no se reportan recursivamente.

## Verificación

Pruebas de leases, ejecuciones omitidas, frescura, duraciones, timeout, aislamiento de persistencia, fallos parciales sin excepción, rate limit, proyecciones sin secretos, office scope, paginación y controles del endpoint. Consultas reales de las diez secciones y RLS verificadas sin crear grants ni modificar registros de negocio (solo auditoría sintética eliminada al finalizar).

La verificación de UI con una sesión real OWNER+MFA sigue pendiente de credenciales del propietario. Las pruebas de autorización y renderizado son aisladas; no se afirma haber verificado una sesión real.

Resultados del 20-11-2026: build de producción final correcto; suite completa 495 pruebas aprobadas (97 omitidas por sus condiciones), más la prueba adicional de cancelación HTTP aprobada. Prueba real de DB/RLS aprobada después de los cambios finales. Diez pruebas de UI aprobadas, incluida navegación de filtros/paginación con Chromium y revisión móvil aislada. Smoke HTTP sobre el build local: las cinco APIs rechazan anónimos con 401 y sus páginas redirigen al login (307); health devuelve 503 mínimo sin telemetría y el tick sin credencial devuelve 401. Servidor local detenido al terminar. UTF-8 y diff whitespace correctos. `check:auth-audit` y `check:infrastructure` continúan fallando por el problema preexistente de wrappers en `app/api/auth/forgot-password/route.ts`; build conserva el aviso previo de `<img>` del QR MFA.
