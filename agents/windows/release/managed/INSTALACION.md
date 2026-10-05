# Instalación Windows administrada por Gonzalo

Edición del 1 de octubre de 2026. Agente 0.13.0.

La carpeta firmada ahora es una vista compartida de la oficina: muestra los últimos
50 días y descarga los PDF al abrirlos. Está disponible en todos los equipos
autorizados, incluido el firmante. El historial completo se consulta en Firmados.
El cambio requiere actualizar el servidor y cada agente; las copias locales de
versiones anteriores se conservan fuera de la nueva subcarpeta `Oficina-<id>`.

Este paquete **no tiene firma de editor de Windows**. Está destinado a instalaciones
que realiza personalmente el responsable por control remoto, desde su repositorio
privado y con una copia verificada del paquete. No requiere comprar un certificado
de firma de código. El certificado FEA del token sí sigue siendo necesario para
firmar documentos; son certificados con funciones diferentes.

**Install-Notifica.ps1** admite instalaciones nuevas y reanudación de su propia
instalación interrumpida. Para PCs con la instalación administrada 0.12.0, usa
**Update-Notifica.ps1** y sigue [ACTUALIZACION.md](ACTUALIZACION.md). No desinstales
ni vuelvas a inscribir los PCs para actualizar. El instalador de altas nuevas
detecta instalaciones existentes y se detiene para preservar identidad, diarios y PDF.
No utilices el antiguo `Notifica.Setup.exe`: ese instalador exige un editor firmado.

## 1. Qué instalar en cada computadora

| Uso | Instalación |
| --- | --- |
| Autorizar firmas desde el navegador | Cuenta activa de la misma oficina. No necesita agente ni token en ese PC. |
| Tener el token y ejecutar firmas | Este agente, controlador oficial x64, certificado del token, TSA y confianza configurados. Inscribir como SIGNER. |
| Consultar la carpeta compartida de firmados | Este agente y una carpeta local nueva en NTFS. Inscribir como RECEIVER. No necesita token, controlador ni PIN. |
| Firmar y consultar en el mismo PC | Configuración de firma; SIGNER y SIGNER_RECEIVER tienen acceso a la carpeta. |

Requisitos del paquete: Windows 11 x64, Windows PowerShell 5.1, permisos de
administrador durante la instalación y conexión HTTPS al servidor. Incluye el
runtime .NET, Java y el motor PDF. No instala controladores del fabricante.
El servidor debe tener habilitados los endpoints, almacenamiento y validador
independiente necesarios; instalar Windows no configura esos servicios.

## 2. Descargar y comprobar

1. Accede a tu repositorio privado en GitHub y abre **Releases**.
2. Descarga el ZIP `NOTIFICA-Windows-0.13.0-managed.zip`, `SHA256SUMS.txt` y lee las
   notas de esa misma versión. No uses el ZIP automático llamado **Source code**.
3. En PowerShell, calcula la huella del ZIP y compárala con el registro de publicación
   conservado por ti, antes de ejecutar scripts:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Descargas\NOTIFICA-Windows-0.13.0-managed.zip'
```

4. Extrae el paquete en una carpeta local dedicada, por ejemplo `C:\NotificaInstalacion`.
   No lo ejecutes desde dentro del ZIP, una carpeta compartida o una unidad de red.
5. Conserva la **huella de distribution.json** publicada en las notas. La pasarás
   explícitamente al instalador. El instalador verifica el manifiesto, scripts y
   archivo de programa antes de instalar.

Estas huellas detectan cambios respecto de tu copia de referencia. **No acreditan
un editor** y no protegen frente a alguien que cambie a la vez el paquete y todas
las huellas de referencia. Mantén el acceso de escritura al repositorio limitado,
protege tu cuenta y conserva una copia independiente de las huellas publicadas.

Windows puede mostrar una advertencia SmartScreen. Si ofrece **Más información →
Ejecutar de todas formas**, revisa primero el origen y la huella. Cerrar la advertencia
no equivale a instalar. Smart App Control o una política corporativa pueden bloquear
el programa sin esa opción: detén esa instalación y revisa la política del equipo
con su administrador. Este procedimiento no desactiva Defender, SmartScreen,
Smart App Control ni la política de seguridad global.

## 3. Preparar los datos del equipo

En la sesión Windows de la persona que utilizará el icono de bandeja, ejecuta:

```powershell
whoami /user
```

Copia su SID. No confundas al usuario de la bandeja con una cuenta distinta usada
solo para elevar PowerShell. Copia `install-request.example.json` a `install-request.json`
y completa los valores. El JSON de ejemplo prepara un receptor:

```json
{
  "serverUrl": "https://TU-SERVIDOR/",
  "allowedUserSid": "S-1-5-21-SID-REAL-DEL-USUARIO",
  "receiverDirectory": "C:\\NotificaFirmados",
  "pkcs11Library": "C:\\Windows\\System32\\eTPKCS11.dll",
  "certificateFingerprint": null,
  "enableSigning": false,
  "timestampUrl": null,
  "timestampPolicyOid": null,
  "trustedCertificateFiles": []
}
```

La carpeta receptora debe ser **nueva**, estar en disco local y no coincidir ni
solaparse con las carpetas de instalación. El instalador crea sus permisos para
el servicio y el usuario previsto. No selecciones una carpeta que ya contiene documentos.
Para un receptor, la ruta común `pkcs11Library` no exige que el controlador exista.
No introduzcas PIN, contraseña, código de inscripción ni claves de servidor en este JSON.
No subas el JSON personalizado de un usuario a GitHub.

Para un equipo firmante o combinado, además:

- Instala el controlador oficial x64 del token; el instalador comprueba su firma.
- Cambia `enableSigning` a `true` y selecciona la ruta absoluta del controlador.
- Completa `certificateFingerprint` con el SHA-256 del certificado FEA: 64 caracteres
  hexadecimales minúsculos, sin espacios.
- Configura `timestampUrl` con el endpoint HTTPS de TSA aprobado, y su OID si procede.
  Este sellado de tiempo de PDF sigue siendo necesario para los perfiles que lo requieren.
- Indica en `trustedCertificateFiles` las rutas a los certificados **públicos** de
  confianza del firmante y TSA. No se admiten PFX ni archivos con claves privadas.

## 4. Verificar e instalar

Abre **Windows PowerShell como administrador**, entra en la carpeta extraída y
copia en `$manifestHash` el hash de `distribution.json` de las notas de publicación.
No lo calcules del archivo descargado para usarlo como si fuera una referencia independiente.

```powershell
Set-Location -LiteralPath 'C:\NotificaInstalacion'
$manifestHash = 'HASH-DE-DISTRIBUTION-JSON-PUBLICADO-EN-LAS-NOTAS'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-Notifica.ps1 `
  -RequestFile .\install-request.json -ExpectedManifestSha256 $manifestHash -Preflight
```

