# Centro de Operaciones — Fase 4

Implementado localmente. No se desplegó, no se activaron destinatarios reales y no se enviaron mensajes reales. La migración aditiva `20261120030000_operations_alerts` está comprometida en `d967324`, aplicada mediante Prisma local `migrate deploy` y seguida de `generate`. No se usó reset ni migrate dev.

## Pantallas y guías

- `/operaciones/guias`: catálogo determinista, versión `2026-11-20.1`.
- Incidentes y equipos muestran la guía asociada al código observado, con fechas de evidencia y sin presumir frescura. Los fallos genéricos de generación/despacho usan la operación registrada para seleccionar una categoría, sin inferir una causa raíz.
- Cada guía incluye qué pasó, a quién afecta, impacto, evidencia/causa confirmada, posibles causas, revisión ordenada, acción recomendada, verificación y mensaje sugerido.
- Cubre agente/red/disco, token/controlador, certificado, PIN e intervención, validación/integridad, TSA/revocación, leases/colas/limpieza, generación de reportes/recibos, despachos y procesos programados. Usa códigos de `signing/core.ts`, `deviceProtocol.ts`, `monitoring.ts`, los trabajos de reportes y las señales operacionales. `SCHEDULE_MISSED`, `REPORT_STALLED` y `EMAIL_STALLED` son señales calculadas de esta fase, no supuestos errores históricos.
- Un código desconocido mantiene causa sin confirmar. Las hipótesis de la guía nunca sustituyen la evidencia ni el campo de causa confirmada del incidente. No hay IA ni reparación automática.

## Política de alertas

`/operaciones/alertas` permite configurar política global o por oficina, destinatarios propietarios, horarios, zona IANA, hora del resumen, persistencia, cooldown y escalamiento. Una oficina sin política propia hereda la global. Un incidente de varias oficinas usa política global; el alcance es la cantidad de oficinas distintas capturadas, no una suposición.

Valores predeterminados: envíos desactivados, sin destinatarios, America/Santiago, lunes–viernes 08:00–18:00, persistencia 10 min, cooldown 60 min, escalamiento 120 min, resumen 08:00. Horarios nocturnos pertenecen al día de inicio; inicio=fin significa 24 horas en los días seleccionados. Los horarios aplican a avisos urgentes; el resumen tiene su propio horario diario, incluso fines de semana.

Estados: persistencia pendiente → abierta → reconocida → recuperación por verificar → verificada. Una recurrencia inicia una nueva generación y una nueva ventana de persistencia. Reconocer suprime futuros avisos de esa alerta; verificar recuperación exige que previamente se haya observado la desaparición de la condición. Esto no equivale a ejecutar una prueba de firma ni a resolver automáticamente un incidente.

Avisos iniciales para severidad crítica después de persistencia; escalamiento único para condiciones persistentes con trabajo pendiente o varias oficinas afectadas. Máximo un aviso inicial y un escalamiento por generación/destinatario; el cooldown no se usa para repetir cada ocurrencia. Un equipo sin trabajo pendiente no dispara correo, aunque esté offline. El estado del token solo se interpreta con heartbeat reciente; offline no significa token desconectado.

Ventanas de mantenimiento globales o por oficina: inicio/fin UTC, máximo 7 días, motivo y auditoría; cancelación anticipada auditada. Expiran automáticamente por fecha. Suprimen avisos sin borrar evidencia ni declarar recuperación. Antes del envío se vuelven a comprobar mantenimiento, horario, reconocimiento, generación y autorización del destinatario.

La evaluación recorre como máximo 25 incidentes, 25 equipos y 10 oficinas por turno, con cursor persistido por cada categoría y presupuesto de 30 segundos por categoría. En instalaciones grandes, completar una vuelta requiere varios ticks. Un registro que no aparece en una página nunca se considera recuperado. Incidentes requieren estado terminal observado; equipos y agregados usan evidencia actual. La desaparición de un agregado significa que su condición de alerta ya no se observa, **no** prueba que todos sus trabajos hayan terminado con éxito; se exige verificación humana.

## Resumen y entrega

El resumen usa el día calendario local anterior con inicio inclusivo y fin exclusivo, incluidas jornadas de 23/25 horas por DST. Guarda una instantánea y una clave estable oficina/zona/día/destinatario; reintentos no recalculan contenido. Incluye incidentes nuevos/sin resolver, oficinas afectadas, firmas/reportes/recibos fallidos o bloqueados, despachos fallidos/parciales, programaciones vencidas, certificados próximos a vencer/vencidos y recuperaciones por verificar. Se diferencia el período histórico de los contadores de estado actual.

La cola registra PREVIEW, QUEUED, SENDING, RETRY, FAILED, ACCEPTED y CANCELLED. PREVIEW nunca se promueve automáticamente a envío. Se muestran contenido diagnóstico generado, intentos y códigos seguros; no cuerpos de correo de clientes. ACCEPTED solo confirma aceptación del proveedor, no entrega al buzón ni rebote. Los fallos de notificación no llaman al capturador de incidentes y no generan alertas recursivas. La ejecución del scheduler también deja un heartbeat visible en Salud de servicios.

