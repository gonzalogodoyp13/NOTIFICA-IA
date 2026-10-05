# Actualizar PCs de NOTIFICA Windows 0.12.0 a 0.13.0

Usa el mismo ZIP `NOTIFICA-Windows-0.13.0-managed.zip` para todos los PCs.
En un PC existente ejecuta **Update-Notifica.ps1**. En uno nuevo, ejecuta
**Install-Notifica.ps1** y sigue INSTALACION.md. GitHub no instala actualizaciones automáticamente.

El actualizador conserva inscripción, oficina, rol, clave del dispositivo,
configuración del token/TSA, certificados públicos y documentos. En firmantes
solo cambian las tres rutas de los runtimes incluidos. No pide un código de
inscripción nuevo. La sesión de firma remota se cierra al reiniciar el servicio;
tendrás que habilitarla nuevamente con el PIN.

## 1. Preparación

1. Despliega primero la aplicación web/servidor con los nuevos endpoints de carpeta
   compartida y archivo. Publicar esta Release no despliega el servidor.
2. Empieza con un receptor y después el firmante. Valida ambos antes de actualizar
   el resto. Mantén la Release como pre-release durante este piloto.
3. Inicia sesión remota en el PC. Necesitas Windows 11 x64, permisos de administrador
   y la carpeta de documentos en un disco NTFS local.
4. En el firmante, cierra la sesión de firma remota desde NOTIFICA y espera a que
   no haya firmas pendientes. Cierra PDF abiertos y elige **Salir de la bandeja**.
   Salir de la bandeja por sí solo no cierra la sesión de firma.
5. Descarga el ZIP y SHA256SUMS.txt de esta Release privada. No uses **Source code**.
   Comprueba el ZIP contra la huella publicada y conservada por ti:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Descargas\NOTIFICA-Windows-0.13.0-managed.zip'
   ```

   SHA-256 esperado: `HASH-ZIP-PUBLICADO-EN-LAS-NOTAS`.
6. Extrae en una carpeta nueva, por ejemplo `C:\NotificaUpdate-0.13.0`. Dentro deben
   estar Update-Notifica.ps1, distribution.json y payload.zip. No extraigas encima
   de Program Files ni ProgramData.

## 2. Comprobar sin actualizar

Abre **Windows PowerShell de 64 bits como administrador**:

```powershell
Set-Location -LiteralPath 'C:\NotificaUpdate-0.13.0'
$manifestHash = 'HASH-DE-DISTRIBUTION-JSON-PUBLICADO-EN-LAS-NOTAS'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Notifica.ps1 `
  -ExpectedManifestSha256 $manifestHash -Preflight
```

La guía adjunta a la Release ya tiene las huellas completadas. En la guía dentro
del ZIP, sustituye los marcadores por las huellas de las notas. No uses un hash
calculado del manifiesto descargado como si fuera una referencia independiente.

Resultado esperado: `PREFLIGHT_PASSED: 0.12.0 -> 0.13.0; no changes made`.
Revisa paquete, versión anterior, servicio, tarea de bandeja, configuración,
disco y ausencia de diario de firma pendiente. Todavía no instala nada.

## 3. Actualizar

En la misma ventana, ejecuta:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Notifica.ps1 `
  -ExpectedManifestSha256 $manifestHash
```

Resultado esperado: **UPDATED_TO_0_13_0_ENROLLMENT_PRESERVED**.
El script extrae una versión nueva, detiene el servicio y la tarea de bandeja,
conserva identidad/configuración, activa la versión y comprueba su arranque.
Deja la versión anterior intacta. No desinstales ni borres carpetas para actualizar.

ExecutionPolicy Bypass afecta solo a ese proceso; no cambia la política global.
El paquete sigue sin firma de editor, como la distribución administrada anterior.
Si una política corporativa lo bloquea, respeta esa política.

## 4. Comprobar el resultado

