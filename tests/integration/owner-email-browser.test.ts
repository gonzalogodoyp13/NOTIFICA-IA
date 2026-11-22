import { expect, it } from 'vitest'
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFileSync,readdirSync,mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
it.skipIf(process.env.TEST_OPERATIONS_BROWSER!=='true')('handles email challenge, incorrect code, resend cooldown and successful navigation without real email',async()=>{
  const built=await build({configFile:false,logLevel:'error',oxc:{jsx:{runtime:'automatic',development:false}},define:{'process.env.NODE_ENV':'"production"'},resolve:{alias:{'@/lib/auth-client':'virtual:auth','@':process.cwd()}},build:{write:false,minify:false,lib:{entry:'virtual:entry',formats:['iife'],name:'OwnerEmailTest'}},plugins:[{name:'isolated-email',resolveId(id){if(id.endsWith('virtual:entry'))return '\0entry';if(id==='virtual:auth')return '\0auth'},load(id){if(id==='\0auth')return 'export async function signOut(){}';if(id==='\0entry')return "import React from 'react';import{createRoot}from'react-dom/client';import Controls from '@/app/mfa/email-verification-client';createRoot(document.getElementById('root')).render(React.createElement(Controls));"}}]})
  const result=Array.isArray(built)?built[0]:built;if(!('output'in result))throw new Error('No bundle')
  const chunk=result.output.find(x=>x.type==='chunk');if(!chunk||chunk.type!=='chunk')throw new Error('No chunk')
  const css=readdirSync('.next/static/css').filter(x=>x.endsWith('.css')).map(x=>readFileSync(`.next/static/css/${x}`,'utf8')).join('\n')
  const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/ui.js'?'text/javascript':'text/html; charset=utf-8');res.end(req.url==='/ui.js'?chunk.code:`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="mx-auto max-w-lg px-6 py-16"><h1 class="mb-5 text-3xl font-semibold">Verifica tu identidad</h1><div id="root"></div></main><script src="/ui.js"></script></body></html>`)})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined
  try {
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}})
    const requests:any[]=[]
    await page.route('**/api/auth/owner-verification',async route=>{
      const body=route.request().postDataJSON();requests.push(body)
      if(body.action==='start')return route.fulfill({json:{required:true,sent:true,retryAfter:60,destination:'ow•••@example.invalid'}})
      if(body.code!=='012345')return route.fulfill({status:400,json:{error:{code:'INVALID_EMAIL_CODE'}}})
      return route.fulfill({json:{required:true,verified:true,destination:'ow•••@example.invalid'}})
    })
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}/mfa`)
    await page.getByRole('status').filter({hasText:'Código enviado'}).waitFor()
    expect(await page.getByRole('button',{name:/Solicitar otro código/}).isDisabled()).toBe(true)
    await page.getByLabel('Código de seis dígitos').fill('999999')
    await page.getByRole('button',{name:'Verificar y entrar'}).click()
    await page.getByRole('status').filter({hasText:'incorrecto'}).waitFor()
    expect(await page.getByLabel('Código de seis dígitos').inputValue()).toBe('')
    expect(requests.filter(x=>x.action==='start')).toHaveLength(1)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
    mkdirSync('tmp',{recursive:true});await page.screenshot({path:'tmp/owner-email-mobile.png',fullPage:true})
    await page.getByLabel('Código de seis dígitos').fill('012345')
    await page.getByRole('button',{name:'Verificar y entrar'}).click()
    await page.waitForURL('**/operaciones')
  }finally{await browser?.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
},60000)
