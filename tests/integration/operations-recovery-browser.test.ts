import { expect, it } from 'vitest'
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
it.skipIf(process.env.TEST_OPERATIONS_BROWSER !== 'true')('preserves recovery idempotency through timeout and verifies subsequent evidence in an isolated browser', async () => {
  const built = await build({configFile:false,logLevel:'error',oxc:{jsx:{runtime:'automatic',development:false}},define:{'process.env.NODE_ENV':'"production"'},resolve:{alias:{'@':process.cwd(),'next/link':'virtual:link'}},build:{write:false,minify:false,lib:{entry:'virtual:entry',formats:['iife'],name:'RecoveryTest'}},plugins:[{name:'isolated-recovery',resolveId(id){if(id.endsWith('virtual:entry'))return '\0entry';if(id==='virtual:link')return '\0link'},load(id){if(id==='\0link')return "import React from 'react';export default function Link(p){return React.createElement('a',p)}";if(id==='\0entry')return "import React from 'react';import {createRoot} from 'react-dom/client';import Controls from '@/app/operaciones/recovery-controls';createRoot(document.getElementById('root')).render(React.createElement(Controls,{initial:{officeId:12,kind:'report',targetId:'report-one'}}));"}}]})
  const result=Array.isArray(built)?built[0]:built
  if(!('output' in result))throw new Error('Expected bundle')
  const chunk=result.output.find(x=>x.type==='chunk');if(!chunk||chunk.type!=='chunk')throw new Error('No bundle')
  const css=readFileSync('app/operaciones/operations.css','utf8')
  const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/ui.js'?'text/javascript':'text/html; charset=utf-8');res.end(req.url==='/ui.js'?chunk.code:`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}${css}</style></head><body><main class="ops-shell ops-main"><div id="root"></div></main><script src="/ui.js"></script></body></html>`)})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined
  try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1100,height:850}})
    const submissions:any[]=[];let executions=0
    await page.route('**/api/operaciones/recuperacion',async route=>{
      const input=route.request().postDataJSON();submissions.push(input)
      if(input.mode==='preview')return route.fulfill({json:{kind:'report',targetId:'report-one',officeId:12,state:{status:'FAILED'},fingerprint:'a'.repeat(64),actions:[{action:'reconcile',label:'Conciliar evidencia',eligible:true,impact:'Solo lectura',confirmation:'reconcile report-one oficina 12'},{action:'report.retry',label:'Reintentar generación',eligible:true,impact:'Generar sin enviar correo',confirmation:'report.retry report-one oficina 12'}]}})
      if(input.mode==='execute'&&executions++===0)return route.abort('timedout')
      return route.fulfill({json:{id:'action-one',status:input.mode==='verify'?'SUCCEEDED':'ACCEPTED',evidence:input.mode==='verify'?{status:'SUCCEEDED',code:'NO_ACTIVITY'}:undefined}})
    })
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}`)
    await page.getByRole('button',{name:'Consultar elegibilidad'}).click()
    await page.getByRole('combobox',{name:/^Acción/}).selectOption('report.retry')
    await page.getByLabel('Motivo (sin datos sensibles)').fill('Verificación aislada sin clientes')
    await page.getByLabel('Escribe exactamente:').fill('report.retry report-one oficina 12')
    await page.getByRole('button',{name:'Confirmar acción'}).click()
    await page.getByRole('status').filter({hasText:'conserva esta vista'}).waitFor()
    await page.getByRole('button',{name:'Confirmar acción'}).click()
    await page.getByRole('status').filter({hasText:'Solicitud registrada'}).waitFor()
    const requests=submissions.filter(x=>x.mode==='execute')
    expect(requests).toHaveLength(2);expect(requests[0].data.idempotencyKey).toBe(requests[1].data.idempotencyKey)
    expect(requests[0].data).toMatchObject({officeId:12,targetId:'report-one',confirmation:'report.retry report-one oficina 12'})
    await page.getByRole('button',{name:'Consultar evidencia posterior'}).click()
    await page.getByText('"code": "NO_ACTIVITY"',{exact:false}).waitFor()
    await page.setViewportSize({width:390,height:844})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    mkdirSync('tmp',{recursive:true});await page.screenshot({path:'tmp/operations-phase5-mobile.png',fullPage:true})
  } finally {await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
},60000)
