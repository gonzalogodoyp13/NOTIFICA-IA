type Sede = string | [ciudad: string, primero: number, ultimo?: number]

function tribunales(tipo: string, ...sedes: Sede[]) {
  return sedes.flatMap(sede => {
    if (typeof sede === 'string') return `${tipo} de ${sede}`
    const [ciudad, primero, ultimo = primero] = sede
    return Array.from({ length: ultimo - primero + 1 }, (_, index) => `${primero + index}° ${tipo} de ${ciudad}`)
  })
}

const civil = (...sedes: Sede[]) => tribunales('Juzgado Civil', ...sedes)
const letras = (...sedes: Sede[]) => tribunales('Juzgado de Letras', ...sedes)
const mixto = (...sedes: Sede[]) => tribunales('Juzgado de Letras y Garantía', ...sedes)
const garantia = (...sedes: Sede[]) => tribunales('Juzgado de Garantía', ...sedes)
const penal = (...sedes: Sede[]) => tribunales('Tribunal de Juicio Oral en lo Penal', ...sedes)
const familia = (...sedes: Sede[]) => tribunales('Juzgado de Familia', ...sedes)
const trabajo = (...sedes: Sede[]) => tribunales('Juzgado de Letras del Trabajo', ...sedes)
const cobranza = (...sedes: Sede[]) => tribunales('Juzgado de Cobranza Laboral y Previsional', ...sedes)

