import { cn } from '../../lib/utils'

export interface SectionHeadingProps {
  eyebrow: string
  title: string
  description?: string
  note?: string
  align?: 'left' | 'center'
}

/** Editorial section header — Inter eyebrow, headline, optional lede + mono note. */
export function SectionHeading({ eyebrow, title, description, note, align = 'left' }: SectionHeadingProps) {
  const centered = align === 'center'
  return (
    <div data-reveal className={cn('max-w-3xl', centered && 'mx-auto text-center')}>
      <p className="home-eyebrow">{eyebrow}</p>
      <h2 className={cn('home-h2 mt-4', centered && 'mx-auto')}>{title}</h2>
      {description && <p className={cn('home-lede', centered && 'mx-auto')}>{description}</p>}
      {note && <p className="home-mono mt-5">{note}</p>}
    </div>
  )
}