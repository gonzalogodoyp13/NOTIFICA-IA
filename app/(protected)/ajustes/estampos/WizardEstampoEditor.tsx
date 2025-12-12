"use client";

import { useEffect, useRef, useState } from "react";
import { validateRequiredVariables } from "@/lib/estampos/variables";
import type { VariableDef } from "@/lib/estampos/types";

type WizardEstampoItem = {
  id: number;
  slug: string;
  nombreVisible: string;
  categoria: string;
  descripcion: string | null;
  textoTemplate: string;
  variablesSchema: VariableDef[];
  wizardSchema: any[];
  hasCustom: boolean;
  customId?: number;
};

type WizardEstampoEditorProps = {
  estampo: WizardEstampoItem;
  onSaved?: () => void;
  onReset?: () => void;
};

export function WizardEstampoEditor({
  estampo,
  onSaved,
  onReset,
}: WizardEstampoEditorProps) {
  const [textoTemplate, setTextoTemplate] = useState(estampo?.textoTemplate || "");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingVars, setMissingVars] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setTextoTemplate(estampo?.textoTemplate || "");
    setError(null);
    setMissingVars([]);
  }, [estampo]);

  function insertVariable(variableName: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const token = `$${variableName}`;
    const newText =
      textoTemplate.substring(0, start) + token + textoTemplate.substring(end);

    setTextoTemplate(newText);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setMissingVars([]);

      // Build set of wizard variables (answered via wizard, not in template)
      const wizardVars = new Set(estampo.wizardSchema.map((q) => q.variable));

      // Only validate variables that must appear in template:
      // - required === true
      // - NOT a wizard variable (answered via wizard)
      // - NOT a derived variable (computed automatically)
      const requiredVars = estampo.variablesSchema
        .filter((v) => {
          if (!v.required) return false;
          if (wizardVars.has(v.name)) return false;  // Exclude wizard vars
          if (v.source === 'DERIVED') return false;  // Exclude derived vars (confirmed: uses 'DERIVED')
          return true;
        })
        .map((v) => v.name);

      // Validate template using validateRequiredVariables helper
      const validation = validateRequiredVariables(textoTemplate, requiredVars);

      if (!validation.valid) {
        setError("Faltan variables requeridas del asistente");
        setMissingVars(validation.missing);
        return;
      }

      const res = await fetch("/api/estampos-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseId: estampo.id,
          textoTemplate,
        }),
        credentials: "include",
      });

      const result = await res.json();

      if (!res.ok || result?.ok !== true) {
        const errorMsg = result?.error || "Error al guardar el estampo";
        const missing = result?.missing as string[] | undefined;
        throw new Error(
          missing && missing.length > 0
            ? `${errorMsg}: ${missing.join(", ")}`
            : errorMsg
        );
      }

      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el estampo");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (
      !confirm(
        "¿Estás seguro de que deseas restablecer este estampo a la versión oficial? Se perderán los cambios personalizados."
      )
    ) {
      return;
    }

    try {
      setResetting(true);
      setError(null);

      const res = await fetch("/api/estampos-custom/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseId: estampo.id,
        }),
        credentials: "include",
      });

      const result = await res.json();

      if (!res.ok || result?.ok !== true) {
        throw new Error(result?.error || "Error al restablecer el estampo");
      }

      onReset?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer el estampo");
    } finally {
      setResetting(false);
    }
  }

  // Get required variables for display
  const requiredVars = estampo.variablesSchema.filter((v) => v.required);
  const allVars = estampo.variablesSchema;

  return (
    <div className="mt-4 space-y-3">
      {/* UI callout about locked variables */}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p className="font-medium">
          Variables del asistente no se pueden eliminar. Si las quitas, no podrás guardar.
        </p>
      </div>

      {/* Variable insertion toolbar */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">
          Variables disponibles:
        </p>
        <div className="flex flex-wrap gap-2">
          {allVars.map((variable) => {
            const isRequired = variable.required;
            return (
              <button
                key={variable.name}
                type="button"
                onClick={() => insertVariable(variable.name)}
                className={`px-2 py-1 text-sm rounded border ${
                  isRequired
                    ? "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200"
                    : "bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200"
                }`}
                title={
                  isRequired
                    ? `${variable.label} (requerida)`
                    : variable.label || variable.name
                }
              >
                {variable.name}
                {isRequired && (
                  <span className="ml-1 text-xs" title="Variable requerida">
                    🔒
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Template textarea */}
      <textarea
        id="textoTemplateBox"
        ref={textareaRef}
        className="border rounded-md w-full h-64 p-3 font-mono text-sm"
        placeholder="Escriba aquí el cuerpo del estampo con variables como $nombre_ejecutado, $fecha_palabras_diligencia, etc."
        value={textoTemplate}
        onChange={(e) => setTextoTemplate(e.target.value)}
      />

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p className="font-medium">{error}</p>
          {missingVars.length > 0 && (
            <ul className="mt-2 list-disc list-inside">
              {missingVars.map((varName) => (
                <li key={varName}>
                  Variable requerida faltante: <code className="font-mono">${varName}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        {estampo.hasCustom && (
          <button
            onClick={handleReset}
            className="bg-amber-600 text-white px-4 py-2 rounded hover:bg-amber-700 disabled:opacity-60 transition"
            disabled={resetting || saving}
          >
            {resetting ? "Restableciendo..." : "Restablecer a versión oficial"}
          </button>
        )}
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60 transition"
          disabled={saving || resetting}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

