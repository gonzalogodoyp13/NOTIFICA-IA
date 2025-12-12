"use client";

import { useState, useEffect } from "react";
import { EstampoTable } from "./EstampoTable";
import { EstampoForm } from "./EstampoForm";
import { EstampoEditor } from "./EstampoEditor";
import { WizardEstampoEditor } from "./WizardEstampoEditor";
import type { VariableDef, WizardQuestion } from "@/lib/estampos/types";

type EstampoItem = {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  contenido?: string | null;
  fileUrl?: string | null;
};

type WizardEstampoItem = {
  id: number;
  slug: string;
  nombreVisible: string;
  categoria: string;
  descripcion: string | null;
  textoTemplate: string;
  variablesSchema: VariableDef[];
  wizardSchema: WizardQuestion[];
  hasCustom: boolean;
  customId?: number;
};

export default function EstamposPage() {
  const [estampos, setEstampos] = useState<EstampoItem[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedEstampo, setSelectedEstampo] = useState<EstampoItem | null>(
    null
  );
  const [wizardEstampos, setWizardEstampos] = useState<WizardEstampoItem[]>([]);
  const [selectedWizardEstampo, setSelectedWizardEstampo] =
    useState<WizardEstampoItem | null>(null);
  const [loadingWizard, setLoadingWizard] = useState(false);

  async function fetchEstampos() {
    try {
      const res = await fetch("/api/estampos");
      const data = await res.json();
      console.log("API Response:", data);
      console.log("Loaded estampos:", data.data);
      setEstampos(data.data || []);
    } catch (err) {
      console.error("Error fetching estampos:", err);
      alert("Error al cargar estampos");
    }
  }

  useEffect(() => {
    fetchEstampos();
    fetchWizardEstampos();
  }, []);

  // Sync selectedWizardEstampo when wizardEstampos list updates
  useEffect(() => {
    // When wizardEstampos list updates, sync the selected estampo with fresh data
    if (!selectedWizardEstampo) return;  // Early return if no selection
    
    const updated = wizardEstampos.find(e => e.id === selectedWizardEstampo.id);
    if (updated) {
      setSelectedWizardEstampo(updated);  // Update with fresh hasCustom value
    }
  }, [wizardEstampos, selectedWizardEstampo]);  // Include both to avoid stale closure

  async function fetchWizardEstampos() {
    try {
      setLoadingWizard(true);
      const res = await fetch("/api/ajustes/estampos/wizard", {
        credentials: "include",
      });
      const data = await res.json();
      if (data?.ok && data?.data?.estampos) {
        setWizardEstampos(data.data.estampos);
      } else {
        console.error("Error fetching wizard estampos:", data);
      }
    } catch (err) {
      console.error("Error fetching wizard estampos:", err);
    } finally {
      setLoadingWizard(false);
    }
  }

  function handleEdit(estampo: EstampoItem) {
    setSelectedEstampo(estampo);
  }

  function handleEditorSaved() {
    fetchEstampos();
    setSelectedEstampo(null);
  }

  function handleWizardEdit(estampo: WizardEstampoItem) {
    setSelectedWizardEstampo(estampo);
  }

  async function handleWizardEditorSaved() {
    await fetchWizardEstampos();
    // Don't clear selection - keep editor open so user sees reset button appear
  }

  async function handleWizardEditorReset() {
    await fetchWizardEstampos();
    // Don't clear selection - useEffect will sync it
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

      {/* Section 1: Wizard-enabled estampos (NEW) */}
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Estampos con asistente (Wizard)</h2>
            <p className="text-sm text-gray-500">
              Estampos predefinidos con asistente de generación automática
            </p>
          </div>
        </div>

        {loadingWizard ? (
          <div className="py-4 text-center text-sm text-gray-500">
            Cargando estampos...
          </div>
        ) : wizardEstampos.length === 0 ? (
          <div className="py-4 text-center text-sm text-gray-500">
            No hay estampos con asistente disponibles.
          </div>
        ) : (
          <div className="space-y-2">
            {wizardEstampos.map((estampo) => (
              <div
                key={estampo.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {estampo.nombreVisible}
                  </div>
                  {estampo.descripcion && (
                    <div className="text-xs text-gray-500 mt-1">
                      {estampo.descripcion}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Categoría: {estampo.categoria}
                  </div>
                  {estampo.hasCustom && (
                    <span className="inline-block mt-1 text-xs text-blue-600">
                      (Template personalizado)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleWizardEdit(estampo)}
                  className="ml-4 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedWizardEstampo && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">
                  Editar template: {selectedWizardEstampo.nombreVisible}
                </h3>
                <p className="text-sm text-gray-500">
                  Categoría: {selectedWizardEstampo.categoria}
                </p>
              </div>
              <button
                onClick={() => setSelectedWizardEstampo(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                Cerrar
              </button>
            </div>
            <WizardEstampoEditor
              estampo={selectedWizardEstampo}
              onSaved={handleWizardEditorSaved}
              onReset={handleWizardEditorReset}
            />
          </div>
        )}
      </div>

      {/* Section 2: Legacy manual estampos (KEEP) */}
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Estampos manuales (Legacy)</h2>
            <p className="text-sm text-gray-500">
              Estampos personalizados sin asistente de generación
            </p>
          </div>
        </div>

        <EstampoTable
          data={estampos}
          onRefresh={fetchEstampos}
          onEdit={handleEdit}
        />
        <EstampoForm open={open} setOpen={setOpen} onSaved={fetchEstampos} />

        {selectedEstampo && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">
                  Editar modelo: {selectedEstampo.nombre}
                </h3>
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
    </div>
  );
}
