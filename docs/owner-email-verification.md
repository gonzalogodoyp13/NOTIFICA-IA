# Acceso de propietario por código de correo

Decisión explícita del usuario (21-11-2026): contraseña seguida de código de correo para cada nuevo inicio de sesión de la cuenta propietaria seleccionada. Remitente autorizado: `NOTIFICA IA <contacto@notificaia.cl>`. Esta decisión sustituye el requisito de TOTP para esa concesión concreta; no convierte un OTP de correo en MFA AAL2 de Supabase. La seguridad de la bandeja de correo es crítica porque también recibe recuperación de contraseña.

## Flujo y límites

- Solo una concesión OWNER privada con `verificationMethod=EMAIL` activa este flujo. El email queda fijado por bootstrap explícito y debe coincidir con el usuario local y el correo confirmado por Supabase. No se concede acceso por email, signup metadata ni configuración del navegador.
- Se exige primero login con contraseña validado por Supabase. Un login solo con OTP o enlace de recuperación no lo sustituye. El código se vincula a usuario, email, concesión, `session_id` y fecha de autenticación con contraseña, mediante claims verificados.
- `/login` solicita el código y dirige a `/mfa`. Tanto páginas y APIs de negocio como el Centro bloquean al propietario de correo mientras falta la prueba. La ruta de verificación admite únicamente estado, solicitar código y verificar código; no otorga acceso a datos de negocio.
- Código criptográficamente aleatorio de seis dígitos, incluidos ceros iniciales; vence a los 5 minutos y se consume una vez. Se guarda HMAC-SHA256 con secreto de servidor; nunca el código en claro. Se envía exclusivamente al email canónico confirmado, sin destinatario controlable por cliente.
- Cinco intentos por código, veinte verificaciones por cuenta cada 15 minutos, tres envíos por cuenta/hora y cooldown de 60 segundos. Límites persistidos y bloqueos transaccionales impiden eludirlos con concurrencia. El reenvío invalida el código previo, sin conservarlo en logs.
- Prueba de sesión por 12 horas como máximo; un login nuevo necesita otra. Las mutaciones de recuperación requieren prueba de los últimos diez minutos. Un refresh de JWT no renueva la prueba. Los propietarios TOTP existentes conservan su configuración.
- Misma protección de origen, cuerpo limitado a 1 KiB, respuestas no-cache y errores seguros. Solo Resend explícito: nunca SMTP de una oficina ni dry-run para permitir acceso. Fallos del correo bloquean la verificación. No se puede omitir el código por indisponibilidad del proveedor.
- Solicitud, rechazo, límites y verificación se auditan sin códigos ni hashes. Verificar y auditar se confirman juntos; un fallo de auditoría no otorga acceso. Limpieza acotada de sesiones inactivas por más de 30 días; auditoría conservada.

## Configuración y bootstrap

Migración aditiva comprometida `c38654b`, aplicada usando Prisma local `migrate deploy` y seguida de `generate`. Los roles anon/authenticated no tienen acceso a la tabla privada.

Configurar en el entorno objetivo, sin prefijo público: `OWNER_EMAIL_OTP_SECRET` aleatorio de al menos 32 caracteres, `SYSTEM_MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `SYSTEM_MAIL_FROM_EMAIL=contacto@notificaia.cl`, `SYSTEM_MAIL_FROM_NAME=NOTIFICA IA`. Mantener `APP_ORIGIN` igual al origen HTTPS de acceso. Un cambio del secreto invalida los códigos pendientes; no revoca por sí solo pruebas completadas.

Después de comprobar entorno, identidad y autorización, ejecutar:

```powershell
node scripts/bootstrap-platform-owner.mjs --user-id "ID_LOCAL_CONFIRMADO" --operator "OPERADOR_AUTORIZADO" --reason "Autorización explícita del propietario" --confirm-owner "ID_LOCAL_CONFIRMADO" --verification email --confirm-email "EMAIL_CANONICO_CONFIRMADO"
```

El comando rechaza bootstrap repetido, usuario inactivo o email diferente. No se agrega un endpoint para cambiar el método de otro propietario. No imprimir contraseñas, secretos, QR ni códigos en el chat. La verificación real se realiza por el usuario en su propio navegador y bandeja.

## Verificación

Pruebas de binding de sesión/identidad, acceso sin proof, email modificado/no confirmado, cuenta desactivada, ausencia de grant, TOTP preservado y recencia para mutaciones. Integración PostgreSQL desechable con envío simulado: carreras, uso único, límites, expiración, fallos del proveedor y rollback por fallo de auditoría. UI aislada con códigos ficticios: mensaje de error, cooldown, móvil y navegación después de verificar. No se han enviado códigos reales durante estas pruebas.

Revisar este documento junto con fases 2 y 5: sus referencias a TOTP exclusivo son el diseño original; ahora existe EMAIL solo por configuración explícita de la concesión.