export const tribunalesPorCorte: Readonly<Record<string, readonly string[]>> = {
  'C.A. Arica': [
    ...letras(['Arica', 1, 3]), ...garantia('Arica'), ...penal('Arica'), ...familia('Arica'), ...trabajo('Arica'),
  ],
  'C.A. Iquique': [
    ...letras(['Iquique', 1, 3], 'Alto Hospicio'), ...mixto('Pozo Almonte'), ...garantia('Iquique', 'Alto Hospicio'),
    ...penal('Iquique'), ...familia('Iquique', 'Alto Hospicio'), ...trabajo('Iquique'),
  ],
  'C.A. Antofagasta': [
    ...tribunales('Juzgado de Letras en lo Civil', ['Antofagasta', 1, 4]), ...letras(['Calama', 1, 3], 'Tocopilla'),
    ...mixto('Mejillones', 'Taltal', 'María Elena'), ...garantia('Antofagasta', 'Calama', 'Tocopilla'),
    ...penal('Antofagasta', 'Calama'), ...familia('Antofagasta', 'Calama'), ...trabajo('Antofagasta', 'Calama'),
  ],
  'C.A. Copiapó': [
    ...letras(['Copiapó', 1, 4], ['Vallenar', 1, 2]), ...mixto('Chañaral', 'Diego de Almagro', 'Caldera', 'Freirina'),
    ...garantia('Copiapó', 'Vallenar'), ...penal('Copiapó'), ...familia('Copiapó', 'Vallenar'), ...trabajo('Copiapó'),
  ],
  'C.A. La Serena': [
    ...letras(['La Serena', 1, 3], ['Coquimbo', 1, 3], ['Ovalle', 1, 2], 'Illapel'),
    ...mixto('Vicuña', 'Andacollo', 'Combarbalá', 'Los Vilos'), ...garantia('La Serena', 'Coquimbo', 'Ovalle', 'Illapel'),
    ...penal('La Serena', 'Ovalle'), ...familia('La Serena', 'Coquimbo', 'Ovalle'), ...trabajo('La Serena'),
  ],
  'C.A. Valparaíso': [
    ...civil(['Valparaíso', 1, 5], ['Viña del Mar', 1, 3]),
    ...letras(['Quilpué', 1, 2], 'Villa Alemana', ['Quillota', 1, 2], 'La Calera', 'Limache', ['San Antonio', 1, 2],
      ['San Felipe', 1], ['Los Andes', 1, 2], 'La Ligua', 'Casablanca'),
    ...mixto('Petorca', 'Putaendo', 'Quintero', 'Isla de Pascua'),
    ...garantia('Valparaíso', 'Viña del Mar', 'Quilpué', 'Villa Alemana', 'Quillota', 'La Calera', 'Limache',
      'San Antonio', 'San Felipe', 'Los Andes', 'La Ligua', 'Casablanca'),
    ...penal('Valparaíso', 'Viña del Mar', 'Quillota', 'San Antonio', 'San Felipe', 'Los Andes'),
    ...familia('Valparaíso', 'Viña del Mar', 'Quilpué', 'Villa Alemana', 'Quillota', 'La Calera', 'Limache',
      'San Antonio', 'San Felipe', 'Los Andes', 'La Ligua', 'Casablanca'),
    ...trabajo('Valparaíso', 'San Felipe'), ...cobranza('Valparaíso'),
  ],
  'C.A. Santiago': [
    ...civil(['Santiago', 1, 30]), ...letras('Colina'), ...garantia(['Santiago', 1, 9], 'Colina'),
    ...penal(['Santiago', 1, 7], 'Colina'), ...familia(['Santiago', 1, 4], 'Pudahuel', 'Colina'),
    ...trabajo(['Santiago', 1, 2]), ...cobranza('Santiago'),
  ],
  'C.A. San Miguel': [
    ...civil(['San Miguel', 1, 4], ['Puente Alto', 1]),
    ...letras(['San Bernardo', 1, 2], ['Talagante', 1, 2], ['Peñaflor', 1, 2], ['Buin', 1, 2], ['Melipilla', 1]),
    ...garantia(['Santiago', 10, 15], 'Puente Alto', 'San Bernardo', 'Talagante', 'Melipilla', 'Curacaví'),
    ...penal('San Miguel', 'Puente Alto', 'San Bernardo', 'Talagante', 'Melipilla'),
    ...familia(['San Miguel', 1, 2], 'Puente Alto', 'San Bernardo', 'Talagante', 'Peñaflor', 'Buin', 'Melipilla'),
    ...trabajo('San Miguel', 'Puente Alto', 'San Bernardo'), ...cobranza('San Miguel'),
  ],
  'C.A. Rancagua': [
    ...civil(['Rancagua', 1, 2]), ...letras(['San Fernando', 1, 2], ['Rengo', 1], 'San Vicente', ['Santa Cruz', 1, 2]),
    ...mixto('Peumo', 'Pichilemu', 'Peralillo', 'Litueche'), ...garantia('Rancagua', 'Graneros', 'San Fernando', 'Rengo', 'San Vicente', 'Santa Cruz'),
    ...penal('Rancagua', 'San Fernando', 'Santa Cruz'), ...familia('Rancagua', 'San Fernando', 'Rengo', 'Santa Cruz'), ...trabajo('Rancagua'),
  ],
  'C.A. Talca': [
    ...letras(['Talca', 1, 4], ['Curicó', 1, 2], ['Linares', 1, 2], 'Constitución', 'Cauquenes', 'Parral', 'San Javier', 'Molina'),
    ...mixto('Chanco', 'Curepto', 'Licantén'), ...garantia('Talca', 'Curicó', 'Linares', 'Constitución', 'Cauquenes', 'Parral', 'San Javier', 'Molina'),
    ...penal('Talca', 'Curicó', 'Linares', 'Cauquenes'), ...familia('Talca', 'Curicó', 'Linares', 'Constitución', 'Parral'), ...trabajo('Talca', 'Curicó'),
  ],
  'C.A. Chillán': [
    ...civil(['Chillán', 1, 2]), ...letras(['San Carlos', 1]), ...mixto('Yungay', 'Bulnes', 'Quirihue', 'Coelemu'),
    ...garantia('Chillán', 'San Carlos'), ...penal('Chillán'), ...familia('Chillán'), ...trabajo('Chillán'),
  ],
  'C.A. Concepción': [
    ...civil(['Concepción', 1, 3], ['Talcahuano', 1, 2]), ...letras(['Coronel', 1, 2], ['Los Ángeles', 1, 2], 'Tomé'),
    ...mixto('Lota', 'Yumbel', 'Cabrero', 'Laja', 'Mulchén', 'Nacimiento', 'Santa Bárbara', 'Arauco', 'Lebu', 'Cañete', 'Curanilahue'),
    ...garantia('Concepción', 'Talcahuano', 'Coronel', 'Chiguayante', 'San Pedro de la Paz', 'Tomé', 'Los Ángeles'),
    ...penal('Concepción', 'Los Ángeles', 'Cañete'), ...familia('Concepción', 'Talcahuano', 'Coronel', 'Tomé', 'Los Ángeles', 'Yumbel'),
    ...trabajo('Concepción', 'Los Ángeles'), ...cobranza('Concepción'),
  ],
  'C.A. Temuco': [
    ...civil(['Temuco', 1, 3]), ...letras(['Angol', 1, 2], 'Villarrica', 'Victoria', 'Lautaro', 'Nueva Imperial', 'Pitrufquén', 'Loncoche'),
    ...mixto('Traiguén', 'Collipulli', 'Curacautín', 'Carahue', 'Pucón', 'Toltén', 'Purén'),
    ...garantia('Temuco', 'Angol', 'Villarrica', 'Victoria', 'Lautaro', 'Nueva Imperial', 'Pitrufquén', 'Loncoche'),
    ...penal('Temuco', 'Angol'), ...familia('Temuco', 'Angol', 'Villarrica', 'Victoria', 'Lautaro', 'Nueva Imperial', 'Pitrufquén', 'Loncoche'), ...trabajo('Temuco'),
  ],
  'C.A. Valdivia': [
    ...civil(['Valdivia', 1, 2]), ...letras(['Osorno', 1, 2], 'La Unión', 'Río Bueno', 'Mariquina'),
    ...mixto('Panguipulli', 'Paillaco', 'Los Lagos', 'Río Negro'), ...garantia('Valdivia', 'Osorno', 'La Unión', 'Río Bueno', 'Mariquina'),
    ...penal('Valdivia', 'Osorno'), ...familia('Valdivia', 'Osorno'), ...trabajo('Valdivia', 'Osorno'),
  ],
  'C.A. Puerto Montt': [
    ...civil(['Puerto Montt', 1, 2]), ...letras('Puerto Varas', 'Castro', 'Ancud'),
    ...mixto('Calbuco', 'Maullín', 'Los Muermos', 'Quellón', 'Quinchao', 'Chaitén', 'Hualaihué'),
    ...garantia('Puerto Montt', 'Puerto Varas', 'Castro', 'Ancud'), ...penal('Puerto Montt', 'Castro'),
    ...familia('Puerto Montt', 'Puerto Varas', 'Castro', 'Ancud'), ...trabajo('Puerto Montt', 'Castro'),
  ],
  'C.A. Coyhaique': [
    ...letras(['Coyhaique', 1]), ...mixto('Puerto Aysén', 'Chile Chico', 'Cochrane', 'Puerto Cisnes'),
    ...garantia('Coyhaique'), ...penal('Coyhaique'), 'Juzgado de Familia y Letras del Trabajo de Coyhaique',
  ],
  'C.A. Punta Arenas': [
    ...letras(['Punta Arenas', 1, 3]), ...mixto('Puerto Natales', 'Porvenir', 'Cabo de Hornos'),
    ...garantia('Punta Arenas'), ...penal('Punta Arenas'), ...familia('Punta Arenas'), ...trabajo('Punta Arenas'),
  ],
}

export const cortesDeApelaciones = Object.keys(tribunalesPorCorte)

export function tribunalesDeCorte(corte: string) {
  return Object.hasOwn(tribunalesPorCorte, corte) ? tribunalesPorCorte[corte] : []
}
