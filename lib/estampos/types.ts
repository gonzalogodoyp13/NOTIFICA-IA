// Tipos para el sistema de estampos mejorado
// Estos tipos reflejan la estructura JSON almacenada en variablesSchema y wizardSchema

export type VariableType =
  | "TEXT"
  | "MONEY"
  | "TIME"
  | "DATE"
  | "ENUM"
  | "DERIVED"
  | "SYSTEM";

export type VariableSource =
  | "ROL"
  | "DILIGENCIA"
  | "USUARIO"
  | "DERIVED";

export interface VariableDef {
  name: string; // e.g. "tratamiento", "numeracion"
  label: string; // Human label for forms
  description?: string;
  type: VariableType;
  source: VariableSource; // How to auto-fill by default
  required: boolean;
  enumOptions?: {
    // For ENUM types
    value: string;
    label: string;
  }[];
  derivedFrom?: string[]; // For DERIVED types
  defaultSource?: string; // e.g. "ROL.NOMBRE_EJECUTADO", "DILIGENCIA.DIRECCION"
}

export interface WizardQuestion {
  order: number;
  variable: string; // Links to VariableDef.name
  text: string; // "Sexo del demandado"
  inputType: "RADIO" | "SELECT" | "TEXT" | "NUMBER" | "DATE" | "TIME";
  options?: {
    // For RADIO/SELECT
    value: string;
    label: string;
  }[];
  visibility?: {
    // Optional conditional visibility
    whenVariable: string;
    equals: string | string[];
  };
}

export type EstampoBaseSeed = {
  slug: string;
  nombreVisible: string;
  categoria: string;
  descripcion?: string;
  textoTemplate: string;
  variablesSchema: VariableDef[];
  wizardSchema: WizardQuestion[];
};

