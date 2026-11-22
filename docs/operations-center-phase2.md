# Centro de Operaciones privado

## Pantallas y alcance

El acceso comienza en `/operaciones` y exige una concesión `OWNER` activa más MFA AAL2 validado por Supabase. La concesión es independiente de `isOfficeAdmin`, no procede de metadata de signup y no tiene API de administración pública. Roles desconocidos, incluido SUPPORT u OPERATOR, no tienen permisos.

- Resumen general: incidentes abiertos/críticos, oficinas y usuarios afectados, reportes fallidos o con lease vencido, firmas y recibos fallidos, despachos fallidos/parciales, colas y evidencia vencida. Los indicadores consultan datos reales. La ausencia de evidencia no significa salud confirmada.
- Incidentes: búsqueda por referencia, usuario, trabajo, operación o release; filtros por oficina, fechas, estado y severidad; conteos y ocurrencias. Detalle con impacto, causa confirmada documentada, hipótesis separadas, próximos pasos, asignación y notas.
- Oficinas: directorio y detalles con usuarios, incidentes, equipos, trabajos y alertas del monitor de firma existente.
- Usuarios: búsqueda por correo o ID, actividad registrada, referencias de soporte y trabajos de firma/reportes.
- Control de tokens: varias filas por oficina, una por equipo; detalle del certificado seleccionado, heartbeat, versión del agente, intervención reportada, intentos, últimos cambios disponibles y última firma correcta.
- Trabajo pendiente: consulta diagnóstica de reportes y firmas, con enlaces a intentos, equipos e incidentes. No ofrece reintentos, cancelaciones, revocaciones, modificaciones de cuentas ni firmas de prueba.

Las listas tienen 25 filas por página/sección y consultas acotadas. La paginación de un detalle avanza sus secciones conjuntamente. El filtro de fechas usa UTC y la visualización horaria usa America/Santiago. Directorios, conectividad y colas representan estado actual; las fechas filtran historia. Una referencia de soporte UUID exacta sin fechas explícitas busca toda la evidencia retenida.

Las vistas visibles se refrescan cada 30 segundos. El detalle editable de un incidente se actualiza manualmente para no perder notas en curso. Una vista de más de un minuto o sin conexión muestra una advertencia de evidencia vencida.

## Bootstrap explícito del primer propietario

No se ha promovido ningún usuario. Ejecutar este comando concede acceso global a una cuenta: debe hacerlo una persona autorizada con acceso privilegiado a la base.

1. Identificar el `users.id` exacto de la cuenta activa y provisionada. No usar el correo ni metadata del navegador para otorgar la concesión.
2. Verificar el destino de `DATABASE_URL`/`DIRECT_URL` y ejecutar con Prisma local: `migrate status`, `migrate deploy`, `generate`, en ese orden. Nunca usar `migrate dev` ni reset.
3. Ejecutar desde la raíz, sustituyendo los valores explícitamente:

```powershell
node scripts/bootstrap-platform-owner.mjs --user-id "ID_LOCAL" --operator "IDENTIDAD_DEL_OPERADOR" --reason "Referencia de autorización para el primer propietario" --confirm-owner "ID_LOCAL"
```

El comando usa una transacción y un bloqueo de bootstrap, requiere que la cuenta esté activa, rechaza un bootstrap posterior y registra `owner.bootstrap` en `platform_audit`. El operador CLI es una identidad declarada por quien tiene acceso privilegiado; no equivale a una sesión de usuario web. No expone una vía para otorgar acceso a través de la aplicación. No se suministran comandos para conceder roles adicionales en esta fase.

4. Iniciar sesión como esa cuenta, abrir `/operaciones` y completar `/mfa`. Si no existe un factor TOTP verificado, registrar uno con una aplicación autenticadora y verificar el código. Con varios factores verificados, elegir el correspondiente.
5. Abrir `/operaciones` otra vez y comprobar una referencia de soporte real. La API bajo `/api/operaciones` aplica las mismas comprobaciones y también verifica origen y cuota en las escrituras.

Prerequisito externo: habilitar TOTP en la configuración de Supabase Auth. La configuración del proveedor y un inicio de sesión real con MFA no se han verificado mediante una cuenta propietaria. Un fallo de autenticación/MFA deniega el acceso; no existe bypass de desarrollo ni variable de entorno que convierta usuarios en propietarios. La recuperación de un factor perdido requiere el procedimiento seguro de administración de identidad de la organización, fuera de estas pantallas.

