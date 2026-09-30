import { useReveal } from "./useReveal";
import { SectionHeading } from "./SectionHeading";
import { MaskContainer } from "../ui/svg-mask-effect";
import resourceCoordination from "../../assets/homepage/supporting/drcip-resource-coordination.webp";
import howWeWork from "../../assets/homepage/drcip-how-we-work.webp";
const STEPS = [
  {
    n: "01",
    title: "Report an incident",
    copy: "Citizens and field officers submit incident reports with location, photos, and video — creating the first operational record.",
  },
  {
    n: "02",
    title: "Assess and prioritize",
    copy: "Severity analysis and demand forecasting support the coordinator's triage decision. When intelligence is unavailable, manual triage continues without interruption.",
  },
  {
    n: "03",
    title: "Coordinate resources",
    copy: "The command center provides a live view of incidents, resources, teams, and shelters. Optimization recommends the best allocation — the coordinator decides.",
  },
  {
    n: "04",
    title: "Execute the response",
    copy: "Field teams receive assignments, submit status updates, and complete operations — with real-time visibility across the command center.",
  },
] as const;

export function WorkflowSection() {
  const ref = useReveal<HTMLElement>();

  return (
    <section
      id="workflow"
      ref={ref}
      aria-labelledby="workflow-heading"
      className="scroll-mt-20 border-t border-border bg-surface-cool py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="How It Works"
          title="From report to resolution"
          description="One engineered process, four accountable steps. Each hand-off is recorded in the operational record."
        />

        <ol className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-0 md:divide-x md:divide-[var(--border)]">
          {STEPS.map((step) => (
            <li
              key={step.n}
              data-reveal
              className="wf-step border-t border-border pt-6 md:border-t-0 md:px-8 md:first:pl-0 md:last:pr-0"
            >
              <span className="wf-step-num home-mono">STEP {step.n}</span>
              <h3 className="mt-3 text-xl font-medium tracking-tight text-ink">{step.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">{step.copy}</p>
            </li>
          ))}
        </ol>

        <figure data-reveal className="mt-16 home-figure">
          <div className="relative aspect-[21/9] w-full overflow-hidden">
            <MaskContainer
              size={0}
              revealSize={520}
              className="h-full w-full"
              revealText={
                <div className="relative h-full w-full">
                  <img
                    src={resourceCoordination}
                    alt="Coordinated allocation of resources and response assets across a region"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-20"
                  />

                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center">
                    <p className="home-mono tracking-[0.08em]" style={{ fontSize: "2rem" }}>
                      HOVER TO REVEAL HOW DRCIP WORKS
                    </p>
                  </div>
                </div>
              }
            >
              <div className="relative h-full w-full bg-canvas">
                {/* Revealed image */}
                <img
                  src={howWeWork}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover opacity-50 backdrop-brightness-75"
                />

                {/* DRCIP text over revealed image */}
                <div className="relative z-10 flex h-full items-center justify-center px-6 py-8 text-center md:px-12">
                  <div className="max-w-4xl">
                    <p className="home-mono mb-4" style={{ color: "black", fontWeight: "bold", fontSize: "1rem" }}>
                      REPORT → ASSESS → COORDINATE → EXECUTE
                    </p>

                    <h3 className="text-2xl font-medium tracking-tight text-ink md:text-5xl">
                      One accountable response workflow.
                    </h3>

                    <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-text-secondary md:text-black">
                      DRCIP connects incident reporting, triage, resources, field teams, and execution in one
                      coordinated operational process.
                    </p>
                  </div>
                </div>
              </div>
            </MaskContainer>
          </div>
        </figure>
      </div>
    </section>
  );
}
