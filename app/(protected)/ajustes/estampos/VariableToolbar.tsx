"use client";

type VariableToolbarProps = {
  onInsert: (variable: string) => void;
};

const groups: Record<string, string[]> = {
  "Datos del ejecutado": [
    "nombre_ejecutado",
    "direccion_ejecutado",
    "solo_comuna_ejecutado",
    "rut_ejecutado",
  ],
  "Datos de la gestión": [
    "rol",
    "tribunal",
    "caratula",
    "fecha_palabras_diligencia",
    "hora_diligencia",
    "cuantia",
  ],
  "Datos del abogado": ["abogado_nombre", "abogado_direccion"],
  "Datos del recibo": ["monto_ejecutado", "n_operacion"],
  Adicionales: ["firma", "sello"],
};

export function VariableToolbar({ onInsert }: VariableToolbarProps) {
  return (
    <div className="mb-3 space-y-2">
      {Object.entries(groups).map(([section, vars]) => (
        <div key={section}>
          <p className="text-sm font-semibold text-gray-700 mb-1">{section}</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {vars.map((v) => (
              <button
                key={v}
                onClick={() => onInsert(`$${v}`)}
                type="button"
                className="px-2 py-1 bg-gray-100 hover:bg-blue-100 text-sm rounded border"
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

