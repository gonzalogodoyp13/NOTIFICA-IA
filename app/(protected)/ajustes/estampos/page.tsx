"use client";

import { useState, useEffect } from "react";
import { EstampoTable } from "./EstampoTable";
import { EstampoForm } from "./EstampoForm";
import { EstampoEditor } from "./EstampoEditor";

type EstampoItem = {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  contenido?: string | null;
  fileUrl?: string | null;
};

export default function EstamposPage() {
  const [estampos, setEstampos] = useState<EstampoItem[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedEstampo, setSelectedEstampo] = useState<EstampoItem | null>(
    null
  );

  async function fetchEstampos() {
    try {
      const res = await fetch("/api/estampos");
      const data = await res.json();
      setEstampos(data.estampos || []);
    } catch (err) {
      alert("Error al cargar estampos");
    }
  }

  useEffect(() => {
    fetchEstampos();
  }, []);

  function handleEdit(estampo: EstampoItem) {
    setSelectedEstampo(estampo);
  }

  function handleEditorSaved() {
    fetchEstampos();
    setSelectedEstampo(null);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Estampos de Oficina</h1>
        <button
          onClick={() => setOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          + Nuevo Estampo
        </button>
      </div>

      <EstampoTable
        data={estampos}
        onRefresh={fetchEstampos}
        onEdit={handleEdit}
      />
      <EstampoForm open={open} setOpen={setOpen} onSaved={fetchEstampos} />

      {selectedEstampo && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Editar modelo: {selectedEstampo.nombre}
              </h2>
              <p className="text-sm text-gray-500">
                Tipo: {selectedEstampo.tipo}
              </p>
            </div>
            <button
              onClick={() => setSelectedEstampo(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              Cerrar
            </button>
          </div>

          <EstampoEditor estampo={selectedEstampo} onSaved={handleEditorSaved} />
        </div>
      )}
    </div>
  );
}
