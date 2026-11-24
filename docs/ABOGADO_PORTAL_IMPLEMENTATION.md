# NOTIFICA IA · Abogado portal

This document records the Abogado portal built in this chat, from public registration through the account settings. The portal follows the layout of the supplied references and uses NOTIFICA IA’s existing typography, colors, cards, and form controls.

## 1. Account creation and sign-in

**Crear cuenta** is available from the public home page and the login page. At `/crear-cuenta`, visitors choose one of two paths.

| Option | Fields | Result |
| --- | --- | --- |
| **Quiero encargar** | Nombre, apellidos, correo, contraseña, and acceptance of the Términos y Condiciones | Creates a Supabase Auth identity. After email confirmation, the user enters `/abogados`. If the environment issues a session immediately, the redirect happens immediately. |
| **Receptor judicial** | Nombre, celular, and correo | **Agendar consulta** saves a callback request for manual scheduling. Repeated submissions with identical contact information are deduplicated. |

The password minimum is 12 characters. The signup endpoint validates the current terms version and records the accepted version and timestamp on the Abogado profile. Email confirmation uses `/auth/confirm-abogado`, and returning users use the shared `/login` page. The portal also supports the existing password recovery flow for active Abogado accounts.

Supabase Auth is shared with the office portal. `AbogadoAccount` is a separate application profile keyed to the authenticated Supabase user ID. The existing office `User` and office-specific `Abogado` contact models continue to serve their original workflows. An Abogado portal identity does not grant office permissions.

## 2. Portal home and navigation

`/abogados` displays the account holder’s full name, the date in Chilean time, and a **Nuevo encargo** action. The sidebar contains **Inicio**, **Nuevo encargo**, **Mis causas**, **Receptores**, **Estampos**, **Pagos**, **Boletas**, and **Ajustes**. The layout adapts to desktop and mobile.

Four cards count the account’s **Esperando respuesta**, **Por pagar**, **En curso**, and **Finalizado** cases using the same state rules as **Mis causas**. Six quick-access cards open **Nuevo encargo**, **Mis causas**, **Receptores**, **Estampos**, **Pagos**, and **Boletas**. The portal header also provides support and sign-out actions.

## 3. Nuevo encargo

`/abogados/nuevo-encargo` is a three-step form. **Ejecutado** and **Plazos** are optional sections within the second step.

| Step | Behavior |
| --- | --- |
| **Causa** | Choose **Competencia**, **Corte de Apelaciones**, and **Tribunal**. Enter **ROL o RIT** and the number of people to notify. Select **¿Qué necesitas?** and a searchable **Detalle de la diligencia**. Add optional **Notas extras**. |
| **Receptor** | Select one or more active, available receptors assigned to the chosen court. The optional **Ejecutado** section opens one form per person, with nombre completo, RUT, and multiple addresses. Each address has calle y número, optional depto/oficina, and comuna. The optional **Plazos** section accepts the notification deadline, hearing date, and hearing time. |
| **Boleta** | Enter or review the name, RUT, email, alternate billing name, and who withholds the tax (**El receptor** or **Yo**). Relevant profile and billing preferences prefill a new encargo. Existing drafts retain their saved values. |

The jurisdiction catalog contains the 17 Courts of Appeals and the associated tribunals supplied in the chat. Changing the court clears the previous tribunal and receptor selections. Server validation also checks that the selected tribunal belongs to the court and that selected receptors are still eligible before submission. The two diligence menus use the supplied lists. Comuna inputs provide suggestions and accept manual entry.

**Guardar borrador** is available once the cause details are valid. A draft can be saved even when the selected court has no available receptors, and **Mis causas** can reopen it. **Enviar encargo** requires a valid cause, at least one eligible receptor, and complete required billing data. It records the encargo and selected receptor assignments atomically. Repeated submission of the same encargo does not create duplicate assignments. The form keeps the notes with the encargo for the future receptor response workflow.

## 4. Case and record pages

### Mis causas · `/abogados/mis-causas`

The page offers ROL/RIT search, a court filter, and the following tabs. Rows show the ROL/RIT, tribunal, court, diligence, relevant receptor information, and status. Drafts can be resumed, and finalized cases link to the Estampos search.

| Tab | Which cases appear |
| --- | --- |
| **Todas** | All the account’s cases, including drafts. |
| **Esperando respuesta** | Submitted cases with no acceptance and at least one pending response. Submitted cases without an assignment record also appear here. |
| **Por pagar** | At least one receptor accepted and no accepted receptor has a recorded payment for the case. |
| **En curso** | An accepted receptor has a recorded payment and the case is still open. |
| **Finalizadas** | An accepted receptor has a recorded payment and the case has a finalization timestamp. |
| **No aceptadas** | Every invited receptor rejected the submitted case. |

### Receptores · `/abogados/receptores`

The directory shows active, available receptors. Filters include name, Court of Appeals, and tribunal. Selecting a court narrows the tribunal options. A receptor card shows their name and configured coverage. **Seleccionar** opens **Nuevo encargo** with the receptor and matching jurisdiction preselected. The encargo form supports additional receptor selections.

### Estampos · `/abogados/estampos`

The list shows the receptor, ROL and tribunal, person notified, result, and signature date. Filters include ROL/RIT, receptors who have produced estampos for the current account, and an inclusive **Desde/Hasta** date range in `America/Santiago`.

### Pagos · `/abogados/pagos`

Search by ROL or tribunal and switch between **Por causa** and **Por pago**. The first view groups amounts by cause and displays the number of payments and the latest payment date. The second lists each completed payment with its receptor, date, method, reference when available, and amount. The total is in CLP and reflects the active search.

