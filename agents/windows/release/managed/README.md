# NOTIFICA IA · Distribución Windows

Agente 0.16.0 con logo N blanco y panel sencillo para firma digital.
Haz doble clic en la N de la bandeja para ver estado, sesión de firma, carpeta e inscripción.
Muestra los últimos 50 días y descarga los PDF al abrirlos, también en el firmante.
Distribución **sin certificado de firma de código**, instalada personalmente por
el responsable mediante control remoto. Repositorio de distribución: público.

## Prueba 0.15.0 → 0.16.0

No hay cambios funcionales respecto de 0.15.0. Esta publicación prueba el botón
**Actualizar** en un PC ya instalado, usando el repositorio público
`gonzalogodoyp13/test-not-ia-sng`. Conserva la sesión persistente y notificaia.cl.
La primera versión con el botón fue 0.15.0. No instales manualmente 0.16.0 antes
de probarlo: configura el canal web y actualiza desde la app. Tras instalar,
habilita nuevamente la sesión de firma. Consulta SERVER-UPDATE-SETUP.md.

## Descargar

Abre **Releases** y descarga el ZIP `NOTIFICA-Windows-0.16.0-managed.zip` junto con
sus huellas. El ZIP automático **Source code** no contiene los runtimes del agente.

- [Instalación, inscripción y sesión remota](INSTALACION.md).
- [Actualizar PCs existentes de 0.12.0, 0.13.0, 0.14.0 o 0.15.0 a 0.16.0](ACTUALIZACION.md).
- [Cómo cargar esta carpeta y publicar una versión en GitHub](GUIA_GITHUB.md).
- [Plantilla de datos del PC](examples/install-request.example.json).

Install-Notifica.ps1 admite altas nuevas y reanudación de su propia instalación
interrumpida. Update-Notifica.ps1 actualiza instalaciones administradas 0.12.0, 0.13.0, 0.14.0 y 0.15.0,
conserva inscripción/configuración/documentos y recupera cambios fallidos. La
actualización real en los PCs destino se acepta en un piloto; publica primero como pre-release.

No se requiere firma de editor para este procedimiento. El certificado FEA del
token, HTTPS, validación de los PDF y controles de cuenta/oficina siguen vigentes.
El paquete no modifica las protecciones globales de Windows. Algunos equipos
pueden bloquear aplicaciones sin firma según su política.

## Contenido del repositorio

Esta carpeta contiene guías, herramientas y un ejemplo sin datos reales.
Los binarios se distribuyen como adjuntos de Releases. Los avisos y licencias
de las dependencias se incluyen en el paquete; no se concede una licencia
adicional de código abierto sobre NOTIFICA por publicar esta carpeta.
