# Fase 5 — matriz de elegibilidad y guía del operador

Solo OWNER con MFA puede operar; no se conceden permisos nuevos a administradores de oficina ni se habilitan roles SUPPORT/OPERATOR sin un proceso de asignación aprobado. Cada acción tiene capacidad independiente. Las mutaciones requieren TOTP verificado en los últimos 10 minutos; renovar el token no renueva esa antigüedad.

| Acción | Permiso | Estados origen | Precondiciones | Efecto | Prevención de duplicados | Confirmación | Verificación |
|---|---|---|---|---|---|---|---|
| Nueva evidencia de equipo | recovery.diagnostics | Equipo inscrito, no revocado | Oficina y equipo exactos | Esperar próximo heartbeat autenticado; no ejecutar comandos ni firmas | Solicitud durable y clave idempotente | Motivo y destino | Heartbeat posterior a la solicitud; sin llegada: desconocido |
| Conciliar evidencia | recovery.reconcile | Cualquier estado conservado | Referencias de oficina válidas | Lectura de firma/artefactos, versiones, intentos o aceptaciones; ninguna reparación | Consulta auditada; no cambia negocio | Motivo | Hechos separados de ausencia de evidencia; incertidumbre no autoriza reintento |
| Reintentar firma | recovery.signing.retry | FAILED o WAITING_FOR_OPERATOR | Intentos disponibles, error previo seguro, sin firma ni artefacto pendiente, equipo listo con certificado coincidente; reglas del dominio | Reencolar un elemento existente; puede producir una firma real al procesarse | Lock de oficina del dominio, revisión de intento, unicidad de firma, intención durable compartida | MFA reciente, motivo y texto exacto del destino/impacto | Firma validada y estado COMPLETED posteriores; mostrar resto del trabajo |
| Cancelar firma en cola | recovery.signing.cancel | QUEUED, intento 0 | Sin inicio/artefactos/firma | Cancelación mediante servicio de firma | Mismo lock que agentes; guard beforeSigningOnly | MFA reciente y destino exacto | Estado CANCELLED confirmado |
| Reintentar generación de reporte | recovery.report.retry | FAILED | Solo GENERATE, sin force/deliverAfter, sin resultado/versión existente del período, sin hijos de reintento | Crear trabajo mediante servicio existente; scheduler lo procesa | Clave estable, lock de fila y transacción común con registro de acción | MFA reciente; sin envío de correo implícito | Trabajo hijo SUCCEEDED con versión confirmada o NO_ACTIVITY |
| Cancelar reporte en cola | recovery.report.cancel | QUEUED, intento 0 | No ejecutado ni reclamado | Cancelación del servicio de reportes | Actualización condicional contra claim concurrente | MFA reciente y destino exacto | Estado CANCELLED |
| Revocar equipo inscrito | recovery.device.revoke | No revocado | Impacto de colas explícito | Revocación existente, invalidar sesiones/challenges; no cancela trabajos | Lock del dominio y transacción con auditoría | MFA reciente, motivo y confirmación exacta de interrupción | revokedAt y ausencia de sesiones; trabajos pendientes se mantienen visibles |
| Reintentar recibo / correo / entrega incierta | No habilitado | Ninguno en este Centro | Falta conciliación autoritativa/idempotencia suficiente del servicio para ese caso | Ninguno | Rechazo server-side | Se muestra el bloqueo | Solo consulta de evidencia; timeout no prueba ausencia de efectos |
| Habilitar/deshabilitar cuentas | No habilitado | Ninguno | No existe servicio administrativo de ciclo de vida que abarque sesiones y último propietario | Ninguno | No hay endpoint de mutación de cuentas | Bloqueado | No puede eliminarse el último OWNER mediante este Centro |

La evidencia fresca de dispositivo es pasiva: el protocolo actual solo publica heartbeats cada 30 segundos y no acepta comandos de diagnóstico. La acción solicita conservar la próxima observación autenticada; no promete una inspección remota inmediata ni despierta equipos apagados. Una sesión local de PIN puede publicar la última observación pública del token: no se declara nuevo sondeo físico del token.

Las categorías no habilitadas son límites comprobados de los servicios actuales, no estados reseteados para forzar un reintento. Ninguna acción resuelve incidentes automáticamente. No se despliega ni se ejecutan operaciones reales durante pruebas.

## Uso del operador

