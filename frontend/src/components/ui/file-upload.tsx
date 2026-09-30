import { useDropzone } from "react-dropzone"
import { ImagePlus } from "lucide-react"
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
 * DRCIP media dropzone. Selection only — validation and the upload state
 * machine stay in the consuming surface (see ReportIncidentPage).
 */
export function FileUpload({ onFiles, disabled, id, accept, maxFiles, className }: FileUploadProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onFiles(acceptedFiles),
    multiple: true,
    accept: Object.fromEntries(accept.map((m) => [m, []])),
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-input bg-background/50 px-4 py-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDragActive && "border-cobalt-deep bg-cobalt-electric/5",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input {...getInputProps({ id })} data-testid="media-input" />
      <ImagePlus aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-ink">
        {isDragActive ? "Drop files to attach" : "Drag media here or click to browse"}
      </p>
      <p className="text-xs text-muted-foreground">
        Up to {maxFiles} files · photos 10 MB · videos 25 MB / 30s
      </p>
    </div>
  )
}