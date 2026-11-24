# OJV integration handoff

## Decision for the next chat

Prototype a **direct server-side connector against a local mock of the Oficina Judicial Virtual (OJV)**. The first milestone is to open a civil case in Notifica IA, list its folios, and preview one synthetic PDF on web and mobile. Use this to evaluate the product experience, latency, and operating cost. The connector is an architecture choice for the prototype. A live connection depends on clarification from the Poder Judicial (PJUD) about the proposed use of a receptor’s authenticated session.

## Competitive findings

- **Reported walkthrough.** Notifica Legal explained that its software uses each receptor’s personal OJV login. The user reported seeing case-level access to its documents and in-app PDF previews, plus the ability to withdraw a case and return a notification. Notifica Legal also supports a mobile app. The walkthrough did not establish where the OJV session runs, how the first login works, or whether a fresh court action can complete on mobile while the office computer is off.
- **Public product claims.** Notifica Legal advertises connecting a case by ROL, loading PJUD case data and documents, preparing and printing folios, withdrawing the case, signing the estampo, and returning the case with certification. These claims give us a benchmark for the receptor workflow. We did not independently verify every OJV feature or the exact artifact returned by PJUD. [Notifica Legal](https://notificalegal.cl/)
- **Best current inference.** A server-managed session fits live use across web and mobile. A browser running on the vendor’s servers and a direct server-side connector can look identical to the user. Mobile PDF previews alone provide weaker evidence because the files could have been imported earlier.
- **Browser extension findings.** We found no published official PJUD Chrome extension. PJUD documents its own mobile app for receptores. The Litigant.es OJV Sync extension is a separate vendor’s product and advertises case and hearing sync. Its listing does not establish support for Retirar or Devolver, or any connection to Notifica Legal. [PJUD receptor app](https://www.pjud.cl/docs/download/73519) · [Litigant.es OJV Sync](https://chromewebstore.google.com/detail/litigantes-%E2%80%94-ojv-sync/hmacdonfaibkmnobniacekabefcbmiee)

## OJV’s response and what it establishes

Gonzalo Godoy contacted OJV and shared the following reply from **requerimiento N.º 145383**. This is the strongest evidence about official access as of the reply. The request number alone does not establish its date.

> A la fecha, no existe un mecanismo oficial de APIs o servicios web oficiales habilitado para terceros. Tampoco existen convenios, acuerdos ni autorizaciones vigentes con empresas privadas que otorguen acceso automatizado o preferencial de información.
>
> Por razones de seguridad no es posible indicar límites de frecuencia o mecanismos recomendados para evitar bloqueos automáticos.

Sections 4 and 5 of Supreme Court Acta 208-2023 direct the Corporación Administrativa del Poder Judicial (CAPJ) to develop an interconnection protocol, a model agreement, and a service catalog. The act establishes that mandate. OJV’s direct reply tells us the current position on third-party access as of the reply. We found no published agreement under Notifica Legal’s name. [Acta 208-2023](https://www.pjud.cl/prensa-y-comunicaciones/docs/download/67333) · [PJUD agreements repository](https://convenios.pjud.cl/intro/index)

PJUD’s published general portal terms restrict use of its content and require prior authorization for bulk processing. We could verify those general terms. The separate OJV terms page presented a CAPTCHA during research, so its contents remain unverified. PJUD’s official receptor-app terms separately describe authentication credentials as personal and nontransferable. A receptor’s consent still leaves open whether PJUD permits our specific commercial workflow. [PJUD portal terms](https://www.pjud.cl/post/condiciones-de-uso-de-este-portal) · [OJV terms page](https://oficinajudicialvirtual.pjud.cl/home/condicionesdeuso.php) · [PJUD receptor-app terms](https://www.pjud.cl/docs/download/61506)

## Connection options considered

| Option | Advantages | Tradeoffs |
| --- | --- | --- |
| Direct server-side connector | One integration can serve web and mobile with no local installation. HTTP requests and PDF streaming should be lighter than running full browsers. | The vendor’s infrastructure handles OJV sessions and retrieved documents. The connector depends on undocumented website behavior and needs to handle session expiry, timeouts, and ambiguous submission outcomes. |
| Vendor-hosted browser | One integration can serve web and mobile. A full browser can follow the workflow the receptor sees. | Adds per-session browser resources and operational overhead. The vendor still handles sensitive sessions and retrieved documents. Portal and login changes can break the workflow. |
| Embedded mobile browser | The session can stay on the phone. A desktop computer can be offline. | Depends on whether the OJV login flow works in that context. Requires mobile platform testing and a separate path for desktop web. |
| Desktop extension or companion | Can work with a session local to the receptor’s computer. Fits existing desktop office workflows. | Requires an install and updates. Live use from a phone can depend on the office computer unless a separate mobile path exists. Chrome permissions can be scoped to specific sites. [Chrome extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) |
| Manual OJV handoff | Can use our existing signed PDF and keep the actual filing in the official portal. | The receptor switches to OJV to carry out the action and verify the result. It delivers less of the in-app workflow seen in the demo. |

The best clue about the competitor would be the first connection on a clean phone, followed by a fresh Retirar or Devolver while the office computer is off. The setup would show where the user signs in. A successful live action would rule out dependence on an office desktop for that flow. It would still leave both an on-device mobile session and a vendor-managed session plausible.

## What we can reuse

- Existing case intake already captures competencia, tribunal, and ROL or RIT. For a case reference, use the court and jurisdiction context along with the case number. [Abogado portal implementation](ABOGADO_PORTAL_IMPLEMENTATION.md#3-nuevo-encargo)
- The Estampo and signing workflows already produce validated signed PDFs. Reuse the exact signed artifact for a return flow if that integration is confirmed. [Signing implementation](FIRMAR%20DIGITAL%20IMPLEMENTATION.md) · [Signed artifact service](../lib/signing/artifacts.ts)
- We found no existing OJV connector in the application source reviewed during discovery. This chat made no implementation or database changes.

## Backend sizing

- The direct connector should be mostly network I/O. On Vercel Fluid Compute, waiting on upstream I/O does not count as active CPU time. Provisioned memory is still measured while requests are in flight. [Vercel usage and pricing](https://vercel.com/docs/functions/usage-and-pricing)
- PDF traffic likely dominates bandwidth. At 10,000 previews per month averaging 3 MB, user-facing transfer would be roughly 30 GB per month. Stream the PDF when requested and let the browser render it. Measure response limits, transfer volume, and peak memory before choosing how to host the PDF route. [Vercel Functions limits](https://vercel.com/docs/functions/limitations)
- Slow upstream responses can drive concurrency. At 10 requests per second, 3 seconds of average response time corresponds to roughly 30 requests in flight. At 15 seconds, it rises to roughly 150. These examples are illustrative. We have no measured production traffic or OJV latency for the proposed integration.

## Suggested first implementation

1. Use a local mock and synthetic data for one civil case, a folio list, and a small PDF. Keep the prototype scoped to case lookup, folio listing, and PDF preview. Test the same flow on desktop and mobile.
2. Verify office and user access to the case, expired-session handling, an unavailable folio, an upstream timeout, and PDF streaming. Keep the first prototype independent of real credentials, judicial documents, and live OJV.
3. Ask CAPJ for written clarification on a commercial, user-initiated flow that opens one case at a time and previews folio PDFs using the receptor’s own OJV session. Ask specifically whether the proposed server-side handling of the session and PDFs is permitted and what conditions apply. The published channels are [CAPJ Responde](https://www.pjud.cl/transparencia/consulta-ciudadana/lte) and the repository contact **convenios_dbcd@pjud.cl** for routing a convenio question. [Official repository contact](https://convenios.pjud.cl/intro/index)
4. Treat live Retirar and Devolver as a later milestone. Ask explicitly about user-confirmed submissions. Verify the case, diligencia, and signed PDF before submission, then record whatever official confirmation the flow supplies. After a timeout, check the current OJV state before retrying. CAPJ has documented duplicate retiros for the same diligencia. The official workflow also includes georeferenced evidence where applicable, so start with a test scenario that makes that requirement explicit. [PJUD receptor workflow](https://www.pjud.cl/docs/download/6883) · [CAPJ report on duplicate retiros](https://www.pjud.cl/docs/downloadInformeVisita/7327)

Before implementation, follow the repository’s [Prisma startup rule](../AGENTS.md): run `prisma migrate status`, `prisma migrate deploy`, then `prisma generate`. The repository forbids `prisma migrate dev` unless expressly requested.
