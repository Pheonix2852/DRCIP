import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

type LoadingState = {
  text: string;
};

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const CheckFilled = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
      clipRule="evenodd"
    />
  </svg>
);

const LoaderCore = ({ loadingStates, value = 0 }: { loadingStates: LoadingState[]; value?: number }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading DRCIP homepage"
      className="mx-auto flex max-w-xl flex-col items-center justify-center"
    >
      {loadingStates.map((loadingState, index) => {
        const distance = Math.abs(index - value);
        const opacity = Math.max(1 - distance * 0.2, 0);

        return (
          <motion.div
            key={loadingState.text}
            className="flex w-fit items-center gap-3 py-3 text-left"
            initial={{ opacity: 0 }}
            animate={{ opacity, y: -(value * 40) }}
            transition={{ duration: 0.5 }}
          >
            {index > value && <CheckIcon className="h-6 w-6 shrink-0 text-text-muted" />}
            {index <= value && (
              <CheckFilled
                className={cn("h-6 w-6 shrink-0", value === index ? "text-cobalt-electric" : "text-ink/40")}
              />
            )}
            <span
              className={cn("text-base md:text-lg", value === index ? "font-semibold text-ink" : "text-text-muted")}
            >
              {loadingState.text}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
};

export const MultiStepLoader = ({
  loadingStates,
  loading,
  duration = 1000,
  onComplete,
}: {
  loadingStates: LoadingState[];
  loading?: boolean;
  duration?: number;
  onComplete?: () => void;
}) => {
  const [currentState, setCurrentState] = React.useState(0);
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  React.useEffect(() => {
    if (!loading) {
      setCurrentState(0);
      return;
    }

    if (currentState >= loadingStates.length - 1) {
      const finish = setTimeout(() => onCompleteRef.current?.(), duration * 0.6);
      return () => clearTimeout(finish);
    }

    const next = setTimeout(() => setCurrentState(currentState + 1), duration * 0.6);
    return () => clearTimeout(next);
  }, [currentState, loading, duration, loadingStates.length]);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--home-canvas)]"
        >
          <div className="flex w-full max-w-xl flex-col items-center px-6">
            <div className="mt-6 w-full">
              <LoaderCore value={currentState} loadingStates={loadingStates} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
