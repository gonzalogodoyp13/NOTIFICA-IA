from pathlib import Path
from html import escape
import json
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable, KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf/NOTIFICA_IA_Manual_de_Firma_Digital.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
for name, file in [('Body','calibri.ttf'),('Bold','calibrib.ttf'),('Light','calibril.ttf'),('Italic','calibrii.ttf')]:
    pdfmetrics.registerFont(TTFont(name, 'C:/Windows/Fonts/'+file))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Bold', italic='Italic', boldItalic='Bold')
INK=colors.HexColor('#172C3D'); TEAL=colors.HexColor('#087F83'); MUTED=colors.HexColor('#536A79')
PALE=colors.HexColor('#EDF6F5'); LINE=colors.HexColor('#D7E3E8'); AMBER=colors.HexColor('#A86013')
W,H=A4; WIDTH=W-96
styles={
 'body':ParagraphStyle('body',fontName='Body',fontSize=11,leading=15.4,textColor=INK,spaceAfter=8),
 'small':ParagraphStyle('small',fontName='Body',fontSize=9.4,leading=12.7,textColor=MUTED,spaceAfter=7),
 'h':ParagraphStyle('h',fontName='Bold',fontSize=14,leading=18,textColor=TEAL,spaceBefore=10,spaceAfter=6),
 'title':ParagraphStyle('title',fontName='Light',fontSize=28,leading=32,textColor=INK,spaceAfter=11),
 'deck':ParagraphStyle('deck',fontName='Body',fontSize=12,leading=16.5,textColor=MUTED,spaceAfter=17),
 'cell':ParagraphStyle('cell',fontName='Body',fontSize=10.1,leading=13.4,textColor=INK),
 'th':ParagraphStyle('th',fontName='Bold',fontSize=10,leading=13,textColor=colors.white),
 'code':ParagraphStyle('code',fontName='Courier',fontSize=8.2,leading=11.3,textColor=INK,spaceAfter=0),
}
story=[]; page_titles=[]
def p(text, style='body'): return Paragraph(text,styles[style])
def para(text): story.append(p(text))
def sub(text): story.append(p(text,'h'))
def bullet(text): story.append(p('• '+text))
def steps(items):
    for n,text in enumerate(items,1): story.append(p(f'<b>{n:02d}.</b> {text}'))
def box(title,text,warning=False):
    t=Table([[p(title,'h')],[p(text)]],colWidths=[WIDTH-24])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#FFF5E7') if warning else PALE),('BOX',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,0),2),('BOTTOMPADDING',(0,-1),(-1,-1),7)]))
    story.extend([t,Spacer(1,12)])
