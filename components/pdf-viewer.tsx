'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

type PdfJs = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfJs> | undefined

/** Charge pdf.js à la demande (côté navigateur uniquement) avec son worker. */
function loadPdfJs() {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
    return pdfjs
  })
  return pdfjsPromise
}

/**
 * Affiche un PDF page par page avec pdf.js, sans dépendre de la visionneuse du navigateur
 * (désactivée selon les réglages, absente sur mobile).
 */
export function PdfViewer({ src, downloadHref, title }: { src: string; downloadHref: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    let destroy: (() => void) | undefined
    setStatus('loading')
    container.replaceChildren()

    ;(async () => {
      try {
        const [pdfjs, response] = await Promise.all([loadPdfJs(), fetch(src)])
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = new Uint8Array(await response.arrayBuffer())
        if (cancelled) return
        const task = pdfjs.getDocument({ data })
        destroy = () => void task.destroy()
        const pdf = await task.promise

        const ratio = window.devicePixelRatio || 1
        const width = container.clientWidth - 32
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return
          const page = await pdf.getPage(n)
          const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width * ratio)
          canvas.height = Math.floor(viewport.height * ratio)
          canvas.style.width = `${Math.floor(viewport.width)}px`
          canvas.className = 'mx-auto block bg-white shadow-md'
          canvas.setAttribute('aria-label', `${title} — page ${n}`)
          container.append(canvas)
          await page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise
          if (n === 1 && !cancelled) setStatus('ready')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      destroy?.()
    }
  }, [src, title])

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="flex size-full flex-col gap-4 overflow-y-auto p-4" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement de l’aperçu…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-card text-slate-400 shadow-sm">
            <FileText className="size-6" />
          </div>
          <p className="text-sm font-medium text-slate-700">Impossible d’afficher l’aperçu</p>
          <a href={downloadHref} download className={buttonVariants({ size: 'sm' })}>
            <Download data-icon="inline-start" /> Télécharger
          </a>
        </div>
      )}
    </div>
  )
}