`PREFLIGHT_PASSED_NO_INSTALLATION_PERFORMED` indica que las comprobaciones previas
pasaron; todavía no se ha instalado nada. Instala quitando `-Preflight`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-Notifica.ps1 `
  -RequestFile .\install-request.json -ExpectedManifestSha256 $manifestHash
```

`ExecutionPolicy Bypass` afecta solo a ese proceso de PowerShell; no modifica la
política global ni evita Smart App Control u otras restricciones de Windows.
El resultado esperado es `INSTALLED_ENROLLMENT_REQUIRED`.

El instalador configura un servicio bajo su propia cuenta virtual, una clave de
dispositivo no exportable, recuperación del servicio y una tarea de bandeja bajo
el usuario indicado. No guarda contraseñas de Windows. Las rutas son:

- Programa: `C:\Program Files\NotificaIA\Agent`.
- Configuración y estado: `C:\ProgramData\NotificaIA\Agent`.
- Carpeta compartida: `receiverDirectory\Oficina-<id>`, accesible desde «Abrir firmados de la oficina» en la bandeja.

Si se interrumpe **este** instalador, conserva exactamente el paquete y JSON usados.
Una instalación registrada como incompleta puede reanudarse con el mismo comando
añadiendo `-Resume`. La reanudación comprueba el manifiesto, la solicitud y la
propiedad del servicio; conserva la misma clave de dispositivo. No borres carpetas
o diarios para forzar una instalación. Si aparece `REVIEW_ACTIVE_WORK`, inspecciona
el trabajo pendiente antes de continuar. Una instalación terminada se actualiza
con Update-Notifica.ps1 siguiendo ACTUALIZACION.md; `-Resume` no es un actualizador.

## 5. Inscribir en NOTIFICA

Instalar no crea una oficina ni inscribe automáticamente el equipo.

1. Inicia sesión en la web como administrador de la oficina correcta.
2. Genera un código temporal mediante la API administrativa existente:
   `POST /api/signing/devices`, JSON `{"action":"enroll","role":"RECEIVER"}`.
   Utiliza `SIGNER` o `SIGNER_RECEIVER` según corresponda. La llamada requiere tu
   sesión autenticada y el mismo origen HTTPS; no basta un JSON sin autenticar.
   Actualmente no hay un asistente web completo para generar estos códigos.
3. En el PC, abre el icono de NOTIFICA bajo el usuario configurado y selecciona
   **Inscribir este equipo…**. Introduce el código y un nombre reconocible del PC.
4. Confirma la carpeta si recibirá documentos. El código dura diez minutos y se
   consume una vez. Si expira, genera otro; nunca uses el PIN como código.
5. Comprueba en Firmados la oficina, rol, conexión y certificado del dispositivo.

## 6. Habilitar firmas remotas

En el equipo con token, abre **Sesión de firma remota…**, revisa oficina,
certificado y cola, acepta el consentimiento e introduce el PIN **una vez**.
Durante esa sesión, cualquier cuenta activa de la misma oficina puede autorizar
documentos desde otra computadora. No hay aprobación local adicional por documento.
La sesión dura como máximo ocho horas; el PIN no se guarda.

**Cerrar sesión de firma**, reiniciar el servicio, el vencimiento o un fallo del
token/motor la deshabilitan. Cerrar la ventana de bandeja por sí solo no la cierra.
Reconectar un token no habilita automáticamente la sesión. El receptor no necesita
PIN. Los errores de firma se revisan en Firmados; una respuesta de red perdida
no justifica volver a firmar un PDF que ya existe.

## 7. Antes de entregar el PC

- Reinicia y comprueba servicio, bandeja y acceso del usuario previsto.
- Firma un documento de prueba autorizado; verifica la validación central.
- En el firmante y en un receptor, abre «Firmados de la oficina»: ambos deben listar
  los mismos documentos de los últimos 50 días. Abre un PDF para descargarlo y
  comprueba su SHA-256. Busca también una firma antigua en el archivo de la aplicación.
- Desde otra computadora, prueba dos solicitudes con una sola habilitación del token.
- Cierra la sesión local y confirma que no empiezan nuevas firmas hasta habilitarla.
- Conserva versión, hash del paquete, PC, oficina y resultado de las pruebas.

El paquete tiene comprobaciones de construcción, integridad y pruebas del agente.
**Todavía requiere una instalación real con elevación y aceptación en los equipos
destino.** No confundir estas comprobaciones con un piloto ya completado.

Referencias: [SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation),
[Smart App Control](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview).