def table(headers,rows,widths=None):
    data=[[p(x,'th') for x in headers]]+[[p(x,'cell') for x in r] for r in rows]
    t=Table(data,colWidths=[WIDTH*x for x in widths] if widths else None,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F2F6F8')]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,-1),(-1,-1),.5,LINE)]))
    story.extend([t,Spacer(1,11)])
def code(text):
    lines=text.strip('\n').splitlines()
    for line in lines:
        if len(line)>88: raise ValueError('Long code line '+line)
    content='<br/>'.join(escape(x).replace(' ','&#160;') for x in lines)
    t=Table([[p(content,'code')]],colWidths=[WIDTH])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#F1F4F7')),('LEFTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),11),('BOTTOMPADDING',(0,0),(-1,-1),11)]))
    story.extend([t,Spacer(1,11)])
def page(title,deck):
    if page_titles: story.append(PageBreak())
    page_titles.append(title)
    story.append(p(f'<a name="p{len(page_titles)}"/>{title}','title'))
    story.append(p(deck,'deck'))

class Pipeline(Flowable):
    def __init__(self): Flowable.__init__(self); self.width=WIDTH; self.height=275
    def draw(self):
        c=self.canv
        blocks=[('1  NOTIFICA WEB','La cuenta de la oficina autoriza la solicitud'),('2  EQUIPO FIRMANTE','Sesión habilitada una vez + token USB'),('3  SERVIDOR Y VALIDADOR','Verifica y conserva la versión firmada'),('4  EQUIPOS RECEPTORES','Copian el mismo PDF a su carpeta local')]
        for i,(title,desc) in enumerate(blocks):
            y=220-i*67
            c.setFillColor(PALE if i%2==0 else colors.HexColor('#F1F4F7')); c.roundRect(0,y,WIDTH,53,7,fill=1,stroke=0)
            c.setFillColor(TEAL); c.setFont('Bold',12);c.drawString(16,y+32,title)
            c.setFillColor(INK);c.setFont('Body',11);c.drawString(16,y+14,desc)
            if i<3:
                c.setStrokeColor(TEAL);c.setLineWidth(1.3);c.line(WIDTH/2,y-2,WIDTH/2,y-12)
                c.line(WIDTH/2,y-12,WIDTH/2-3,y-8);c.line(WIDTH/2,y-12,WIDTH/2+3,y-8)

page('Firma digital\n'.replace('\n','<br/>')+'en NOTIFICA IA','Manual práctico de funcionamiento, instalación y operación')
story.append(Spacer(1,20))
story.append(Pipeline())
story.append(Spacer(1,18))
para('<b>Para administradores de oficina, firmantes y usuarios receptores.</b> Explica qué hace cada parte del sistema, cómo incorporar equipos y cómo actuar cuando una firma o una entrega necesita atención.')
box('Edición de preparación para despliegue','Versión documental 1.1 · 23 de septiembre de 2026 · Agente de referencia 0.12.0.<br/><b>El instalador firmado y el piloto en dos equipos receptores siguen pendientes.</b> Incluye firma remota desde cuentas activas de la oficina mediante una sesión del token habilitada localmente.',True)
para('Este manual se organiza por tareas y decisiones. No es una cronología de las fases de desarrollo.','body') if False else None

page('Cómo utilizar este manual','Empieza por el funcionamiento; consulta después el procedimiento de tu rol.')
table(['Necesito…','Leer'],[
('Entender qué ocurrirá con mis documentos','<link href="#p3" color="#087F83">Páginas 3-9</link>'),('Preparar el servicio y la firma del instalador','<link href="#p10" color="#087F83">Páginas 10-11</link>'),('Instalar e inscribir equipos nuevos','<link href="#p12" color="#087F83">Páginas 12-17</link>'),('Interpretar estados y resolver incidencias','<link href="#p18" color="#087F83">Páginas 18-20</link>'),('Actualizar, retirar equipos o renovar certificados','<link href="#p21" color="#087F83">Páginas 21-24</link>'),('Preparar el piloto y consultar términos','<link href="#p25" color="#087F83">Páginas 25-27</link>')],[.72,.28])
sub('Tres cosas que conviene recordar')
steps(['<b>Puedes autorizar desde otro computador.</b> Una cuenta activa de la oficina confirma el trabajo en la web. El equipo con token lo procesa mientras su sesión esté habilitada.','<b>Firmar no es entregar.</b> Primero se valida y guarda el PDF central; después cada receptor confirma su propia copia.','<b>Instalar no es inscribir.</b> Windows necesita el programa y el servidor necesita autorizar ese equipo para una oficina y un rol.'])
sub('Qué está disponible y qué falta')
para('La cola, la sesión remota, la validación, el archivo central, la recepción y la recuperación tienen implementación y pruebas. El código del instalador también existe. El candidato anterior está sin firma de editor: debe reconstruirse con la nueva versión y validarse antes de distribuirse.')
para('Faltan la credencial de firma de software, las pruebas de instalación con privilegios de administrador usando el paquete firmado, el piloto con dos receptores físicos distintos y la aceptación del operador. La configuración de producción no se activó durante el trabajo descrito.')
box('Convención del manual','Los nombres entre comillas, como <b>“Firmados”</b>, corresponden a controles reales. Las rutas y dominios de ejemplo deben reemplazarse. Las tareas marcadas como técnicas requieren al responsable de instalación; no implican que exista un botón equivalente en la aplicación.')

page('El recorrido de un documento','La copia que llega al escritorio nace de una versión firmada y validada en el servidor.')
story.append(Pipeline())
sub('Qué hace cada componente')
para('<b>La aplicación web</b> identifica la oficina, la diligencia y la versión exacta del Estampo. Registra la solicitud y permite consultar su avance. No accede al token ni recibe el PIN.')
para('<b>El agente Windows</b> contiene un servicio en segundo plano y un icono de bandeja. El servicio conversa con el servidor; la bandeja permite consultar estado, inscribir el equipo y habilitar o cerrar la sesión remota del token.')
para('<b>El token USB</b> realiza la operación con la clave privada del firmante. El PDF vuelve al servidor, donde un validador independiente verifica el resultado antes de convertirlo en la versión firmada oficial de la aplicación.')
para('<b>Los receptores</b> descargan esa misma versión, comprueban sus bytes y guardan una copia local. No vuelven a firmarla y no necesitan el token del firmante.')
box('Fuente de referencia','El archivo central validado es la fuente de referencia para las copias. La carpeta receptora facilita el trabajo diario; no sustituye el archivo central ni sus respaldos.')

page('Personas, oficinas y equipos','Una cuenta de usuario y un equipo inscrito son autorizaciones diferentes.')
table(['Rol','Responsabilidad'],[
('Miembro de la oficina','Consulta y autoriza nuevas firmas desde cualquier computador. La recuperación y administración siguen reservadas al administrador.'),('Administrador de oficina','Solicita firmas, revisa recuperaciones, cancela cuando está permitido y autoriza o revoca equipos de su oficina.'),('Firmante','Habilita una sesión del token con el PIN local para solicitudes de la oficina; puede cerrarla desde la bandeja.'),('Administrador técnico','Prepara servidor, instalador, controladores, permisos, versiones y mantenimiento. Necesita elevación para instalar en Windows.')],[.29,.71])
sub('Roles que puede tener un equipo inscrito')
table(['Rol técnico','Uso práctico'],[
('SIGNER','Equipo con token que procesa firmas. No recibe copias por el solo hecho de firmar.'),('RECEIVER','Equipo que recibe copias firmadas. No puede iniciar operaciones con el token.'),('SIGNER_RECEIVER','Realiza ambas funciones, con sesión remota habilitada para firmar y recepción independiente.')],[.31,.69])
para('La oficina y el rol se fijan al consumir un código de inscripción emitido por su administrador. Escribir otro rol en un archivo local no concede permisos. Un equipo de otra oficina no obtiene acceso a los documentos por conocer un identificador.')
box('Ejemplo de oficina','Gonzalo habilita el token una vez. Ana y otros miembros activos solicitan firmas desde sus computadores; los receptores reciben las copias. Pueden existir varios usuarios web sin instalar un agente en cada uno: solo los equipos que firman o reciben archivos automáticamente lo necesitan.')

page('Certificados y tipos de firma','Hay tres identidades distintas y cada una resuelve una necesidad concreta.')
table(['Identidad','Para qué sirve'],[
('Certificado FEA del token','Identifica al firmante de los PDF. Su clave privada permanece en el token.'),('Identidad del dispositivo','Clave de software no exportable, creada para el agente en Windows. Autentica ese equipo ante NOTIFICA.'),('Certificado de firma de código','Identifica al editor del instalador y de las actualizaciones. Lo utiliza el responsable de publicar el software.')],[.34,.66])
sub('Perfiles que aparecen en Firmados')
para('<b>B · Firma básica:</b> firma criptográfica del documento. <b>LT · Fechado y evidencia:</b> incorpora fechado y material de validación a largo plazo. <b>LTA · Sello de archivo:</b> añade protección mediante un sello de archivo. La política de conservación futura sigue requiriendo planificación; seleccionar LTA no crea un servicio de renovación indefinida.')
para('El sistema conserva el perfil solicitado. Si se solicita LT o LTA y no se obtiene el fechado o la evidencia necesaria, no cambia automáticamente a B. El perfil operativo debe acordarse con el responsable de la oficina y la política aplicable; este manual no determina la suficiencia jurídica de un perfil.')
sub('Términos útiles')
para('<b>TSA:</b> servicio de sellado de tiempo. <b>OCSP/CRL:</b> mecanismos para consultar o acreditar la revocación de certificados. <b>Huella SHA-256 del certificado:</b> identifica exactamente cuál certificado debe firmar. Se vuelve a revisar al renovarlo.')
box('Lo que no se comparte','El PIN se introduce exclusivamente en la ventana local del firmante. No se coloca en la web, en el archivo de instalación, en correos ni en solicitudes de soporte. Los receptores nunca necesitan ese PIN.')

page('Cómo funciona la solicitud automática','Con la función configurada y la sesión del token activa, las solicitudes se procesan sin aprobación local por documento.')
steps(['El usuario completa el flujo de una diligencia y genera sus documentos habituales. El sistema determina si la diligencia quedó realmente completada.','Si la función está habilitada globalmente y para esa oficina, identifica los Estampos elegibles y fija la versión y SHA-256 de cada PDF.','Registra un trabajo en la cola. La operación web termina sin esperar que el token esté conectado o habilitado.','Mientras la sesión esté activa, el agente toma cada documento elegible. El servidor comprueba que la cuenta solicitante siga activa en esa oficina.','El agente firma, obtiene la evidencia requerida y presenta el resultado al servidor. El servidor realiza su validación independiente.','Solo después de aceptar la firma, el servidor conserva la versión firmada y crea las entregas para receptores autorizados. Cada receptor confirma su copia por separado.'])
sub('Qué documentos se excluyen')
para('Se excluyen documentos sin PDF válido o sin versión identificable, anulados, ya firmados, ya en cola o con asociaciones inconsistentes. El flujo de firmado se centra en Estampos elegibles; no convierte automáticamente en firmable cualquier archivo de la oficina.')
sub('Qué pasa si se repite una solicitud')
para('El sistema reconoce la misma operación y versión para evitar duplicaciones. Si se pierde una respuesta, repetir exactamente la solicitud no debería generar otra firma para esa misma operación. Una nueva versión del documento es un caso distinto y exige revisar su elegibilidad.')
box('Situación actual','La activación automática de producción sigue pendiente. Ver una diligencia completada no demuestra que se haya solicitado una firma: comprueba su fila y estado en Firmados.',True)

page('Solicitar firmas desde Firmados','Procedimiento para cualquier cuenta activa de la oficina, desde cualquier computador.')
steps(['Abre <b>Firmados</b> con tu sesión de la oficina. No necesitas ser administrador, instalar el agente ni tener el token en ese computador.','Filtra por el intervalo de <b>fecha de ejecución</b> que necesitas. Los extremos del intervalo se incluyen. Esta fecha no equivale a la fecha en que se subió el PDF.','Selecciona los Estampos elegibles. Puedes elegir filas, una página o todos los resultados elegibles del intervalo. Si hay más de 500 resultados, reduce el intervalo.','Selecciona el certificado y el perfil B, LT o LTA aprobado para el trabajo. Abre la solicitud y revisa la lista congelada de documentos.','Marca la confirmación de revisión y pulsa <b>“Confirmar solicitud”</b>. Esto autoriza la firma con el certificado seleccionado mientras la sesión del token esté activa.','Sigue el avance y después revisa la entrega a cada receptor. Si falta habilitar el token, el trabajo espera en cola; alguien debe habilitarlo localmente una vez.'])
sub('Qué revisar antes de confirmar')
para('Comprueba oficina, ROL, documento, fecha de ejecución, certificado y perfil. Cambiar filtros limpia la selección; no presupongas que la selección anterior sigue vigente. Un firmante temporalmente desconectado puede dejar trabajo pendiente, pero deberá reconectarse para procesarlo.')
sub('Si la página pierde la respuesta')
para('La interfaz permite volver a enviar la misma confirmación. Conserva el mismo contenido y consulta el resultado antes de cambiar documentos o crear otra solicitud. El sistema distingue una repetición de una nueva operación.')
para('<b>Límite actual:</b> el transporte web autenticado admite cada PDF hasta 4 MiB. Si un documento supera ese tamaño, el técnico debe revisar la limitación; no reduzcas ni sustituyas una versión ya solicitada sin generar y revisar la versión correspondiente.')
box('Un PIN por sesión, varias solicitudes','La selección web puede reunir muchos documentos. El agente los procesa uno a uno y reutiliza la sesión autenticada del token, sin pedir otro PIN por documento. Cada versión conserva su autorización, intento y evidencia separados.')

page('Habilitar y cerrar el token','Una habilitación local permite firmas remotas durante un máximo de ocho horas.')
steps(['En el equipo del token, entra con el usuario Windows configurado para la bandeja. Conecta el token y mantén el equipo encendido y conectado.','Abre <b>“Sesión de firma remota…”</b> desde el icono de NOTIFICA. Comprueba oficina, certificado y la cola pendiente antes de habilitar.','Escribe el PIN localmente, marca el consentimiento para solicitudes de la oficina y pulsa <b>“Habilitar firma remota”</b>. El PIN se borra después del inicio de sesión.','Comprueba el mensaje de habilitación y su vencimiento. Desde ese momento, cualquier cuenta activa de la misma oficina puede autorizar documentos en la web, sin otra aprobación en este equipo.','Para detener nuevas firmas, pulsa <b>“Cerrar sesión de firma”</b>. También se deshabilita al reiniciar el servicio, al vencer o por un fallo del token o motor.'])
para('El campo PIN no permite pegar y admite caracteres ASCII. La sesión reutiliza la autenticación del token; no guarda el PIN para nuevos inicios. Tras cerrarse necesita otra habilitación local. Una firma interrumpida queda sujeta a revisión.')
box('Si el PIN falla','No hagas intentos sucesivos por aproximación. El sistema no reintenta automáticamente un PIN incorrecto. Revisa el teclado y consulta el procedimiento del proveedor si existe bloqueo o duda sobre el PIN.',True)
para('<b>Cerrar la ventana o la bandeja no cierra la sesión.</b> Usa el botón de cierre. Desconectar el token provoca el cierre al detectarse el fallo; volver a conectarlo no habilita automáticamente las firmas.')

page('Qué ve quien recibe los PDF','La recepción automática copia un resultado ya firmado; no crea una nueva firma.')
para('El receptor debe estar inscrito para la oficina correcta, tener conexión y disponer de una carpeta local preparada por el instalador. No necesita token USB, PIN ni controlador del token para recibir documentos.')
steps(['El servidor asigna la entrega de una versión firmada y validada. Al inscribir un nuevo receptor también se programan copias de firmas ya confirmadas de esa oficina.','El agente descarga primero a un archivo temporal. Comprueba el tamaño y el SHA-256 antes de publicar el PDF final.','Coloca el archivo en la carpeta elegida y confirma la entrega al servidor. Un manifiesto protegido registra documento, versión, huella y nombre de archivo.'])
sub('Dónde buscar y qué significa el nombre')
para('La carpeta acordada puede ser <b>C:\\NotificaFirmados</b>. Los nombres incluyen identificadores de documento y versión, por lo que no tienen por qué coincidir con un nombre manual como “ROL 123”. Usa la correspondencia en Firmados y el manifiesto cuando necesites verificarla.')
para('Si ya existe un archivo con otro contenido, el agente lo conserva y utiliza un nombre alternativo. Un archivo temporal <b>.part</b> no es prueba de una entrega completa. No lo renombres para aparentar que el PDF ya terminó de copiarse.')
box('No es una sincronización bidireccional','Editar o borrar la copia local no modifica el archivo central. Una copia que ya fue confirmada no se vuelve a reparar continuamente si alguien la elimina: solicita recuperación desde la versión central y verifica su huella.')
sub('Comparación de una copia')
code('Get-FileHash -Algorithm SHA256 -LiteralPath "C:\\NotificaFirmados\\archivo.pdf"')
para('Compara el valor completo con <b>“Evidencia de firma” → “SHA-256 firmado”</b>. Un hash idéntico demuestra igualdad de bytes, no por sí solo la validez jurídica o criptográfica de una firma.')

page('Preparar la oficina y el servidor','Tarea del responsable técnico antes de instalar agentes de producción.')
table(['Preparación','Criterio de aceptación'],[
('Oficina y usuarios','Oficina identificada; administradores y miembros activos; responsable del token designado.'),('Aplicación y HTTPS','Dirección definitiva accesible desde los equipos, certificado TLS válido y proxy configurado de forma explícita.'),('Archivo privado','Almacenamiento y base de datos operativos. Los agentes no reciben credenciales administrativas de almacenamiento.'),('Validador independiente','Servicio privado, autenticación, confianza y política de validación configurados y probados.'),('TSA y revocación','Proveedor y política aprobados; conectividad a los servicios necesarios. No copiar automáticamente ajustes de pruebas.'),('Mantenimiento','Ejecución cada cinco minutos; alertas ante ausencia de ejecución correcta; acceso restringido a diagnósticos.'),('Control de versiones','Versión mínima de agente configurada y paquete de instalación firmado aceptado.')],[.29,.71])
para('Las variables de referencia incluyen <b>SIGNING_VALIDATOR_URL</b>, <b>SIGNING_VALIDATOR_TOKEN</b>, <b>SIGNING_VALIDATOR_CONFIG</b>, <b>SIGNING_MIN_AGENT_VERSION</b> y la configuración de proxy. El mantenimiento utiliza <b>CRON_SECRET</b> y <b>SIGNING_MAINTENANCE_URL</b>. Son ajustes del servidor; no se entregan a usuarios finales.')
para('La activación automática depende de <b>SIGNING_AUTO_ENQUEUE_ENABLED</b> y de la configuración explícita de oficina en <b>SIGNING_AUTO_ENQUEUE_OFFICES</b>. Primero se valida el piloto; después se habilita la oficina aceptada y se observa su operación.')
box('Responsabilidad de despliegue','El instalador Windows no configura el servidor, no crea una oficina y no habilita por sí mismo el validador o la firma automática. Estas tareas deben quedar registradas por el administrador técnico.')

page('Obtener la firma del instalador','La identidad del editor protege el programa que instalarán los usuarios.')
para('Una credencial de firma de código combina un certificado del editor con acceso a su clave privada protegida. Windows usa la firma Authenticode para identificar al publicador y detectar cambios posteriores en el software. Esa credencial se utiliza al preparar versiones; no se compra una por cada receptor. [E1]')
steps(['Define la persona jurídica que publica NOTIFICA. Su identidad validada será la del editor; no necesariamente el nombre comercial corto del producto.','Solicita una cotización de <b>certificado de firma de código Windows, validación de organización (OV), con almacenamiento protegido de la clave</b>. Una opción a evaluar es DigiCert con KeyLocker, que admite integración con SignTool. [E2-E3]','Confirma antes de pagar la elegibilidad por país, el costo total recurrente, la cantidad de firmas y el método de autenticación. Completa la validación de organización y de tu autoridad para solicitar el certificado. [E4]','Configura el acceso local de publicación con el proveedor. El responsable técnico integra y prueba el certificado con el proceso de construcción de NOTIFICA. No envíes claves privadas ni contraseñas por chat.','Firma y verifica el instalador, las piezas ejecutables y el manifiesto de la versión. Conserva la evidencia de editor y fechado junto con el paquete publicado.'])
para('El paquete de distribución consiste en <b>Notifica.Setup.exe</b>, <b>release.psd1</b> firmado y <b>payload.zip</b>. El manifiesto vincula el contenido por SHA-256; el instalador fija el certificado editor aceptado. El candidato actual sin firma no puede utilizarse como ese paquete.')
box('Dos decisiones distintas','La credencial FEA del token firma documentos. La credencial del editor firma el software. Cambiar o renovar el certificado del editor requiere planificar la transición del instalador, porque su identidad está fijada en el paquete.')
para('Una firma válida no garantiza que SmartScreen suprima de inmediato las advertencias de reputación de una aplicación nueva. Pagar por EV únicamente para evitar esa advertencia no garantiza el resultado. [E5]')

page('Antes de instalar un equipo','Ficha de preparación que evita confundir usuario, oficina y dispositivo.')
table(['Dato a registrar','Ejemplo o decisión'],[
('Equipo y usuario Windows','Nombre único del PC; usuario que abrirá la bandeja; SID de ese usuario.'),('Oficina y rol del agente','SIGNER, RECEIVER o SIGNER_RECEIVER; confirmar oficina destinataria.'),('Dirección del servidor','Origen HTTPS aprobado. Ejemplo ilustrativo: https://notifica.ejemplo.cl/'),('Paquete autorizado','Los tres archivos de la versión firmada; equipo incluido en el piloto si el paquete está limitado.'),('Carpeta receptora','Ruta local nueva; espacio suficiente para el histórico y nuevas entregas; sin carpetas compartidas UNC.'),('Si va a firmar','Token, PIN conocido por el titular, controlador oficial x64, huella de certificado, confianza y TSA.'),('Responsables','Administrador de Windows, administrador de oficina y persona que hará la prueba final.')],[.35,.65])
sub('Requisitos del computador')
para('Usa Windows 11 x64 actualizado para el despliegue previsto. El instalador requiere elevación administrativa y utiliza .NET Framework 4.8 y PowerShell 5.1. El agente y el motor de firma incluyen sus runtimes fijados: no debe pedirse al usuario que busque e instale cualquier Java o .NET por su cuenta.')
sub('Identificar al usuario correcto')
code('whoami /user')
para('Ejecuta ese comando con la sesión del <b>usuario que trabajará con la bandeja</b>. Copia su SID en la solicitud de instalación. No uses por error el SID de una cuenta administrativa distinta con la que solo se eleva el instalador.')
box('Carpeta nueva y separada','El instalador da escritura al servicio y lectura al operador. No uses una carpeta documental existente, la carpeta del programa o la carpeta de estado del agente. En un equipo firmante se prepara igualmente la ruta incluida en la solicitud, aunque no tenga rol receptor.')

page('Instalar un equipo receptor','Procedimiento técnico previsto para el paquete firmado; todavía pendiente de aceptación instalada.')
steps(['Copia el paquete firmado a una carpeta local controlada por el administrador. Comprueba el editor del instalador en sus propiedades y verifica que la versión y el destino sean los aprobados.','Prepara el siguiente JSON como archivo <b>install-request.json</b>. Sustituye servidor, SID y ubicación del paquete. La carpeta receptora debe ser nueva.','Ejecuta el instalador con elevación y revisa su resultado. Después inicia sesión como el operador configurado y continúa con la inscripción de la página 15.'])
code('''{
  "action": "install",
  "releaseDirectory": "C:\\Releases\\notifica-0.12.0-pilot",
  "serverUrl": "https://notifica.ejemplo.cl/",
  "allowedUserSid": "S-1-5-21-SUSTITUIR-POR-SID-REAL",
  "receiverDirectory": "C:\\NotificaFirmados",
  "pkcs11Library": "C:\\Windows\\System32\\eTPKCS11.dll",
  "certificateFingerprint": null,
  "enableSigning": false,
  "timestampUrl": null,
  "timestampPolicyOid": null,
  "trustedCertificateFiles": []
}'''.replace('C:\\','C:\\\\').replace('Releases\\notifica','Releases\\\\notifica').replace('Windows\\System32\\eTPKCS11','Windows\\\\System32\\\\eTPKCS11'))
code('.\\Notifica.Setup.exe --request C:\\Pilot\\install-request.json')
para('La ruta <b>pkcs11Library</b> forma parte del formato común de configuración. Con <b>enableSigning=false</b>, el receptor no requiere que el controlador del token esté instalado. No conectes un token ni proporciones un PIN para este procedimiento.')
box('Resultado esperado','Servicio y bandeja instalados, carpeta preparada y estado de equipo pendiente de inscripción. La instalación por sí sola no debe conceder acceso a una oficina. Los dominios y SID de esta página son ejemplos, no datos listos para ejecutar.')

page('Instalar un equipo firmante','Añade el token y su configuración al procedimiento común de instalación.')
steps(['Obtén el controlador del proveedor del token por su canal oficial. Verifica su editor e instala la versión x64 aprobada; reinicia si el proveedor lo solicita. NOTIFICA no instala ni actualiza ese controlador.','Comprueba que Windows y el proveedor reconocen el token. Identifica el certificado correcto y su huella SHA-256. Que el dispositivo aparezca conectado no demuestra que el certificado esté vigente.','Prepara la solicitud de instalación con los campos comunes de la página 13 y los valores adicionales siguientes. Ejecuta el instalador firmado con elevación.','Inscribe el equipo con rol SIGNER o SIGNER_RECEIVER. Comprueba certificado y estado en Firmados. Realiza una firma de prueba controlada antes de habilitar solicitudes habituales.'])
table(['Campo','Valor que debe definir el técnico'],[
('enableSigning','true. Activa la configuración local del motor; el rol del servidor se obtiene por inscripción.'),('pkcs11Library','Ruta absoluta al controlador x64 aprobado. La prueba histórica usó C:\\Windows\\System32\\eTPKCS11.dll; verificar en cada instalación.'),('certificateFingerprint','SHA-256 completo del certificado FEA elegido, en 64 caracteres hexadecimales minúsculos.'),('timestampUrl / timestampPolicyOid','Endpoint HTTPS del proveedor de fechado y política aprobada; el OID puede ser null si corresponde a la configuración aceptada.'),('trustedCertificateFiles','Lista de certificados públicos de confianza necesarios para firmante y TSA. Nunca archivos con claves privadas.')],[.35,.65])
box('Configuración que aún necesita decisión','Los parámetros TSA de producción y la política operativa deben confirmarse. La utilización de FreeTSA en pruebas no constituye una elección automática del servicio de producción. El instalador actual exige configuración de TSA para habilitar el motor de firma.',True)
para('El servicio usa una cuenta virtual propia y una clave de dispositivo. No configures el servicio con la cuenta personal del firmante para intentar conservar el PIN. El PIN se introduce una vez al habilitar la sesión remota. No se conserva al reiniciar.')

page('Inscribir el equipo en la oficina','La inscripción vincula instalación, oficina y rol mediante un código temporal de un solo uso.')
sub('Parte A · Administrador de la oficina')
para('Actualmente, emitir y revocar códigos requiere la <b>API administrativa autenticada</b>; el centro Firmados muestra los equipos, pero no debe suponerse que contiene un asistente gráfico completo de altas. El responsable técnico realiza esta operación con una sesión válida del administrador en el mismo sitio HTTPS.')
code('''POST /api/signing/devices
Content-Type: application/json

{"action":"enroll","role":"RECEIVER"}''')
para('Cambia el rol a <b>SIGNER</b> o <b>SIGNER_RECEIVER</b> según corresponda. La respuesta contiene <b>enrollmentId</b>, <b>code</b>, <b>expiresAt</b> y <b>role</b>. El código dura diez minutos y solo sirve una vez. Entrégalo directamente al operador del equipo correcto. La petición exige sesión, oficina autorizada y origen del mismo sitio; no basta enviar el JSON desde una consola sin autenticar.')
sub('Parte B · Operador en Windows')
steps(['Abre la bandeja y selecciona <b>“Inscribir este equipo…”</b> o <b>“Ver estado…” → “Inscribir equipo…”</b>.','Introduce el código temporal y un nombre que permita reconocer el computador. Para un receptor, confirma la carpeta preparada; <b>“Elegir…”</b> selecciona la ruta, pero no concede permisos adicionales.','Pulsa <b>“Autorizar inscripción”</b>. Espera la confirmación y verifica que el equipo aparezca en la oficina y con el rol previsto.','Si el código expiró, fue usado o se revocó, pide uno nuevo. No lo reemplaces por la contraseña de usuario o por el PIN del token.'])
box('Control al terminar','Comprueba nombre, oficina, rol, último contacto y, para un firmante, certificado seleccionado. Una instalación duplicada o un nombre parecido no justifican inscribir el mismo equipo repetidamente.')

page('Dar acceso a nuevos usuarios','Decide primero si la persona necesita la web, una carpeta local o capacidad de firmar.')
table(['Necesidad','Qué debes preparar'],[
('Solo consultar desde la web','Cuenta y membresía activa en la oficina por el procedimiento general de usuarios. No necesita agente Windows para usar el navegador.'),('Recibir automáticamente en otro PC','Cuenta web si necesita consultar; además, instalación e inscripción RECEIVER en ese PC.'),('Firmar con su propio certificado','Cuenta y permisos apropiados; equipo configurado para firma; token/certificado correspondiente y rol SIGNER o combinado.'),('Solicitar firmas / recuperar fallos','Una cuenta activa de la oficina puede solicitar firmas remotas. Solo el administrador revisa recuperaciones y administra dispositivos.')],[.35,.65])
sub('Cambio de usuario Windows en el mismo PC')
para('La bandeja y sus permisos se configuran para un SID concreto. Añadir un usuario web no habilita automáticamente otro perfil Windows. Si cambia el operador, el técnico debe revisar la tarea de bandeja, el SID permitido y las ACL de la carpeta. No cambies solo el nombre visible del usuario ni copies la carpeta de estado.')
sub('Cambio de computador o de oficina')
para('Trata el nuevo computador como un nuevo dispositivo: instala, inscribe y verifica. Revoca el anterior cuando deje de estar autorizado. No clones su clave de dispositivo ni su identidad. Para cambiar de oficina o de rol, coordina el retiro de la identidad anterior y la nueva inscripción; no edites el JSON esperando trasladar la autorización del servidor.')
box('Alcance de la recepción','El receptor inscrito recibe firmas confirmadas de su oficina, incluidas las existentes que se programan al inscribirlo. No hay en este módulo un selector por usuario para recibir solo algunos ROL. Revisa capacidad, acceso físico y permisos antes de autorizar un nuevo receptor.')

page('Prueba de aceptación de cada equipo','Entrega el computador al usuario solo después de comprobar su función real.')
table(['Comprobación','Resultado esperado'],[
('Inicio y reinicio','El servicio inicia y vuelve a conectarse. La bandeja aparece para el usuario Windows previsto al iniciar sesión.'),('Inscripción','Equipo correcto, oficina correcta y rol correcto; código consumido una vez.'),('Receptor','Una firma de prueba aceptada llega sin descarga manual. El SHA-256 coincide con la evidencia central.'),('Firmante','Habilita la sesión una vez; procesa dos solicitudes web sin otro PIN; verifica cierre y validación del perfil.'),('Combinado','Se demuestran firma y recepción por separado, sin asumir que una prueba acredita ambas.'),('Desconexión breve','Al volver la red, recupera el trabajo pendiente sin crear una firma adicional por una respuesta perdida.'),('Acceso de usuario','El operador puede abrir las copias; una cuenta ajena no adquiere los permisos de aprobación configurados.')],[.29,.71])
sub('Anota esta evidencia')
para('Fecha, oficina, nombre e identificador del equipo, versión del agente, usuario Windows, carpeta, responsable de la instalación y documento de prueba. Para firmantes, registra la huella del certificado y el perfil. Para receptores, conserva el SHA-256 del PDF y la confirmación de entrega.')
sub('Qué no demuestra una prueba parcial')
para('Que el instalador termine no prueba que la inscripción funcione. Que el token aparezca no prueba que la firma se valide. Que Firmados diga “Firmado y validado” no prueba que la copia ya esté en todos los receptores. Verifica las tres cosas por separado.')
story.append(p('El servicio prevé inicio automático retrasado y reinicios a los 10, 30 y 60 segundos. Un reinicio no autoriza otra firma cuando su resultado quedó incierto.','small'))
box('Primer despliegue','Estas comprobaciones por equipo complementan el piloto completo, pero no lo sustituyen. Antes de distribuir ampliamente faltan las pruebas reales del instalador firmado, actualización, reversión, retiro y dos computadores receptores distintos.',True)

page('Leer el centro Firmados','El estado de firma y el estado de entrega responden preguntas distintas.')
table(['Estado de la firma','Qué significa / qué hacer'],[
('Por solicitar','Documento elegible que aún no tiene la solicitud mostrada como activa.'),('En cola','Espera procesamiento; revisa disponibilidad del firmante y del validador.'),('Preparando firma remota','El agente tomó el documento autorizado desde la web con su sesión habilitada.'),('Firmando','La operación comenzó. No debe cancelarse como si todavía fuera una selección pendiente.'),('Reintento programado','Existe una espera por política de fallo. Una nueva firma requiere una sesión del token habilitada.'),('Requiere revisión / No completado','Hay una intervención o fallo. Inspecciona el intento y sus archivos antes de autorizar otra firma.'),('Asignación vencida','Caducó la autorización temporal de trabajo. Si el resultado es incierto, se revisa antes de repetir.'),('Firmado y validado','El resultado superó la validación y quedó confirmado centralmente. Revisa después cada entrega.'),('Cancelado / No elegible','La solicitud fue retirada antes del punto permitido o el documento no cumple las condiciones.')],[.38,.62])
para('El centro muestra dispositivos, certificado y vencimiento, último contacto, intentos, origen automático/manual y progreso de entregas. <b>“Evidencia de firma”</b> permite consultar la versión firmada, SHA-256, equipo firmante y fecha de validación.')
para('La vista se actualiza aproximadamente cada quince segundos cuando está visible y no se está confirmando una operación. Puedes usar <b>“Actualizar”</b>. El cierre del navegador no detiene por sí mismo el servicio Windows ni su cola.')
box('Alertas que conviene atender','Certificado próximo a vencer: planifica dentro del aviso de 30 días. Cola o entrega de más de 15 minutos: investiga. Mantenimiento sin éxito durante más de 10 minutos: escala al técnico. Son umbrales de alerta, no promesas de tiempo de entrega.')

page('Reintentos sin duplicar firmas','La primera pregunta es si puede existir ya un PDF firmado.')
table(['Situación','Respuesta prevista'],[
('Fallo transitorio conocido','El sistema puede programar otro intento con espera creciente, dentro del límite configurado.'),('PIN incorrecto, token ausente o problema local','Requiere intervención. No se prueba automáticamente el PIN ni se oculta el problema del dispositivo.'),('Firma iniciada con resultado incierto','Conservar diario y archivos, detener el trabajo previo y revisar el resultado antes de autorizar una nueva operación.'),('PDF confirmado, respuesta perdida','Reconciliar el mismo resultado y los mismos bytes. No invocar el token otra vez solo por perder la respuesta.'),('Entrega fallida a un receptor','Recuperar la copia del PDF ya validado. “Reintentar entrega” no crea una nueva firma.')],[.40,.60])
sub('Reintento de firma revisado')
para('En Firmados, el administrador usa <b>“Reintentar”</b> solo después de inspeccionar el equipo y el resultado del intento indicado. La confirmación declara que el trabajo anterior se detuvo y que corresponde otra firma. La autorización queda ligada a ese intento; luego se usa una sesión activa. Si el fallo cerró la sesión, hay que habilitarla localmente otra vez.')
sub('Límites y esperas')
para('La creación de trabajos usa cuatro intentos por defecto, con políticas específicas según fallo y estado. Las esperas automáticas de firma crecen desde cinco segundos y tienen un tope de cinco minutos; no garantizan que se ejecute inmediatamente. Las entregas admiten seis intentos por ciclo autorizado para fallos reintentables, con espera creciente desde treinta segundos y tope de una hora.')
para('Tras corregir conexión, espacio o permisos, <b>“Reintentar entrega” → “Reactivar entrega”</b> habilita un nuevo ciclo limitado. Los errores de integridad o conflictos requieren revisión; no se tratan como simples cortes de red.')
box('Cancelar tiene un límite','Solo se permite antes de que la firma cruce su punto de inicio. Un intento que ya empezó no se vuelve cancelable porque después muestre un fallo. No borres el diario local para eludir esta protección.',True)

page('Resolver problemas frecuentes','Empieza por la causa visible y conserva la evidencia del trabajo.')
table(['Lo que observas','Qué revisar primero'],[
('Servicio de Windows sin conexión','Servicios de Windows: NotificaSigningAgent; instalación y permisos. Si se repite el fallo, recoger diagnóstico antes de reinstalar.'),('Servidor sin conexión','Internet, dirección HTTPS, hora del equipo, firewall y disponibilidad del servidor. No inscribir otra vez por un corte de red.'),('Token desconectado','Conexión USB, reconocimiento por el proveedor y estado del token. Si ocurrió durante una firma, revisar el intento retenido.'),('Revisar controlador o certificado','Controlador x64 aprobado, ruta PKCS#11 y huella exacta del certificado. No mezclar la DLL x86 con el agente x64.'),('Certificado vencido / revocado','Detener su uso y coordinar renovación o reemplazo con el proveedor. No cambiar la fecha del equipo.'),('Sesión remota deshabilitada','En el equipo del token, abre Sesión de firma remota, revisa oficina y certificado y habilita con el PIN local.'),('TSA o revocación fallan','Conectividad, proveedor y política. Mantener el perfil pedido; no bajar a B solo para eliminar la alerta.'),('Firmado, pero no llegó al receptor','Entrega asignada, rol y conexión del receptor, versión mínima, espacio y permisos. Consultar cada receptor por separado.'),('Disco lleno / permiso denegado','Liberar espacio de forma controlada o reparar permisos del destino. No borrar documentos o diarios sin revisión.'),('Archivo local distinto o ausente','Recuperar desde el archivo central, conservar conflicto y comparar SHA-256. No pedir una nueva firma para sustituir una copia.'),('Se exige actualizar el agente','Instalar la versión firmada aprobada. El servidor bloquea trabajo nuevo por debajo del mínimo; conserva recuperación en curso.')],[.37,.63])
para('Para escalar, entrega identificadores de trabajo, documento y equipo, fecha/hora y mensaje visible. Nunca adjuntes el PIN, secretos del servidor o claves privadas. El paquete de soporte se explica en la página 24.')

page('Actualizar y volver a una versión anterior','Las actualizaciones se aplican mediante paquetes firmados y destinos autorizados.')
steps(['El responsable de publicación prepara una versión revisada, fija desde qué versiones se admite el cambio y firma el paquete. En piloto, identifica los nombres de computadores autorizados.','El técnico revisa que no exista trabajo de firma activo o incierto. Conserva configuración, versiones y documentos. Prepara la solicitud de actualización.','Ejecuta el instalador firmado con la solicitud. El programa verifica el paquete, prepara otro directorio de versión, detiene sus componentes y cambia la ruta del servicio y de la bandeja.','Comprueba la disponibilidad del servicio y la bandeja, identidad conservada y nueva versión. Repite una prueba de la función del equipo antes de continuar con otros computadores.'])
code('''{
  "action": "update",
  "releaseDirectory": "C:\\\\Releases\\\\siguiente-version"
}''')
para('Guarda ese JSON en un archivo y ejecútalo con <b>Notifica.Setup.exe --request</b>, igual que en la instalación. No reemplaces manualmente los ejecutables de una versión instalada.')
sub('Si se necesita volver atrás')
para('Una reversión requiere un paquete firmado como <b>rollback</b>, autorizado desde la versión actual y compatible con el estado conservado. Utiliza una solicitud con <b>"action":"rollback"</b>. Una actualización normal no puede convertirse en una bajada de versión. No se permite superar hacia abajo el mínimo guardado para la instalación.')
box('Límite de la reversión','Volver a los binarios anteriores no revierte firmas, auditoría ni datos centrales. Tampoco restablece un dispositivo revocado. La distribución amplia requiere aceptación del piloto; el mecanismo actual no equivale a un actualizador silencioso que se descarga solo.')
para('El control de versión mínima del servidor admite recuperación y finalización de trabajo existente, pero puede impedir nuevas firmas o entregas en equipos antiguos. Coordina el cambio de ese mínimo con el despliegue real.')

page('Reparar o desinstalar','La retirada de un equipo debe cerrar su autorización sin destruir los documentos.')
sub('Instalación o actualización interrumpida')
para('El instalador conserva puntos de recuperación. Si una primera instalación falla después de validar la configuración y guardar su punto de recuperación, <b>repair</b> intenta continuar conservando la misma identidad. Si una actualización queda interrumpida, intenta restaurar la versión anterior registrada.')
code('{"action":"repair"}')
para('Usa ese archivo de solicitud con el instalador del mismo editor confiable. Los fallos anteriores a la creación del punto de recuperación necesitan inspección técnica. Un diario de firma sin resolver bloquea cambios; <b>repair no autoriza otra firma ni resuelve un resultado criptográfico incierto</b>.')
sub('Retirar un computador de manera normal')
steps(['Revisa la cola y detén el trabajo anterior. Conserva todo resultado que deba reconciliarse. Comprueba que no existe una firma incierta pendiente.','Con conexión al servidor, ejecuta el instalador firmado con una solicitud <b>{"action":"uninstall"}</b> o utiliza la entrada de programas instalados preparada por el paquete.','El agente demuestra su identidad; el servidor revoca el dispositivo y sus sesiones. Solo después de confirmar esa revocación se elimina su clave de dispositivo y se retiran el servicio y la tarea de bandeja.','Verifica la revocación central y que los PDF siguen disponibles. Decide por separado el archivo o la eliminación de datos retenidos conforme a la política de la oficina.'])
box('Qué permanece','La desinstalación conserva PDF, manifiestos, configuración, binarios y evidencia de recuperación. No elimina la clave del token USB. Si no puede confirmar revocación, conserva la instalación para reintentar; no simula una retirada exitosa.')
para('Si el equipo se pierde, el administrador revoca su identidad mediante la API administrativa: <b>{"action":"revoke","deviceId":"ID-DEL-EQUIPO"}</b>. Revocar en el servidor no borra remotamente las copias que ya estaban en ese computador.')

page('Renovar certificados y cambiar tokens','Planifica antes del vencimiento y conserva la evidencia histórica.')
sub('Renovación del certificado FEA')
steps(['Al recibir el aviso de vencimiento, coordina la renovación con el proveedor. El nuevo certificado suele tener una huella distinta; no asumas que la configuración anterior lo seleccionará.','El técnico pausa nuevas solicitudes automáticas para la oficina y revisa los trabajos pendientes o inciertos. No elimina resultados del certificado anterior.','Instala o habilita el certificado renovado por el procedimiento del proveedor. Verifica titular, vigencia, cadena y huella. Actualiza la selección protegida del agente y reinicia de forma controlada.','Actualiza la huella autorizada para nuevas solicitudes automáticas y verifica la que se selecciona en solicitudes manuales. No migres silenciosamente trabajos pendientes que estaban vinculados al certificado anterior.','Firma un documento de prueba con el perfil aprobado, verifica la validación y la entrega, y retira el certificado anterior de las nuevas solicitudes. Conserva evidencia e historial.'])
sub('Cambio o pérdida del token')
para('Si se cambia el hardware, revisa primero si quedó un intento abierto en el equipo anterior. Un token nuevo no demuestra que el anterior no haya firmado. Instala solo el controlador autorizado para el reemplazo y valida la nueva configuración. Ante pérdida o sospecha de compromiso, coordina además la actuación del proveedor sobre el certificado.')
sub('PIN bloqueado o vencido')
para('Usa el procedimiento oficial de recuperación del proveedor con el titular. NOTIFICA no conoce ni recupera el PIN y no debe intentar desbloquearlo mediante firmas repetidas. Tampoco almacena el PIN para reutilizarlo al reiniciar.')
box('No confundir renovaciones','Renovar el certificado FEA afecta a futuras firmas de documentos. Renovar el certificado del editor afecta a los instaladores y actualizaciones, y requiere una transición de confianza revisada por el responsable de publicación. Son mantenimientos distintos.')

page('Respaldo, auditoría y soporte','Conserva las pruebas del documento y separa los diagnósticos técnicos.')
table(['Información','Tratamiento actual'],[
('PDF originales y firmados; evidencia y auditoría central','Se conservan sin borrado automático de retención en esta implementación. El administrador debe planificar respaldo y recuperación del servidor.'),('Diarios activos y resultados locales','Se preservan para resolver intentos. No borrarlos como una limpieza ordinaria.'),('Manifiestos de recepción','Relacionan entrega, versión, huella y archivo local. Ayudan a recuperar y comprobar copias.'),('Diagnósticos nativos','Archivo operations.jsonl de hasta 1 MiB y uno anterior; antigüedad máxima de 30 días aplicada al volver a escribir.'),('Diagnósticos del servidor','El destino de logs debe restringir acceso y aplicar retención máxima de 30 días; es una tarea de despliegue.')],[.39,.61])
sub('Qué enviar a soporte')
para('Oficina, equipo y versión; fecha y hora del problema; identificador del documento, trabajo o entrega; mensaje o código visible; último estado correcto y acción previa. Si existe identificador de correlación, inclúyelo. Adjunta capturas y diagnósticos mínimos por el canal autorizado, revisando datos personales.')
para('No envíes PIN, códigos de inscripción todavía vigentes, claves privadas, tokens de sesión, credenciales del servidor o archivos completos de configuración sin revisión. Comparte documentos reales solo cuando el canal y la autorización permitan hacerlo.')
sub('Dónde conserva el agente su estado')
para('La instalación estándar ubica configuración y estado bajo <b>C:\\ProgramData\\NotificaIA\\Agent</b>; los binarios están bajo <b>C:\\Program Files\\NotificaIA\\Agent</b>. La carpeta de recepción es separada. Acceder o modificar el estado protegido corresponde al técnico.')
box('Prueba de respaldo','Disponer de una carpeta receptora no demuestra que el servidor esté respaldado. Deben probarse restauración de base de datos y almacenamiento juntos, sin romper referencias ni borrar auditoría. No clones una identidad CNG para trasladar un agente a otro equipo.')

page('Del piloto al uso habitual','Lista de aceptación para poder afirmar que el circuito completo funciona.')
para('El piloto debe usar una oficina identificada, un firmante con token real y <b>dos computadores receptores distintos</b>. Dos procesos en el mismo PC no acreditan ese requisito. El operador debe observar el recorrido completo sin descargar manualmente el resultado en los receptores.')
table(['Grupo de pruebas','Qué debe observarse'],[
('Trabajo normal','Finalizar flujo, solicitar desde otra computadora con una cuenta activa, habilitar el token una vez, validar, archivar y recibir en ambos computadores con SHA-256 idéntico.'),('Token y certificado','Ausencia antes de tomar trabajo, desconexión durante proceso, PIN incorrecto controlado, vencimiento, revocación y renovación con retiro del certificado anterior.'),('Servicios externos','TSA no disponible y revocación no disponible o desconocida, sin reducir silenciosamente el perfil.'),('Interrupciones','Corte al descargar/subir, respuesta duplicada o perdida, reinicio con asignación activa y lote parcialmente completado.'),('Recepción','Equipo desconectado que vuelve, disco lleno, archivo local modificado o eliminado, dispositivo revocado.'),('Instalador y operación','Instalación, actualización, reversión, reparación y retiro firmados; documentos preservados; credenciales revocadas; revisión de seguridad y aceptación del operador.')],[.31,.69])
para('El registro <b>phase11-pilot.template.json</b> reúne escenarios y evidencia. El verificador comprueba integridad y completitud del registro, pero una persona responsable debe revisar la evidencia real y aceptar el resultado. No se rellena con pruebas ficticias para habilitar despliegue.')
box('Pendientes a la fecha de este manual','No existe todavía una credencial de editor provisionada, un paquete firmado aceptado ni dos receptores disponibles para el piloto. La puesta en producción permanece pendiente. Las instrucciones aquí explicadas no sustituyen esa aceptación.',True)
para('Tras aceptar el piloto, habilita una oficina, observa cola, dispositivos, validación y entregas, y amplía de forma controlada. Coordina las pruebas de PIN con el titular para no bloquear el token real.')

page('Guía rápida y vocabulario','Una página para volver a las decisiones más habituales.')
table(['Quiero…','Acción correcta'],[
('Dar acceso web a una persona','Gestionar su cuenta y oficina; instalar agente solo en el equipo del token o para recibir copias locales.'),('Agregar otro receptor','Instalar paquete firmado, inscribir RECEIVER, probar carpeta y SHA-256.'),('Firmar documentos antiguos','Firmados, rango de ejecución, selección elegible y autorización web; sesión del token habilitada.'),('Recuperar una copia que no llegó','Revisar receptor y usar recuperación de entrega; no volver a firmar.'),('Repetir una firma fallida','Inspeccionar intento, diario y resultados; autorizar reintento revisado si corresponde.'),('Cambiar de computador','Inscribir nueva identidad y revocar la anterior cuando proceda; no copiar su clave.'),('Saber si terminó','Confirmar “Firmado y validado” y después cada entrega receptora.')],[.40,.60])
sub('Glosario breve')
para('<b>Agente:</b> programa Windows que conecta el equipo con NOTIFICA. <b>Bandeja:</b> icono junto al reloj. <b>Servicio:</b> parte que trabaja en segundo plano. <b>Inscripción:</b> autorización inicial del equipo para oficina y rol.')
para('<b>Versión:</b> contenido concreto de un documento. <b>SHA-256:</b> huella de sus bytes. <b>Huella de certificado:</b> identificador de un certificado, distinto del hash del PDF. <b>Manifiesto:</b> registro que relaciona una entrega con su copia.')
para('<b>Asignación o lease:</b> autorización temporal para que un agente procese un documento. <b>Diario:</b> registro local para continuar o investigar una operación. <b>Reconciliar:</b> comprobar si el servidor ya aceptó el mismo resultado.')
para('<b>Revocar dispositivo:</b> quitarle acceso futuro al servidor. <b>Revocar certificado:</b> invalidar un certificado mediante su proveedor. <b>Rollback:</b> retorno autorizado a una versión anterior del programa.')

page('Referencias y alcance','Fuentes de esta edición y límites que deben conservarse al actualizar el manual.')
sub('Fuentes internas consultadas')
para('<b>[I1]</b> docs/LIBRA_COMPETITION_AND_FEA_IMPLEMENTATION.md: arquitectura prevista, requisitos y criterios de piloto.<br/><b>[I2]</b> PHASE-0-RESULTS.md: evidencia técnica del token y limitaciones de TSA/política de uso.<br/><b>[I3]</b> docs/FIRMAR DIGITAL IMPLEMENTATION.md: comportamiento implementado, verificaciones y pendientes.<br/><b>[I4]</b> docs/signing/PHASE-11-RUNBOOK.md y agents/windows/release/install-request.example.json: distribución, instalación y operación técnica.<br/><b>[I5]</b> Código actual de FirmadosCenter, Tray, RemoteSessionDialog, operaciones de dispositivos y políticas de reintento: controles, roles y mensajes reales.')
sub('Documentación de proveedores')
refs=[
('E1','Microsoft: Authenticode','https://learn.microsoft.com/en-us/windows-hardware/drivers/install/authenticode'),
('E2','DigiCert: KeyLocker','https://docs.digicert.com/en/digicert-keylocker.html'),
('E3','DigiCert: integración de KeyLocker con SignTool','https://knowledge.digicert.com/tutorials/configure-keylocker-for-microsoft-signtool'),
('E4','DigiCert: solicitud de certificado de firma de código','https://docs.digicert.com/en/certcentral/order-and-manage-certificates/request-certificates/request-a-code-signing-or-ev-code-signing-certificate/request-code-signing-certificate.html'),
('E5','Microsoft: reputación de SmartScreen','https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation'),
('E6','Microsoft: elegibilidad y configuración de Artifact Signing','https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart'),
]
for key,title,url in refs: story.append(p(f'<b>[{key}]</b> <link href="{url}" color="#087F83">{title}</link>','small'))
para('Referencias externas consultadas para esta conversación el 23 de septiembre de 2026. Los requisitos comerciales y de elegibilidad pueden cambiar. Microsoft Artifact Signing no incluía Chile entre los países habilitados para confianza pública en la documentación consultada; confirma la jurisdicción real del editor antes de contratar. [E6]')
box('Alcance de la edición','Describe el comportamiento de la implementación y un procedimiento de instalación pendiente de aceptación productiva. No acredita una instalación real en nuevos usuarios, no fija una política jurídica de conservación y no convierte pruebas históricas en validación vigente de un PDF concreto.')

def decorate(c,doc):
    n=doc.page
    c.saveState()
    c.setFillColor(TEAL);c.rect(0,H-8,W,8,fill=1,stroke=0)
    c.setFont('Bold',9);c.setFillColor(TEAL);c.drawString(48,H-33,'NOTIFICA IA  /  MANUAL OPERATIVO')
    c.setStrokeColor(LINE);c.line(48,43,W-48,43)
    c.setFont('Body',8.5);c.setFillColor(MUTED);c.drawString(48,28,'Firma digital · Edición 1.1 · 23 septiembre 2026')
    c.setFont('Bold',9);c.drawRightString(W-48,28,f'{n:02d} / {len(page_titles):02d}')
    if n<=len(page_titles):
        c.bookmarkPage(f'bookmark{n}');c.addOutlineEntry(page_titles[n-1].replace('<br/>',' '),f'bookmark{n}',0,False)
    c.restoreState()

doc=SimpleDocTemplate(str(OUT),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=57,bottomMargin=58,
 title='NOTIFICA IA - Manual de firma digital',author='NOTIFICA IA',subject='Funcionamiento, instalación, uso y recuperación del módulo de firma digital')
doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
r=PdfReader(str(OUT))
if len(r.pages)!=len(page_titles): raise RuntimeError(f'Unexpected pagination: {len(r.pages)} vs {len(page_titles)}')
for i,pg in enumerate(r.pages):
    text=pg.extract_text()
    title=page_titles[i].replace('<br/>','\n')
    if title.split('\n')[0] not in text: raise RuntimeError(f'Page title mismatch {i+1}')
    if '\ufffd' in text: raise RuntimeError(f'Invalid character on page {i+1}')
(ROOT/'tmp/pdfs/qa-text.json').write_text(json.dumps({'pages':len(r.pages),'page_titles':page_titles,'characters':[len(x.extract_text()) for x in r.pages]},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Created {OUT}\n{len(r.pages)} pages; text and pagination checks passed.')
