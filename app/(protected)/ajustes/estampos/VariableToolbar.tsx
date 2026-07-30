"use client";

type VariableToolbarProps = {
  onInsert: (variable: string) => void;
};

const groups: Record<string, string[]> = {
  "Datos del ejecutado": [
    "nombre_ejecutado",
    "rut_ejecutado",
    "direccion_ejecutado",
    "solo_direccion_ejecutado",
    "solo_comuna_ejecutado",
  ],
  "Datos de la gestion": [
    "rol",
    "tribunal",
    "caratula",
    "fecha_palabras_diligencia",
    "hora_diligencia",
    "cuantia",
    "receptor_nombre",
  ],
  "Datos del abogado": ["abogado_nombre", "abogado_direccion"],
  "Datos del recibo": ["monto_ejecutado", "n_operacion"],
  Adicionales: ["firma", "sello"],
};

export function VariableToolbar({ onInsert }: VariableToolbarProps) {
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([section, vars]) => (
        <div key={section}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {section}
          </p>
          <div className="flex flex-wrap gap-2">
            {vars.map((v) => (
              <button
                key={v}
                onClick={() => onInsert(`$${v}`)}
                type="button"
                className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
