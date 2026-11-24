# Activar la prueba de actualización 0.15.0 → 0.16.0

Repositorio público previsto: `gonzalogodoyp13/test-not-ia-sng`.
Confirma el propietario antes de pegar el JSON; si es otro, cambia solo repository.
El archivo UPDATE-CHANNEL.json de esta publicación ya contiene versión, tag,
repositorio y ambas huellas calculadas para el ZIP 0.16.0.

## 1. Publicar el paquete

En GitHub crea una Release con tag `v0.16.0-managed.1`, adjunta los archivos
indicados en GUIA_GITHUB.md y publica como **pre-release**. Una Release guardada
solo como borrador no sirve para esta prueba. Confirma que el ZIP se puede descargar
sin iniciar sesión. No renombres `NOTIFICA-Windows-0.16.0-managed.zip`.

## 2. Preparar el sitio (si no se hizo para 0.15.0)

El sitio en https://notificaia.cl debe tener desplegados los endpoints:

- `/api/signing/device/update-manifest`
- `/api/signing/device/update-download`

Son los mismos implementados para 0.15.0. Esta versión no modifica el código web.
Sin SIGNING_DESKTOP_RELEASE, el primer endpoint responde 204 (vacío).
Una respuesta 404 o una página de inicio de sesión indica que falta desplegar
el soporte de actualizaciones o hay un problema de configuración.

## 3. Activar 0.16.0 en Vercel

1. Abre Vercel y el proyecto web que sirve notificaia.cl.
2. Abre **Settings → Environment Variables**.
3. Busca o crea **SIGNING_DESKTOP_RELEASE** para **Production**.
4. Pega el contenido completo de UPDATE-CHANNEL.json de ESTA versión 0.16.0.
5. Guarda y redespliega el proyecto para aplicar la variable.

**Activar esta variable exige 0.16.0 para nuevos trabajos de firma de todos los
PCs que usen ese servidor.** Realiza la prueba en una ventana planificada y conserva
el valor anterior para retirarla si la descarga o instalación no funciona.
No se interrumpen trabajos ya iniciados.

Para este repositorio público **SIGNING_RELEASE_GITHUB_TOKEN es opcional**.
Puedes quitarlo para probar la descarga pública; un token vencido o inválido que
siga configurado puede hacer fallar GitHub aunque el repo sea público. Nunca lo
pongas en UPDATE-CHANNEL.json ni en una variable NEXT_PUBLIC_.

## 4. Verificar antes de pulsar Actualizar

Abre https://notificaia.cl/api/signing/device/update-manifest y comprueba:
- version = 0.16.0;
- zipSha256 y manifestSha256 coinciden con UPDATE-CHANNEL.json.

Abre https://notificaia.cl/api/signing/device/update-download y comprueba que
se descarga el ZIP correcto. No lo ejecutes manualmente en el PC piloto.
La descarga puede redirigir al almacenamiento de GitHub. El servidor no entrega
credenciales GitHub al usuario. El canal en notificaia.cl sigue siendo necesario;
esta versión no migra a un actualizador independiente del sitio.

## 5. Probar en el PC que ya tiene 0.15.0

1. Espera a que termine cualquier firma pendiente y cierra PDF abiertos.
2. Sal de la bandeja y vuelve a abrir NOTIFICA; esto evita la caché de comprobación
   de hasta cinco minutos. Salir de la bandeja no cierra por sí solo la sesión de firma.
3. Debe aparecer **Actualización requerida para continuar**, indicando 0.16.0.
4. Pulsa **Actualizar**, acepta el permiso de administrador de Windows y espera.
5. Comprueba la versión 0.16.0 en el panel, inscripción y documentos conservados.
6. Habilita de nuevo la firma con el PIN y realiza una firma de prueba autorizada.
7. Al volver a abrir, no debe pedir instalar 0.16.0 otra vez.

## Si falla

- Sin aviso: comprueba la versión instalada, el JSON desplegado y reinicia la bandeja.
- Descarga no disponible: comprueba que el repo sea público, la Release esté publicada,
  el tag y nombre exacto del ZIP, y que no exista un token servidor inválido.
- Trabajo pendiente: resuélvelo antes de reintentar. Nunca borres diarios de firma.
- Error al instalar: revisa ACTUALIZACION.md. El actualizador intenta restaurar la
  versión anterior; una recuperación fallida conserva el diario para el administrador.
- Los paquetes verificados y result.txt se conservan bajo
  `C:\Program Files\NotificaIA\Agent\update-<id>`.
- Para retirar la exigencia, restaura el JSON previo o quita SIGNING_DESKTOP_RELEASE
  y redespliega. SIGNING_MIN_AGENT_VERSION, si existe, sigue aplicándose por separado.
  Esto no baja la versión ya instalada en ningún PC.

Referencia: [Vercel — variables y redeploy](https://vercel.com/docs/environment-variables/managing-environment-variables).