1. Acceder como propietario explícitamente provisionado por el bootstrap de la fase 2, completar MFA y abrir `/operaciones/recuperacion`. Ningún usuario se promueve automáticamente. SUPPORT y OPERATOR siguen sin acceso.
2. Seleccionar tipo, oficina e identificador exacto. Para firma se usa el ID de `SigningItem`; para recibos, la reserva de generación; para correo, el destinatario de despacho. Consultar elegibilidad y verificar que el destino sea el correcto.
3. Conciliar primero la evidencia cuando exista incertidumbre. Esta consulta no elimina incertidumbre del proveedor, no autoriza nuevos intentos y no confirma una reparación.
4. Para una mutación, verificar TOTP nuevamente en `/mfa` si pasaron diez minutos. Elegir la acción elegible, leer el impacto, indicar motivo sin secretos y escribir el texto exacto solicitado. Reencolar firma puede producir una firma real; revocar puede impedir que el equipo publique resultados ya producidos localmente.
5. Conservar la vista si hay timeout y reenviar con la misma clave. No generar otra intención para sortear `OUTCOME_UNKNOWN`. Abrir el registro de acciones para revisar correlación y estado.
6. Consultar evidencia posterior. `ACCEPTED` solo significa solicitud aceptada; `RUNNING` indica trabajo observado; `PARTIAL` exige revisar elementos restantes o intervención local. `SUCCEEDED` de una conciliación significa únicamente lectura completada. Resolver un incidente requiere revisar aparte todas sus consecuencias.

## Límites y activación

- No se requieren nuevas credenciales externas. Se reutilizan la base configurada, el propietario explícito con MFA y los workers existentes. No se ejecutó un bootstrap ni se concedieron permisos durante esta fase.
- La migración aditiva `20261121000000_operations_recovery` fue revisada, comprometida en `58d5cb8`, aplicada mediante `migrate deploy` y seguida de `generate`. No hubo reset ni `migrate dev`.
- Los reintentos de firma admiten únicamente `PIN_REQUIRED`, `PIN_INCORRECT`, `PIN_EXPIRED` y `DRIVER_MISSING`, con todas las demás precondiciones de la matriz. Extracción del token, error genérico del controlador, actualización del agente, timeout, almacenamiento y validación pueden ser posteriores a la firma: quedan bloqueados.
- Un reporte reintentado permanece en cola hasta que el procesador de reportes existente lo reclame. No se inicia el worker dentro de la transacción administrativa ni se habilita entrega implícita.
- La captura de heartbeat requiere que el agente vuelva a comunicar. No existe comando de diagnóstico remoto en el protocolo inspeccionado. La verificación es explícita desde la interfaz; no hay un nuevo reconciliador automático.
- Un resultado incierto sin evidencia concluyente permanece bloqueado. No hay botón de desbloqueo, reset, reenvío de correo, modificación de cuentas, ejecución de comandos ni envío de PIN.
- Revocación significa inscripción invalidada y sesiones eliminadas; no garantiza detener criptografía ya iniciada localmente. Requiere conciliación posterior de trabajos pendientes.
- El registro conserva las solicitudes y verificaciones. La auditoría crítica y el cambio de negocio se confirman juntos; si falla la auditoría, se revierte el cambio. No se purga automáticamente este historial administrativo.

## Verificación

- Suite general: 525 pruebas aprobadas, 101 omitidas por sus requisitos de entorno. Las comprobaciones aisladas de esta fase se ejecutaron adicionalmente: PostgreSQL, consultas/permisos y Chromium aprobadas. Políticas y autorización tras el último ajuste: 19 pruebas aprobadas, incluida API manipulada y MFA reciente.
- Integración PostgreSQL en esquema desechable: operadores concurrentes, claves repetidas, una sola cancelación/cola de firma/trabajo hijo, aislamiento de oficina, recuperación parcial, rechazo de incertidumbre, heartbeat posterior, revocación de inscripción sintética y rollback por fallo de auditoría. No se firmaron documentos ni enviaron correos ni se revocaron equipos reales.
- Chromium aislado con respuestas simuladas: confirmación exacta, reutilización de clave tras timeout, verificación posterior y vista móvil de 390 px sin desbordamiento. No se validó una sesión real de propietario con MFA de extremo a extremo.
- Compilación de producción, TypeScript y comprobación UTF-8. Los controles generales `check:auth-audit` y `check:infrastructure` detectan problemas previos en `app/api/auth/forgot-password/route.ts`; no corresponden a los endpoints nuevos.