## Auditoría y concurrencia

Las concesiones y la auditoría de plataforma están en tablas privadas con RLS y sin grants para `anon`/`authenticated`. El historial de negocio permanece independiente. Las consultas de plataforma registran actor, destino y filtros no sensibles en `platform_audit`; los cambios de incidentes registran notas, campos documentados, estado anterior y asignación anterior en la misma transacción.

La revisión optimista impide sobrescribir cambios concurrentes. Cada nueva ocurrencia incrementa la revisión; un incidente RESOLVED que recurre se reabre y registra `incident.reopened` con su referencia. Las recurrencias no borran notas, asignación ni explicación documentada. INVESTIGATING/WAITING/IGNORED se conservan, en lugar de volver a OPEN por cada ocurrencia.

No introducir documentos ni secretos en notas. La UI lo indica y el servidor rechaza patrones evidentes de credenciales; esto no es un clasificador completo de información sensible. Las notas son texto interno aportado por el propietario, no evidencia automática de causa. No hay exportaciones en esta fase.

## Límites de la evidencia de tokens

Se inspeccionaron `TokenProbe.cs`, `FailurePolicy.cs`, `deviceProtocol.ts` y el procesamiento de heartbeat. El protocolo reporta un certificado seleccionado por equipo, estado de detección del token, código operacional permitido, versión y heartbeat. No reporta número de serie/identidad física del token ni inventario de todos los certificados instalados.

Un heartbeat de más de 90 segundos, ausente o futuro deja el estado actual como desconocido. Un equipo offline no se interpreta como token ausente. La fecha de vencimiento registrada puede demostrar que ese certificado venció, pero no prueba que siga instalado. El estado de revocación solo se presenta como reportado mientras la evidencia sea reciente. Los códigos de PIN se muestran solo si los reportó el agente y son recientes; nunca se consultan PINs ni claves privadas.

La cola por certificado pertenece a la oficina, puede aparecer en varios equipos y no debe sumarse entre esas filas. El historial de `device.health_changed` no siempre contiene valores anteriores: se muestra el evento disponible sin inventarlos. La firma más reciente corresponde a un intento SUCCEEDED del equipo, no a una prueba nueva.

El resumen no comprueba disponibilidad externa ni garantiza salud global. Utiliza evidencia y mantenimiento existentes; el monitor externo y nuevas capacidades de supervisión pertenecen a fases posteriores. Incidentes sin eventos retenidos, fallos previos a Phase 1 y causas no registradas no se reconstruyen. Las causas confirmadas se documentan manualmente y deben citar evidencia.

## Verificación

- `vitest run`: suite general, incluidos acceso, permisos futuros denegados, MFA/identidad, estados de token, estado agregado, revisión optimista y renderizado de pantallas.
- `TEST_OPERATIONS_DATABASE=true` con `vitest run tests/integration/operations-database.test.ts`: consultas contra datos reales y revisión de RLS/grants. La autorización se sustituye solo dentro del test, sin crear una concesión. Se eliminan únicamente sus registros de auditoría sintéticos.
- `TEST_DIAGNOSTICS_DATABASE=true` con el test de diagnósticos: concurrencia, conteos y reapertura real.
- `TEST_OPERATIONS_BROWSER=true` con `vitest run tests/integration/operations-browser.test.ts`: navegador aislado con el componente real de seguimiento; guardado, conflicto y vista móvil. Sus respuestas simuladas existen solo en el test, nunca en el producto.

Las comprobaciones estáticas de auth e infraestructura todavía identifican la ruta preexistente `/api/auth/forgot-password` por no usar su wrapper esperado. No se cambia ese flujo público como parte del Centro de Operaciones.

Resultado de esta implementación: build de producción completado; suite general con 461 pruebas aprobadas; consultas reales y RLS verificadas; recurrencia/revisión/historial verificados en base; flujo de guardado/conflicto y ancho móvil aprobado en Chromium. El smoke HTTP de la aplicación compilada devolvió 307 al login para páginas privadas anónimas y 401 para APIs manipuladas, con `private, no-store`. La visualización con una cuenta OWNER real y MFA queda pendiente del bootstrap autorizado. Las migraciones y el esquema quedaron registrados en el commit `87765bc`; no se realizó despliegue.

Referencias de MFA verificadas: https://supabase.com/docs/guides/auth/auth-mfa/totp y https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel.