Se reutiliza `createSystemMailAdapter`, pero se exige Resend explícitamente para disponer de idempotencia estable; no se cae silenciosamente en SMTP de una oficina. Tres intentos como máximo, backoff 1/2/4 minutos y ventana máxima de 20 horas desde creación, dentro de la retención de 24 horas de claves de [Resend](https://resend.com/changelog/idempotency-keys). Claims mediante actualización condicional; recuperación de claims SENDING tras 5 minutos. Hasta 3 entregas por tick. Si cambia el destinatario canónico, remitente o URL durante un reintento, se bloquea con código seguro para evitar reutilizar una clave con otro payload. Un envío agotado requiere investigación; no se agrega un botón de reenvío en esta fase.

## Activación exacta (pendiente)

1. Completar el bootstrap de OWNER y MFA descrito en `operations-center-phase2.md`. No se promueve automáticamente a nadie. Abrir `/operaciones/alertas` con una sesión OWNER+AAL2.
2. Configurar en servidor, sin prefijo NEXT_PUBLIC:
   - `OPERATIONS_NOTIFICATIONS_SECRET`: secreto aleatorio de al menos 32 caracteres, exclusivo del scheduler.
   - `OPERATIONS_CENTER_URL`: origen HTTPS del sitio, sin ruta, query, fragmento ni credenciales; por ejemplo `https://notifica.example`.
   - Mantener `OPERATIONS_NOTIFICATIONS_ENABLED=false` (o ausente) durante verificación.
3. Seleccionar explícitamente destinatarios OWNER activos en la política global o de oficina. Puede guardarse con autorización de comunicaciones desmarcada para generar vistas previas. Configurar horarios, zona y resumen. No se admiten direcciones arbitrarias ni administradores de oficina sin grant de plataforma. Se verifican grants al guardar, encolar y antes de enviar.
4. Configurar un scheduler autorizado con **POST** `https://<dominio>/api/internal/operations/notifications`, encabezado `Authorization: Bearer <OPERATIONS_NOTIFICATIONS_SECRET>`, sin cuerpo, cada **5 minutos**, timeout de invocación hasta 300 segundos. Hay un lock durable de cinco minutos; un solapamiento devuelve `skipped:true`. No se creó un scheduler externo ni se modificó `vercel.json`.
5. Revisar las vistas previas de `/operaciones/alertas` y el heartbeat. Si no hay destinatarios seleccionados, no se encolan mensajes ni vistas previas. Si faltó el scheduler un día completo, no se reconstruyen resúmenes históricos: el siguiente tick prepara el último día local concluido. La primera ejecución posterior al horario configurado prepara el resumen; no se garantiza precisión al minuto.
6. **Solo tras autorización explícita para envíos reales**, configurar `SYSTEM_MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `SYSTEM_MAIL_FROM_EMAIL` y opcionalmente `SYSTEM_MAIL_FROM_NAME`, verificar el dominio/remitente en Resend, marcar autorización de comunicaciones en la política y establecer `OPERATIONS_NOTIFICATIONS_ENABLED=true`. Requiere las tres condiciones: switch del servidor, política habilitada y destinatarios elegibles. No se realizaron estos pasos de activación.
7. Una prueba de correo real necesita un destino expresamente autorizado. Las pruebas realizadas aquí usan mocks y navegador aislado. Verificar recepción externamente antes de afirmar entrega; no hay webhooks de entrega/rebote agregados.

## Exportes privados

En detalles de incidentes/equipos: «Descargar diagnóstico JSON privado».

- GET `/api/operaciones/exportar/incidentes/<id>` o `/api/operaciones/exportar/tokens/<id>`; `?office=<id>` restringe el paquete.
- Guard de permiso `operations.export`, exclusivo de OWNER+MFA, además del guard de API. Respuesta `private, no-store`, adjunto JSON y `nosniff`; sin enlace público firmado ni archivo persistido en carpeta pública.
- Auditoría obligatoria antes de responder. Si falla, no se entrega el paquete.
- Máximo 100 ocurrencias/intentos, indicador `truncated`, referencias, estados, fechas, versión de agente/release y errores de catálogo seguros. Se omiten notas libres, hipótesis editadas, sujetos de certificados, correos/identidades personales, claves, PINs, cookies, leases secretos, contenido de documentos y payloads. La información histórica ausente no se reconstruye.

Las nuevas tablas tienen RLS habilitado y permisos retirados a anon/authenticated. Los permisos `alerts.manage` y `operations.export` no habilitan roles futuros. Las mutaciones requieren mismo origen, cuerpo acotado, cuota y revisión optimista; se auditan políticas, ventanas, reconocimiento, verificación y transiciones.

## Verificación y límites

Pruebas de estados, persistencia, cooldown/escalamiento, deduplicación de múltiples ocurrencias, mantenimiento, recuperación y recurrencia, horario nocturno, DST 23/25 horas, contenido del resumen, destinatarios revocados, claims, reintentos, enlaces privados y exportes sanitizados. El navegador aislado comprueba política, mantenimiento UTC, conflicto 409 y móvil, sin llamar a APIs reales. Consultas reales de las 12 secciones y RLS/permisos de las diez tablas privadas verificadas sin promover cuentas ni enviar correo.

La sesión real OWNER+MFA y la recepción de un correo real quedan pendientes de credenciales/destino autorizado. Los chequeos estáticos `check:auth-audit` y `check:infrastructure` siguen señalando el problema preexistente de wrappers en `app/api/auth/forgot-password/route.ts`. No se inició Fase 5.

Resultados: suite general 516 aprobadas / 98 omitidas por sus condiciones; tras los ajustes finales, 43 pruebas focalizadas aprobadas y la prueba adicional de navegador aprobada. Build final de producción correcto, incluyendo comprobación de tipos. UTF-8 y diff whitespace correctos. Smoke HTTP del build: APIs de guías/alertas/exportes y mutaciones anónimas 401; scheduler sin credencial 401; páginas privadas 307 al login. Servidor local detenido al finalizar. Se mantiene el aviso previo de `<img>` del QR MFA.
