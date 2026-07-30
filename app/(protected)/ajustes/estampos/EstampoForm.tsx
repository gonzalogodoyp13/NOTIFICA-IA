"use client";

import { useEffect, useRef, useState } from "react";

import { VariableToolbar } from "./VariableToolbar";

type EstampoFormProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
  onSaved: () => void;
};

export function EstampoForm({ open, setOpen, onSaved }: EstampoFormProps) {
  const [nombre, setNombre] = useState("");
  const [contenido, setContenido] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) {
      setNombre("");
      setContenido("");
      setSaving(false);
    }
  }, [open]);

  function insertVariable(token: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = contenido.substring(0, start) + token + contenido.substring(end);

    setContenido(nextText);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    });
  }

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
          tipo: "modelo",
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
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 transition ${
        open ? "visible opacity-100" : "invisible opacity-0"
      }`}
      aria-hidden={!open}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Nuevo Estampo</h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
            type="button"
            disabled={saving}
          >
            x
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="estampo-nombre">
              Nombre
            </label>
            <input
              id="estampo-nombre"
              placeholder="Ej: Busqueda negativa"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="estampo-contenido">
              Contenido del estampo
            </label>
            <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3">
              <VariableToolbar onInsert={insertVariable} />
            </div>
            <textarea
              id="estampo-contenido"
              ref={textareaRef}
              placeholder="Escribe el contenido del estampo..."
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              className="h-80 w-full resize-y rounded border border-slate-300 p-3 font-mono text-sm leading-6 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            onClick={() => setOpen(false)}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            disabled={saving}
            type="button"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            disabled={saving}
            type="button"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
