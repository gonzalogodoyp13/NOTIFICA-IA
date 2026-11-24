# Publicar NOTIFICA Windows 0.16.0 en GitHub

Usa tu repositorio público **test-not-ia-sng**, separado del proyecto web.
Esta publicación distribuye el agente; no despliega el servidor ni actualiza los
PCs por sí sola. Para activar el botón de futuras versiones, sigue SERVER-UPDATE-SETUP.md. Conserva la Release anterior sin modificarla.

## Desde la página de Releases

1. Pulsa **Draft a new release**.
2. En **Choose a tag**, escribe `v0.16.0-managed.1` y pulsa **Create new tag**.
   Selecciona **main** como Target. No reutilices un tag ya publicado.
3. En **Release title**, escribe:
   `NOTIFICA Windows 0.16.0 - prueba de actualización desde 0.15.0`.
4. Abre `release-assets/RELEASE-NOTES.md` del paquete preparado y copia su contenido
   completo en **Describe this release**, incluidas las huellas SHA-256.
5. En el área de adjuntos, sube estos seis archivos desde **release-assets**:
   - `NOTIFICA-Windows-0.16.0-managed.zip`
   - `SHA256SUMS.txt`
   - `ACTUALIZACION.md` (guía con comandos y huellas completados).
   - `INSTALACION.md`
   - `SERVER-UPDATE-SETUP.md`
   - `UPDATE-CHANNEL.json`
6. Espera a que terminen las seis cargas. Marca **This is a pre-release** durante
   el piloto. No marques la versión como estable/latest antes de aceptarlo.
7. Pulsa **Save draft** para revisar notas/archivos y luego **Publish release**
   cuando quieras descargarla desde tus sesiones de control remoto.
8. Confirma los seis adjuntos en **Assets**. Descarga el ZIP propio; los enlaces
   automáticos **Source code** no sirven para instalar.
9. Confirma que el servidor admite la carpeta compartida de 0.13.0. Actualiza primero
   un receptor y el firmante según ACTUALIZACION.md; valida antes de continuar.

También puedes actualizar las guías del repositorio subiendo el contenido de la
carpeta **repository** mediante **Add file → Upload files** y guardándolo en main
antes de crear el tag. No subas la carpeta padre, binarios ni ZIP como archivos
normales del repositorio. Los binarios van como adjuntos de la Release.

## Distribución y acceso

Un ZIP sirve para altas nuevas y actualizaciones. Los PCs existentes ejecutan
**Update-Notifica.ps1**; los nuevos **Install-Notifica.ps1**. El actualizador admite
instalaciones administradas 0.12.0, 0.13.0, 0.14.0 y 0.15.0 y conserva inscripción, configuración y documentos.
No requiere comprar un certificado de firma de editor.

El repositorio público permite descargar sin cuenta GitHub. El token servidor
SIGNING_RELEASE_GITHUB_TOKEN no es obligatorio; no publiques tokens en el repo.
Activa la versión mediante UPDATE-CHANNEL.json en el sitio y prueba con un PC
que aún tenga 0.15.0. El canal web sigue siendo necesario.

No publiques `.env`, PIN, contraseñas, códigos de inscripción, claves privadas,
configuraciones personalizadas, bases de datos, PDF de clientes, diarios de firma
ni `C:\ProgramData\NotificaIA`. El paquete utiliza una lista explícita de archivos;
no copia el proyecto completo. Cada adjunto debe medir menos de 2 GiB.
No sustituyas silenciosamente un ZIP distribuido: crea una nueva Release.

Referencias: [Administrar Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository),
[Acerca de Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