### Boletas · `/abogados/boletas`

The list shows the boleta number, receipt number when available, ROL and tribunal, issuing receptor, issue date, and amount. Search accepts ROL, tribunal, boleta number, or receipt number.

These pages query the current account’s records, preserve filters during pagination, and provide empty states when no results match. Estampos, Pagos, and Boletas include an **Actualizar** action.

## 5. Ajustes

`/abogados/ajustes` contains three keyboard-accessible tabs with independent save actions.

| Tab | Features |
| --- | --- |
| **Tus datos** | Edit the full display name, RUT, contact email, phone, comuna, and address. The display name also updates the portal. The contact email is separate from the Supabase sign-in email. |
| **Boleta** | Save the name or legal entity, RUT, giro, billing email, comuna, and address. **Usar mis datos** copies the matching personal fields, leaving giro available for editing. The saved billing name, RUT, and email feed the corresponding fields in a new encargo. |
| **Cuenta** | Open a four-step guided tour from Inicio, access password recovery, or deactivate the account. Deactivation requires explicit confirmation and accepts an optional reason. |

The two data forms display progress out of six completed fields. Deactivation records a timestamp and optional reason, requests global Supabase sign-out, and blocks portal access even for an existing session. Cases, payments, boletas, and estampos are retained. The disabled-account message links to support for reactivation requests.

## 6. Implementation map

| Area | Files |
| --- | --- |
| Public entry and authentication | [Public home](../app/page.tsx), [registration page](../app/crear-cuenta/page.tsx), [registration endpoint](../app/api/auth/registration/route.ts), [confirmation route](../app/auth/confirm-abogado/route.ts), [login](../app/login/page.tsx), [portal account resolution](../lib/auth/abogadoAccount.ts), and [password recovery](../lib/auth/passwordRecovery.ts) |
| Portal shell and pages | [Abogado routes](../app/abogados/), [sidebar configuration](../app/abogados/sections.ts), and [portal layout](../app/abogados/layout.tsx) |
| Encargos and settings endpoints | [Encargos](../app/api/abogados/encargos/route.ts) and [Ajustes](../app/api/abogados/ajustes/route.ts) |
| Catalogs and business logic | [Court and tribunal catalog](../lib/encargos/tribunales.ts), [diligence options](../lib/encargos/diligencias.ts), [comuna suggestions](../lib/encargos/comunas.ts), [encargo validation](../lib/encargos/schema.ts), [state rules](../lib/encargos/estados.ts), [list queries](../lib/encargos/listados.ts), and [settings validation and defaults](../lib/encargos/ajustes.ts) |
| Persistence | [Prisma schema](../prisma/schema.prisma) |

The schema adds `AbogadoAccount`, `ReceptorConsultation`, `ReceptorPortal`, `AbogadoEncargo`, `AbogadoEncargoReceptor`, `AbogadoEstampo`, `AbogadoPago`, and `AbogadoBoleta`, plus the `RespuestaEncargo` enum. Payment and document records attach to a specific encargo and receptor assignment. Server queries scope private records to the authenticated Abogado. New portal tables use PostgreSQL row-level security and restrict direct browser-role access.

## 7. Local verification and migration status

- The local preview ran at `http://localhost:3000` with an isolated in-memory database, test authentication, preview-only terms, and fictitious receptors in Chillán and Santiago. It sends no email. Preview data is temporary.
- Browser checks covered desktop and mobile signup, simulated email confirmation, returning sign-in, recipient filtering, multiple addresses, saving and reopening drafts, case states and dashboard counts, date and document filters, payment grouping and totals, account isolation, settings persistence, billing prefill, the guided tour, and deactivation with retained records.
- Prisma validation, TypeScript, UTF-8 checks, and the nine focused tests passed. The tests are reproducible via the command below. An earlier run of the broader security suite had two failures from an existing office authorization mock that omitted `platformGrant`.

```powershell
npm.cmd run test:integration -- tests/integration/abogado-encargos.test.ts tests/integration/abogado-estados.test.ts tests/integration/abogado-ajustes.test.ts
```

| Migration | Where it was applied during the chat |
| --- | --- |
| [`20261123000000_abogado_accounts`](../prisma/migrations/20261123000000_abogado_accounts/migration.sql) | Local preview and the configured Supabase database. The repository’s Prisma startup sequence applied it while preparing the first preview. |
| [`20261123010000_abogado_encargos`](../prisma/migrations/20261123010000_abogado_encargos/migration.sql) | Local preview and isolated verification databases. |
| [`20261123020000_abogado_portal_listados`](../prisma/migrations/20261123020000_abogado_portal_listados/migration.sql) | Local preview and isolated verification databases. |
| [`20261123030000_abogado_ajustes`](../prisma/migrations/20261123030000_abogado_ajustes/migration.sql) | Local preview. |

## 8. Open production work

- Configure the published, approved `ABOGADO_TERMS_URL` and `ABOGADO_TERMS_VERSION`, set the canonical application origin, and allow `/auth/confirm-abogado` at that origin in Supabase Auth’s redirect configuration. See [`.env.example`](../.env.example).
- Apply the remaining portal migrations to the production target and deploy the application changes. The tests described here used localhost.
- Configure real receptor profiles, availability, and coverage by court and tribunal.
- Connect the receptor-facing invitation inbox, notifications, acceptance and rejection, payment processing, case completion, signed estampo publication, and boleta issuance. The portal already stores assignments and reads those records once they exist.
- Establish the support workflow for coordinating receptor consultation requests and reactivating deactivated Abogado accounts.
