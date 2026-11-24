import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Términos y condiciones y privacidad | NOTIFICA IA',
  description: 'Condiciones de uso y tratamiento de datos personales en el portal de abogados de NOTIFICA IA.',
}

const contacto = 'contacto@notificaia.cl'

export default function TerminosPage() {
  return (
    <div className="app-shell">
      <div className="page-frame mx-auto max-w-4xl py-8 sm:py-12">
        <header className="mb-6 border-b border-slate-200 pb-6">
          <Link href="/crear-cuenta" className="text-sm font-semibold text-blue-800 underline underline-offset-4">
            Volver a crear cuenta
          </Link>
          <h1 className="page-title mt-4">Términos y condiciones y política de privacidad</h1>
          <p className="mt-2 text-sm text-slate-600">NOTIFICA IA · Versión del <time dateTime="2026-11-24">24 de noviembre de 2026</time></p>
          <nav aria-label="Contenido del documento" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-blue-800 underline underline-offset-4">
            <a href="#condiciones">Condiciones de uso</a>
            <a href="#privacidad">Política de privacidad</a>
          </nav>
        </header>

        <article className="app-panel space-y-10 p-5 leading-relaxed text-slate-700 sm:p-9">
          <section id="condiciones" aria-labelledby="condiciones-titulo" className="scroll-mt-24 space-y-4">
            <h2 id="condiciones-titulo" className="text-2xl font-bold text-slate-950">Condiciones de uso</h2>
            <h3 className="text-lg font-semibold text-slate-950">Uso del portal</h3>
            <p>Estas condiciones regulan el uso del portal de abogados disponible en www.notificaia.cl. NOTIFICA IA ofrece herramientas para preparar y registrar encargos de diligencias judiciales, consultar perfiles de receptores y revisar el estado y los antecedentes asociados a cada encargo.</p>
            <p>El registro de un encargo, su asignación en el portal y cualquier estado que aparezca en pantalla deben interpretarse según la información disponible en cada caso. Registrar un encargo no confirma que un receptor lo haya aceptado ni que la diligencia se haya realizado. La ejecución de cada diligencia corresponde al receptor judicial que la asuma, conforme a sus atribuciones y deberes legales.</p>
            <h3 className="text-lg font-semibold text-slate-950">Registro y seguridad de la cuenta</h3>
            <p>Para abrir una cuenta debes tener al menos 18 años, contar con capacidad para contratar, entregar información correcta y aceptar expresamente estas condiciones. Si actúas por una organización, debes tener autorización para hacerlo. Mantén tus datos actualizados, resguarda tus credenciales y avísanos si detectas acceso o actividad que no reconoces. Cada cuenta es personal y sus credenciales no deben compartirse.</p>
            <h3 className="text-lg font-semibold text-slate-950">Responsabilidades en los encargos</h3>
            <p>Antes de registrar un encargo, verifica el rol o RIT, el tribunal, las direcciones y las instrucciones. Ingresa únicamente datos y documentos que estés autorizado a utilizar. Conserva la confidencialidad de los antecedentes judiciales y verifica los plazos y actuaciones ante los canales oficiales correspondientes. Las herramientas y la información del portal tienen fines de gestión y consulta. La orientación jurídica para un caso específico debe obtenerse de un profesional habilitado.</p>
            <p>Cuando estén disponibles, las vistas de pagos, boletas y estampos permiten consultar los registros asociados a un encargo. La visualización de un importe o de un estado en el portal no efectúa un pago ni reemplaza el documento oficial. Las condiciones económicas, la cancelación y las devoluciones de una diligencia deben consultarse con quien presta el servicio, sin perjuicio de los derechos que correspondan conforme a la ley.</p>
            <h3 className="text-lg font-semibold text-slate-950">Uso permitido y disponibilidad</h3>
            <p>Usa el portal para fines lícitos y mantén un trato respetuoso. Está prohibido suplantar identidades, cargar archivos maliciosos, acceder a cuentas o datos sin autorización, interferir con el servicio o divulgar información reservada. NOTIFICA IA puede limitar el acceso ante indicios de fraude, riesgo de seguridad o un incumplimiento grave. Las interrupciones por mantenimiento o incidentes pueden afectar la disponibilidad del portal.</p>
            <p>La marca, el software y los materiales propios de NOTIFICA IA y de sus licenciantes se encuentran protegidos por la normativa aplicable. Los documentos y datos que aportes mantienen la titularidad que les corresponda. Al incorporarlos, autorizas su uso en la medida necesaria para operar las funciones que solicites y cumplir las obligaciones aplicables.</p>
            <h3 className="text-lg font-semibold text-slate-950">Cambios, término y consultas</h3>
            <p>Puedes dejar de utilizar el portal o desactivar tu cuenta desde Ajustes. La desactivación no extingue obligaciones pendientes. Si estas condiciones cambian, la nueva versión indicará su fecha y los cambios relevantes se comunicarán por el portal o al correo registrado. Se solicitará una nueva aceptación cuando corresponda.</p>
            <p>Estas condiciones se rigen por la legislación chilena. Las controversias se someten a las autoridades o tribunales competentes conforme a la ley. Para consultas sobre el portal o estas condiciones, escribe a <a className="text-blue-800 underline underline-offset-4" href={`mailto:${contacto}`}>{contacto}</a>.</p>
          </section>

          <section id="privacidad" aria-labelledby="privacidad-titulo" className="scroll-mt-24 space-y-4 border-t border-slate-200 pt-7">
            <h2 id="privacidad-titulo" className="text-2xl font-bold text-slate-950">Política de privacidad</h2>
            <p>Esta política describe cómo se tratan los datos personales necesarios para operar el portal de abogados de NOTIFICA IA. El tratamiento se rige por la normativa chilena de protección de datos personales aplicable.</p>
            <h3 className="text-lg font-semibold text-slate-950">Información que utilizamos</h3>
            <ul className="list-disc space-y-2 pl-6">
              <li>Datos de cuenta y contacto, como nombre, apellidos, correo electrónico y la fecha y versión de las condiciones aceptadas.</li>
              <li>Antecedentes que ingreses para gestionar encargos, como tribunal, rol o RIT, direcciones e instrucciones. Si usas las opciones de facturación, estos antecedentes pueden incluir nombre o razón social, RUT y domicilio de facturación.</li>
              <li>Datos técnicos necesarios para operar y proteger el servicio, como registros de acceso, sesión, dirección IP e identificadores de solicitudes.</li>
            </ul>
            <h3 className="text-lg font-semibold text-slate-950">Finalidades y acceso</h3>
            <p>Usamos estos datos para autenticar y administrar cuentas, responder consultas, registrar encargos y sus estados, mantener la seguridad, resolver incidencias y cumplir obligaciones legales. El tratamiento se realiza con el fundamento que corresponda en cada caso.</p>
            <p>Los proveedores tecnológicos pueden acceder a la información necesaria para prestar servicios de alojamiento, autenticación o correo. Los antecedentes de una diligencia podrán ponerse a disposición del receptor autorizado cuando sea necesario para gestionar el encargo. También podremos entregar información cuando exista una obligación legal o un requerimiento de una autoridad competente.</p>
            <h3 className="text-lg font-semibold text-slate-950">Seguridad, conservación y cookies</h3>
            <p>Aplicamos controles de acceso y usamos conexiones seguras para proteger la información. Conservamos los datos durante el tiempo necesario para gestionar la cuenta y los encargos, atender solicitudes y cumplir los deberes de conservación aplicables. La desactivación de una cuenta no elimina automáticamente sus registros. El portal usa cookies de sesión para mantener el acceso y proteger la cuenta.</p>
            <h3 className="text-lg font-semibold text-slate-950">Ejercicio de derechos</h3>
            <p>Para solicitar acceso, rectificación, supresión, oposición u otro derecho que reconozca la ley, escribe a <a className="text-blue-800 underline underline-offset-4" href={`mailto:${contacto}`}>{contacto}</a>. Indica el correo asociado a tu cuenta y el derecho que deseas ejercer. Podremos solicitar una verificación proporcionada de tu identidad antes de responder.</p>
          </section>
        </article>
      </div>
    </div>
  )
}
