"use client";

import { useEffect, useState } from "react";

type EstampoFormProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
  onSaved: () => void;
};

export function EstampoForm({ open, setOpen, onSaved }: EstampoFormProps) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("sello");
  const [fileUrl, setFileUrl] = useState("");
  const [contenido, setContenido] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setNombre("");
      setTipo("sello");
      setFileUrl("");
      setContenido("");
      setSaving(false);
    }
  }, [open]);

  async function handleSave() {
    try {
      if (!nombre.trim()) {
        alert("El nombre es obligatorio");
        return;
      }

      setSaving(true);

      const response = await fetch("/api/estampos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          tipo,
          fileUrl,
          contenido,
        }),
      });

      if (!response.ok) {
        throw new Error("Error al crear el estampo");
      }

      alert("Estampo creado correctamente");
      setOpen(false);
      onSaved();
      setNombre("");
      setTipo("sello");
      setFileUrl("");
      setContenido("");
      setSaving(false);
    } catch (error) {
      console.error(error);
      alert("Error al crear estampo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition ${
        open ? "visible opacity-100" : "invisible opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Nuevo Estampo</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          <input
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="border rounded p-2 w-full"
          />
          <select
            className="border rounded p-2 w-full"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="sello">Sello</option>
            <option value="firma">Firma</option>
            <option value="modelo">Modelo</option>
          </select>
          <input
            placeholder="URL del archivo (opcional)"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            className="border rounded p-2 w-full"
          />
          <textarea
            placeholder="Contenido del estampo (opcional)"
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            className="border rounded p-2 w-full h-32"
          />
          <div className="text-xs text-gray-500">
            Sugerencia: usa variables como <code>$nombre_ejecutado</code>,{" "}
            <code>$rut_ejecutado</code> o <code>$fecha_palabras_diligencia</code>.
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

