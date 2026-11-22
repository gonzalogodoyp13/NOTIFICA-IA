import { expect, it } from 'vitest'
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { defaultAlertPolicy } from '@/lib/operations/alert-policy'
it.skipIf(process.env.TEST_OPERATIONS_BROWSER !== 'true')('saves explicit policy and UTC maintenance in an isolated browser; handles conflict and mobile', async () => {
  const view = { configuration: { officeId:12,revision:0,settings:defaultAlertPolicy(),owners:[{id:'owner',email:'owner@example.invalid'}] },alertActions:[{key:'device:one',status:'OPEN',revision:1}],maintenanceActions:[] }
  const built = await build({ configFile:false,logLevel:'error',oxc:{jsx:{runtime:'automatic',development:false}},define:{'process.env.NODE_ENV':'"production"'},resolve:{alias:{'@':process.cwd(),'next/navigation':'virtual:router'}},build:{write:false,minify:false,lib:{entry:'virtual:entry',formats:['iife'],name:'AlertTest'}},plugins:[{name:'isolated-alerts',resolveId(id){if(id.endsWith('virtual:entry'))return '\0entry';if(id==='virtual:router')return '\0router'},load(id){if(id==='\0router')return 'export const useRouter=()=>({refresh(){}})';if(id==='\0entry')return `import React from 'react';import {createRoot} from 'react-dom/client';import Controls from '@/app/operaciones/alert-controls';createRoot(document.getElementById('root')).render(React.createElement(Controls,{view:${JSON.stringify(view)}}));`}}] })
  const result=Array.isArray(built)?built[0]:built
  if(!('output' in result))throw new Error('Expected bundle')
  const chunk=result.output.find(x=>x.type==='chunk');if(!chunk||chunk.type!=='chunk')throw new Error('No bundle')
  const css=readFileSync('app/operaciones/operations.css','utf8')
  const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/ui.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/ui.js'?chunk.code:`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css}</style></head><body><main class="ops-shell ops-main"><h1>Políticas · prueba aislada</h1><div id="root"></div></main><script src="/ui.js"></script></body></html>`)})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined
  try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}})
    const submissions:any[]=[];let responseStatus=200
    await page.route('**/api/operaciones/alertas',async route=>{submissions.push(route.request().postDataJSON());await route.fulfill({status:responseStatus,contentType:'application/json',body:'{"revision":1}'})})
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}`)
    expect(await page.getByLabel('Autorizar comunicaciones a los propietarios seleccionados').isChecked()).toBe(false)
    await page.getByLabel('owner@example.invalid').check()
    await page.getByLabel('Zona horaria IANA').fill('America/Santiago')
    await page.getByRole('button',{name:'Guardar política',exact:true}).click()
    await page.getByRole('status').filter({hasText:'Cambios guardados'}).waitFor()
    expect(submissions[0]).toMatchObject({action:'policy',officeId:12,settings:{enabled:false,recipients:['owner'],timezone:'America/Santiago'}})
    await page.getByLabel('Inicio UTC').fill('2099-01-01T10:00')
    await page.getByLabel('Fin UTC').fill('2099-01-01T12:00')
    await page.getByLabel('Motivo (sin datos sensibles)').fill('Mantenimiento autorizado de prueba')
    await page.getByRole('button',{name:'Programar ventana'}).click()
    await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent==='Cambios guardados.')
    expect(submissions.at(-1)).toMatchObject({action:'maintenance',startsAt:'2099-01-01T10:00:00.000Z',endsAt:'2099-01-01T12:00:00.000Z'})
    responseStatus=409
    await page.getByLabel('Motivo para device:one').fill('Revisión de prueba')
    await page.getByRole('button',{name:'Reconocer alerta'}).click()
    await page.getByRole('status').filter({hasText:'La información cambió'}).waitFor()
    await page.setViewportSize({width:390,height:844})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    mkdirSync('tmp',{recursive:true});await page.screenshot({path:'tmp/operations-phase4-mobile.png',fullPage:true})
  } finally {await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
},60000)
