import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from "motion/react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "../ui/drawer";
import { scrollToSection } from "./homeMotion";
import drcipLockup from "../../assets/brand/drcip-lockup-horizontal.svg";

const NAV_ITEMS = [
  { label: "Platform", id: "product" },
  { label: "Workflow", id: "workflow" },
  { label: "Spatial Intelligence", id: "spatial" },
  { label: "Roles", id: "roles" },
] as const;

/** DRCIP warm canvas glass (matches --home-canvas / --border tokens). */
const CAPSULE_BG = "rgba(239, 243, 248, 0.78)";
const JOINED_BG = "rgba(239, 243, 248, 0.86)";
const RING = "inset 0 0 0 1px rgba(215, 222, 232, 0.9)";
const JOINED_SHADOW = "0 1px 2px rgba(34, 42, 53, 0.05)";

const JOIN_SPRING = { type: "spring" as const, stiffness: 220, damping: 32 };
const SCROLL_THRESHOLD = 80;

interface NavLinkProps {
  id: string;
  label: string;
  active?: boolean;
  onNavigate?: () => void;
}

/** Hash-router-safe section scroll: a button (no href) so the route hash is never touched. */
function SectionButton({ id, label, active, onNavigate }: NavLinkProps) {
  return (
    <button
      type="button"
      onClick={() => {
        scrollToSection(id);
        onNavigate?.();
      }}
      className={cn(
        "rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric",
        active
          ? "bg-cobalt-deep/[0.07] text-cobalt-deep"
          : "text-text-secondary hover:bg-cobalt-deep/[0.05] hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function Lockup() {
  return (
    <Link to="/" aria-label="DRCIP home" className="flex items-center">
      <img src={drcipLockup} alt="DRCIP" className="h-7 w-auto" />
    </Link>
  );
}

/**
 * Aceternity resizable-navbar pattern adapted to DRCIP. At scroll top the
 * three navbar capsules (Logo ▪ Nav Items ▪ Sign In) float independently on
 * the warm canvas; on scroll they contract together into one rounded glass
 * pill (spring) while each keeps its own rounded boundary. Homepage-only.
 */
export function ResizableNavbar() {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setJoined(latest > SCROLL_THRESHOLD);
  });

  // Scroll-spy for the cobalt active state.
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(id);
        },
        { rootMargin: "-40% 0px -40% 0px" },
      );
      io.observe(el);
      observers.push(io);
    });
    return () => observers.forEach((io) => io.disconnect());
  }, []);

  const spring = reduceMotion ? { duration: 0 } : JOIN_SPRING;
  const containerBg = joined ? JOINED_BG : "rgba(239, 243, 248, 0)";
  const containerBox = joined ? JOINED_SHADOW : "none";
  const groupBg = joined ? "rgba(239, 243, 248, 0.42)" : CAPSULE_BG;
  const groupBox = RING;
  const rightGap = joined ? 2 : 5;

  return (
    <header
      data-testid="resizable-nav-root"
      className="pointer-events-none sticky top-0 z-40 w-full px-4 pb-2 pt-2 md:px-6"
    >
      {/* Desktop: three capsules → joined pill */}
      <motion.div
        data-testid="resizable-nav-container"
        animate={{
          width: joined ? "min(100%, 64rem)" : "100%",
          backgroundColor: containerBg,
          boxShadow: containerBox,
        }}
        transition={spring}
        className={cn(
          "pointer-events-auto mx-auto hidden items-center justify-between rounded-full px-2 py-2 lg:flex",
          joined && "backdrop-blur-2xl",
        )}
      >
        <motion.div
          data-testid="resizable-nav-logo"
          animate={{ backgroundColor: groupBg, boxShadow: groupBox }}
          transition={spring}
          className="flex items-center rounded-full px-3 py-1.5"
        >
          <Lockup />
        </motion.div>

          <motion.div
            data-testid="resizable-nav-links"
            animate={{ backgroundColor: groupBg, boxShadow: groupBox, gap: rightGap }}
            transition={spring}
            className="flex items-center rounded-full px-2 py-1.5"
          >
            <nav aria-label="Public" className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => (
                <SectionButton key={item.id} id={item.id} label={item.label} active={activeId === item.id} />
              ))}
            </nav>
          </motion.div>

          <motion.div
            data-testid="resizable-nav-signin"
            animate={{ boxShadow: groupBox }}
            transition={spring}
            className="ml-1 rounded-full"
          >
            <Link
              to="/login"
              data-testid="nav-sign-in"
              className="flex items-center rounded-full bg-cobalt-deep px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-cobalt-electric focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric"
            >
              Sign In
            </Link>
          </motion.div>
        
      </motion.div>

      {/* Mobile: compact rounded capsule + drawer menu */}
      <motion.div
        animate={{
          backgroundColor: joined ? JOINED_BG : CAPSULE_BG,
          boxShadow: joined ? JOINED_SHADOW : RING,
        }}
        transition={spring}
        className={cn(
          "pointer-events-auto mx-auto flex w-full max-w-[calc(100vw-2rem)] items-center justify-between rounded-full px-3 py-2 lg:hidden",
          joined && "backdrop-blur-md",
        )}
      >
        <Lockup />
        <div className="flex items-center gap-1">
          <Link
            to="/login"
            className="inline-flex items-center rounded-full bg-cobalt-deep px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-cobalt-electric"
          >
            Sign In
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => setOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </motion.div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="pb-6 outline-none" aria-describedby={undefined}>
          <DrawerTitle className="sr-only">Public navigation</DrawerTitle>
          <div className="px-4 pt-2">
            <div className="flex h-12 items-center justify-between border-b border-border">
              <img src={drcipLockup} alt="DRCIP" className="h-6 w-auto" />
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            <nav aria-label="Public" className="flex flex-col gap-1 pt-2">
              {NAV_ITEMS.map((item) => (
                <SectionButton
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  active={activeId === item.id}
                  onNavigate={() => setOpen(false)}
                />
              ))}
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-cobalt-deep px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cobalt-electric"
              >
                Sign In
              </Link>
            </nav>
          </div>
        </DrawerContent>
      </Drawer>
    </header>
  );
}
