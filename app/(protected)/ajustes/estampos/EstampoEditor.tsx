"use client";

import { useEffect, useRef, useState } from "react";
import { VariableToolbar } from "./VariableToolbar";

type EstampoEditorProps = {
  estampo: {
    id: string;
    nombre: string;
    tipo: string;
    contenido?: string | null;
    fileUrl?: string | null;
  };
  onSaved?: () => void;
};

export function EstampoEditor({ estampo, onSaved }: EstampoEditorProps) {
  const [contenido, setContenido] = useState(estampo?.contenido || "");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setContenido(estampo?.contenido || "");
  }, [estampo]);

  function insertVariable(token: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText =
      contenido.substring(0, start) + token + contenido.substring(end);

    setContenido(newText);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      const res = await fetch("/api/estampos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: estampo.id,
          nombre: estampo.nombre,
          tipo: estampo.tipo,
          contenido,
          fileUrl: estampo.fileUrl ?? "",
        }),
      });

      if (!res.ok) {
        throw new Error("Error al guardar el estampo");
      }

      alert("Modelo actualizado correctamente");
      onSaved?.();
    } catch (error) {
      console.error(error);
      alert("No se pudo actualizar el estampo");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    try {
      setPreviewing(true);
      const res = await fetch("/api/pdf/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contenido,
          variables: {
            nombre_ejecutado: "Juan Pérez",
            direccion_ejecutado: "Av. Providencia 1100",
            fecha_palabras_diligencia: "10 de noviembre de 2025",
            hora_diligencia: "10:30",
            rol: "C-1234-2025",
            tribunal: "Juzgado Civil de Santiago",
            cuantia: "500.000",
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Error generando vista previa");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      alert("No se pudo generar la vista previa");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <VariableToolbar onInsert={insertVariable} />
      <textarea
        id="contenidoBox"
        ref={textareaRef}
        className="border rounded-md w-full h-64 p-3 font-mono text-sm"
        placeholder="Escriba aquí el cuerpo del estampo con variables como $nombre_ejecutado, $fecha_palabras_diligencia, etc."
        value={contenido}
        onChange={(e) => setContenido(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={handlePreview}
          className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 transition disabled:opacity-60"
          disabled={previewing}
        >
          {previewing ? "Generando..." : "Vista previa"}
        </button>
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60 transition"
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

