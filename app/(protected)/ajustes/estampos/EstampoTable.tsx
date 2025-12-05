"use client";

type EstampoTableProps = {
  data: {
    id: string;
    nombre: string;
    tipo: string;
    activo: boolean;
    contenido?: string | null;
    fileUrl?: string | null;
  }[];
  onRefresh: () => void;
  onEdit: (estampo: EstampoTableProps["data"][number]) => void;
};

export function EstampoTable({ data, onRefresh, onEdit }: EstampoTableProps) {
  if (!data || data.length === 0)
    return <p className="text-gray-500">No hay estampos registrados.</p>;

  async function handleDelete(id: string) {
    const confirmDelete = window.confirm(
      "¿Seguro que deseas eliminar este estampo?"
    );

    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/estampos/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Error eliminando estampo");
      }

      alert("Estampo eliminado");
      onRefresh();
    } catch (error) {
      console.error(error);
      alert("No se pudo eliminar el estampo");
    }
  }

  return (
    <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
      <thead className="bg-gray-100">
        <tr>
          <th className="p-2 text-left">Nombre</th>
          <th className="p-2 text-left">Tipo</th>
          <th className="p-2 text-left">Activo</th>
          <th className="p-2 text-left">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {data.map((e) => (
          <tr key={e.id} className="border-t">
            <td className="p-2">{e.nombre}</td>
            <td className="p-2">{e.tipo}</td>
            <td className="p-2">{e.activo ? "✅" : "❌"}</td>
            <td className="p-2">
              <div className="flex gap-2 flex-wrap">
                <button
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition text-sm"
                  onClick={() => onEdit(e)}
                >
                  Editar modelo
                </button>
                <button
                  className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition text-sm"
                  onClick={() => handleDelete(e.id)}
                >
                  Eliminar
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

