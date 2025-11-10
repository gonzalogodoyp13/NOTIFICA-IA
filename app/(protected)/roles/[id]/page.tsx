export default function RolDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-2">Detalle del Rol</h1>
      <p className="text-gray-700">
        ROL seleccionado: <span className="font-semibold">{params.id}</span>
      </p>
      <p className="mt-4 text-gray-500">
        Aquí se mostrarán las diligencias, documentos, boletas y demás información del caso en fases futuras.
      </p>
    </div>
  )
}

