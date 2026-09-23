# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firmados.spec.ts >> an uncertain submission retains its exact reviewed payload for retry
- Location: e2e\firmados.spec.ts:127:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').getByRole('alert')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('dialog').getByRole('alert')

```

```yaml
- navigation:
  - link "Plataforma Judicial NOTIFICA IA":
    - /url: /
  - text: Entorno operativo para oficinas receptoras
  - link "Inicio":
    - /url: /
  - button "Cerrar sesión"
- main:
  - link "Inicio":
    - /url: /dashboard
  - link "Gestionar Demandas":
    - /url: /roles
  - link "Gestión de Recibos":
    - /url: /recibos
  - link "Ajustes de oficina":
    - /url: /ajustes
  - textbox "Buscar ROL exacto":
    - /placeholder: C-1234-2025
  - button "Buscar ROL" [disabled]
  - main:
    - text: Control documental
    - heading "Firmados" [level=1]
    - paragraph: Solicita firmas, sigue su validación y recupera los estampos que necesitan atención.
    - text: Actualizado 22/09/2026, 10:00
    - button "Actualizar centro de firmado": Actualizar
    - region "Resumen de la oficina":
      - button "Por solicitar 1":
        - text: Por solicitar
        - strong: "1"
      - button "En proceso 0":
        - text: En proceso
        - strong: "0"
      - button "Requieren atención 1":
        - text: Requieren atención
        - strong: "1"
      - button "Firmados 0":
        - text: Firmados
        - strong: "0"
    - region "Equipos y certificados":
      - heading "Equipos de la oficina" [level=2]
      - text: "Entrega pendiente: 0"
      - strong: Oficina principal
      - text: Token disponible
      - paragraph: Certificado de prueba
      - paragraph: "Vencimiento: 14/09/2027 · Último contacto: 22/09/2026, 10:00"
    - region "Estampos y solicitudes":
      - text: Ejecución desde
      - textbox "Ejecución desde"
      - text: Ejecución hasta
      - textbox "Ejecución hasta"
      - text: Estado
      - combobox "Estado":
        - option "Todos los estados" [selected]
        - option "Por solicitar"
        - option "En proceso"
        - option "Requieren atención"
        - option "Firmados"
        - option "Cancelados"
      - button "Limpiar filtros"
      - paragraph: Fecha de ejecución de la diligencia · Calendario de Chile (America/Santiago). Los documentos sin fecha aparecen al quitar el rango.
      - strong: 1 seleccionados
      - button "Seleccionar todos los elegibles del rango"
      - button "Quitar selección"
      - text: Certificado firmante
      - combobox "Certificado firmante":
        - option "Selecciona equipo / certificado"
        - option "Oficina principal · bbbbbbbbbb" [selected]
      - text: Perfil de firma
      - combobox "Perfil de firma":
        - option "B · Firma básica"
        - option "LT · Fechado y evidencia" [selected]
        - option "LTA · Sello de archivo"
      - button "Revisar solicitud"
      - checkbox "Seleccionar elegibles de esta página" [checked]
      - text: Estampo / ejecución Solicitud Firma / entrega Acciones
      - article:
        - checkbox "Seleccionar Notificación personal" [checked]
        - link "ROL C-1240-2026":
          - /url: /roles/case-1?tab=documentos
        - heading "Notificación personal" [level=3]
        - paragraph: "Ejecución: 10/09/2026"
        - paragraph: Sin solicitud
        - text: Por solicitar
        - paragraph: Sin firma validada
        - group: Trazabilidad
      - article:
        - link "ROL C-1240-2026":
          - /url: /roles/case-1?tab=documentos
        - heading "Requerimiento de pago" [level=3]
        - paragraph: "Ejecución: 10/09/2026"
        - paragraph: Solicitud automática
        - paragraph: PAdES-LT · Intentos 1/4
        - text: Requiere revisión
        - paragraph: Sin firma validada
        - paragraph: Revisa el resultado anterior en el equipo firmante.
        - group: Diagnóstico del administrador
        - button "Reintentar"
        - group: Trazabilidad
      - text: 2 resultados · Resumen superior de toda la oficina
      - button "Página anterior" [disabled]
      - text: Página 1 de 1
      - button "Página siguiente" [disabled]
    - paragraph: La firma se aprueba en el equipo con el token. La distribución a carpetas receptoras se muestra cuando existan entregas programadas.
    - dialog "Solicitar firma digital":
      - paragraph: Confirmación de la oficina
      - heading "Solicitar firma digital" [level=2]
      - button "Cerrar confirmación"
      - paragraph: 1 estampos · PAdES-LT. Se solicitará aprobación y PIN únicamente en el equipo firmante.
      - paragraph: "Certificado SHA-256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      - list:
        - listitem:
          - strong: C-1240-2026
          - text: · Notificación personal document-1 · 10/09/2026
      - checkbox "Revisé los documentos y confirmo esta solicitud." [checked]
      - text: Revisé los documentos y confirmo esta solicitud.
      - button "Volver"
      - button "Confirmar solicitud"
- alert
```