import { useRef, useState, type DragEvent } from "react"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadProps {
  onFiles: (files: File[]) => void
  disabled?: boolean
  id?: string
  accept: string[]
  maxFiles: number
  className?: string
}

/**
 * Aceternity FileUpload adapted to DRCIP tokens. A grid-masked dropzone that
 * opens the picker on click and accepts drag-and-drop; selection only —
 * validation and the upload state machine stay in the consuming surface
 * (see ReportIncidentPage).
 */
export function FileUpload({ onFiles, disabled, id, accept, maxFiles, className }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const emit = (files: File[]) => {
    if (files.length === 0) return
    onFiles(files)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (disabled) return
    emit(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload media"
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
      className={cn(
        "group/file relative block w-full cursor-pointer overflow-hidden rounded-drcip-md border border-border bg-surface p-10 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cobalt-electric focus-visible:ring-offset-2",
        dragActive && "border-cobalt-deep bg-cobalt-electric/5",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={id}
        data-testid="media-input"
        type="file"
        multiple
        accept={accept.join(",")}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          emit(Array.from(e.target.files || []))
          e.target.value = ""
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="relative z-10 flex flex-col items-center justify-center">
        <p className="text-base font-bold text-ink">{dragActive ? "Drop it" : "Upload media"}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Drag or drop your files here or click to upload
        </p>
        <span className="mx-auto mt-6 flex h-20 w-32 items-center justify-center rounded-md border border-dashed border-border bg-surface shadow-sm transition-shadow group-hover/file:shadow-md">
          <Upload className="h-5 w-5 text-cobalt-deep" aria-hidden="true" />
        </span>
        <p className="mt-4 text-xs text-muted-foreground">
          Up to {maxFiles} files · photos 10 MB · videos 25 MB / 30s
        </p>
      </div>
    </div>
  )
}