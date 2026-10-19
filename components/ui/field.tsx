import { cn } from '@/lib/utils'

const controlClass =
  'w-full rounded-lg border border-slate-200 bg-background px-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

function Field({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  )
}

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(controlClass, 'h-9', className)} {...props} />
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(controlClass, 'min-h-20 py-2', className)} {...props} />
}

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn(controlClass, 'h-9 pr-8', className)} {...props} />
}

export { Field, Input, NativeSelect, Textarea }
