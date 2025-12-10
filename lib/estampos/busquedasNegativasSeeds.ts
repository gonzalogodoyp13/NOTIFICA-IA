import type { EstampoBaseSeed } from './types'

export const busquedasNegativasSeeds: EstampoBaseSeed[] = [
  {
    slug: 'busqueda_negativa_direccion_incompleta',
    nombreVisible: 'Dirección señalada se encuentra incompleta',
    categoria: 'BUSQUEDA_NEGATIVA',
    descripcion: 'Búsqueda negativa cuando la dirección informada por la parte está incompleta.',
    textoTemplate: [
      'CERTIFICO: Haberme constituido en el domicilio ubicado en $direccion_ejecutado, siendo las $hora_diligencia horas, para dar cumplimiento a la diligencia de notificar a $tratamiento_corto $nombre_ejecutado, la demanda y resolución precedente, diligencia que no pude efectuar por cuanto, la dirección señalada se encuentra incompleta. En $solo_comuna_ejecutado a $fecha_palabras_diligencia.-',
      '',
      'Drs $monto_ejecutado',
      '$firma',
    ].join('\n'),
    variablesSchema: [
      // 3.1 Auto-filled variables
      {
        name: 'direccion_ejecutado',
        label: 'Dirección del ejecutado',
        type: 'TEXT',
        source: 'ROL',
        required: true,
      },
      {
        name: 'hora_diligencia',
        label: 'Hora de la diligencia',
        type: 'TIME',
        source: 'DILIGENCIA',
        required: true,
      },
      {
        name: 'nombre_ejecutado',
        label: 'Nombre del ejecutado',
        type: 'TEXT',
        source: 'ROL',
        required: true,
      },
      {
        name: 'solo_comuna_ejecutado',
        label: 'Comuna del domicilio',
        type: 'TEXT',
        source: 'ROL',
        required: true,
      },
      {
        name: 'fecha_palabras_diligencia',
        label: 'Fecha de la diligencia (en palabras)',
        type: 'TEXT',
        source: 'DILIGENCIA',
        required: true,
      },
      {
        name: 'monto_ejecutado',
        label: 'Monto adeudado',
        type: 'MONEY',
        source: 'ROL',
        required: false,
      },
      {
        name: 'firma',
        label: 'Firma del receptor',
        type: 'TEXT',
        source: 'USUARIO',
        required: true,
      },
      // 3.2 Wizard + derived
      {
        name: 'sexo_demandado',
        label: 'Sexo del demandado',
        type: 'ENUM',
        source: 'USUARIO',
        required: true,
        enumOptions: [
          { value: 'MASCULINO', label: 'Masculino' },
          { value: 'FEMENINO', label: 'Femenino' },
          { value: 'NO_DEFINIR', label: 'No definir' },
        ],
      },
      {
        name: 'tratamiento_corto',
        label: 'Tratamiento corto (don/doña/don(ña))',
        type: 'DERIVED',
        source: 'DERIVED',
        required: true,
        derivedFrom: ['sexo_demandado'],
      },
      {
        name: 'tratamiento_largo',
        label: 'Tratamiento largo (el demandado/la demandada/el(la) demandadX)',
        type: 'DERIVED',
        source: 'DERIVED',
        required: true,
        derivedFrom: ['sexo_demandado'],
      },
    ],
    wizardSchema: [
      {
        order: 1,
        variable: 'sexo_demandado',
        text: 'Sexo del demandado',
        inputType: 'RADIO',
        options: [
          { value: 'MASCULINO', label: 'Masculino' },
          { value: 'FEMENINO', label: 'Femenino' },
          { value: 'NO_DEFINIR', label: 'No definir' },
        ],
      },
    ],
  },
  {
    slug: 'busqueda_negativa_falta_numero_casa',
    nombreVisible: 'Falta especificar número de casa',
    categoria: 'BUSQUEDA_NEGATIVA',
    descripcion:
      'Búsqueda negativa cuando la dirección indicada no tiene numeración o falta el número de casa del inmueble.',
    textoTemplate: [
      'CERTIFICO: Haberme constituido en el domicilio ubicado en $direccion_ejecutado, siendo las $hora_diligencia horas, para dar cumplimiento a la diligencia de notificar a $tratamiento_corto $nombre_ejecutado, la demanda y resolución precedente, diligencia que no pude realizar, por cuanto, no existe la numeración $numero_casa en la dirección señalada. En $solo_comuna_ejecutado a $fecha_palabras_diligencia.-',
      '',
      'Drs $monto_ejecutado',
      '$firma',
    ].join('\n'),
    variablesSchema: [
      // 3.1 Auto-filled variables
      {
        name: 'direccion_ejecutado',
        label: 'Dirección del ejecutado',
        type: 'TEXT',
        source: 'ROL',
        required: true,
      },
      {
        name: 'hora_diligencia',
        label: 'Hora de la diligencia',
        type: 'TIME',
        source: 'DILIGENCIA',
        required: true,
      },
      {
        name: 'nombre_ejecutado',
        label: 'Nombre del ejecutado',
        type: 'TEXT',
        source: 'ROL',
        required: true,
      },
      {
        name: 'solo_comuna_ejecutado',
        label: 'Comuna del domicilio',
        type: 'TEXT',
        source: 'ROL',
        required: true,
      },
      {
        name: 'fecha_palabras_diligencia',
        label: 'Fecha de la diligencia (en palabras)',
        type: 'TEXT',
        source: 'DILIGENCIA',
        required: true,
      },
      {
        name: 'monto_ejecutado',
        label: 'Monto adeudado',
        type: 'MONEY',
        source: 'ROL',
        required: false,
      },
      {
        name: 'firma',
        label: 'Firma del receptor',
        type: 'TEXT',
        source: 'USUARIO',
        required: true,
      },
      // 3.2 Wizard + derived
      {
        name: 'sexo_demandado',
        label: 'Sexo del demandado',
        type: 'ENUM',
        source: 'USUARIO',
        required: true,
        enumOptions: [
          { value: 'MASCULINO', label: 'Masculino' },
          { value: 'FEMENINO', label: 'Femenino' },
          { value: 'NO_DEFINIR', label: 'No definir' },
        ],
      },
      {
        name: 'tratamiento_corto',
        label: 'Tratamiento corto (don/doña/don(ña))',
        type: 'DERIVED',
        source: 'DERIVED',
        required: true,
        derivedFrom: ['sexo_demandado'],
      },
      {
        name: 'tratamiento_largo',
        label: 'Tratamiento largo (el demandado/la demandada/el(la) demandado(a))',
        type: 'DERIVED',
        source: 'DERIVED',
        required: true,
        derivedFrom: ['sexo_demandado'],
      },
      {
        name: 'numero_casa',
        label: 'Numeración (número de casa) indicada en la dirección',
        type: 'TEXT',
        source: 'USUARIO',
        required: true,
      },
    ],
    wizardSchema: [
      {
        order: 1,
        variable: 'sexo_demandado',
        text: 'Sexo del demandado',
        inputType: 'RADIO',
        options: [
          { value: 'MASCULINO', label: 'Masculino' },
          { value: 'FEMENINO', label: 'Femenino' },
          { value: 'NO_DEFINIR', label: 'No definir' },
        ],
      },
      {
        order: 2,
        variable: 'numero_casa',
        text: 'Numeración (número de casa) indicada en la dirección',
        inputType: 'TEXT',
      },
    ],
  },
]