1. Ejecuta:

   ```powershell
   Get-Service NotificaSigningAgent
   (Get-Content 'C:\ProgramData\NotificaIA\Agent\managed-installation.json' -Raw | ConvertFrom-Json).version
   ```

   Debe indicar `Running` y `0.13.0`. Si falta la bandeja, cierra e inicia la sesión
   Windows del usuario configurado. No vuelvas a inscribir el PC.
2. Confirma en NOTIFICA que conserva dispositivo/oficina. En la bandeja selecciona
   **Abrir firmados de la oficina** y espera la primera sincronización.
3. `Oficina-<id>` muestra firmados FEA de los últimos 50 días; los PDF se descargan
   al abrirlos. Las copias antiguas siguen fuera de esa nueva subcarpeta.
4. Comprueba que receptor y firmante ven y pueden abrir el mismo PDF. Busca firmas
   de más de 50 días en **Firmados** de la aplicación.
5. En el firmante, habilita nuevamente la sesión remota con token/PIN. Realiza una
   firma de prueba autorizada y comprueba que aparece en ambos PCs.
6. Guarda PC, oficina, versión, hash y resultado. Repite en los demás equipos.

## Si aparece un error

| Mensaje | Acción |
| --- | --- |
| ALREADY_INSTALLED | El mismo paquete ya figura instalado; comprueba servicio y carpeta. |
| REVIEW_ACTIVE_WORK | Resuelve el intento pendiente en NOTIFICA. No borres signing-work.json ni vuelvas a firmar a ciegas. Después repite. |
| MANAGED_INSTALLATION_REQUIRED / UNSUPPORTED_UPGRADE_SOURCE | No es una instalación administrada completa 0.12.0. Conserva error y versión para preparar su migración. No instales encima ni desinstales para forzarlo. |
| SIGNED_INSTALLATION_REQUIRES_SIGNED_UPDATER | Usa el canal firmado de esa instalación. |
| UPDATE_FAILED_PREVIOUS_VERSION_RESTORED | Falló y restauró la versión anterior. Comprueba servicio/bandeja y conserva el paquete para investigar. |
| RECOVER_INTERRUPTED_UPDATE_FIRST / RECOVERY_REQUIRED_JOURNAL_PRESERVED | Con las firmas detenidas, recupera con el comando siguiente y el mismo paquete. |
| CLOUD_FOLDER_REQUIRES_NTFS | La carpeta usa un disco incompatible. Planifica su migración antes de modificar rutas/documentos. |
| Otros errores de propiedad/configuración/integridad | Conserva el mensaje exacto. No cambies claves, registro ni estado para saltar controles. |

Recuperar una actualización interrumpida, desde la misma carpeta y con el mismo hash:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Notifica.ps1 `
  -ExpectedManifestSha256 $manifestHash -Recover
```

Resultado esperado: `PREVIOUS_VERSION_RESTORED`. Restaura 0.12.0 sin eliminar PDF ni
identidades. Investiga el error y después repite preflight/actualización. Si hay
trabajo de firma sin resolver, la recuperación también se detiene para conservarlo.

La recuperación no permite degradar una actualización ya completada. Tras desplegar
el servidor nuevo, la versión antigua ya no recibe nuevos PDF por el sistema de
entregas retirado; termina la actualización a 0.13.0. Entretanto usa la aplicación
para consultar documentos.

Los checkpoints privados quedan en `C:\ProgramData\NotificaIA\Agent\update-backups`.
No subas backups, configuración real, claves, diarios ni documentos a GitHub.

## Validación

Hay pruebas automatizadas de integridad y transacciones de actualización, incluidos
fallos y conservación de datos. El agente tiene pruebas reales de Windows Cloud
Files con dos dispositivos simulados. Durante la preparación no se ha reemplazado
el servicio instalado de producción: la actualización elevada y la firma con token
real deben aceptarse en el piloto descrito arriba.
