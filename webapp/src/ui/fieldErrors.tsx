import { createContext, useCallback, useContext, useState } from "react";

type Report = (id: string, message: string | null) => void;

const FieldErrorContext = createContext<Report | null>(null);

/** Collects the input errors of the number fields inside it, so a Save or Publish button can wait until they are fixed. */
export const FieldErrorScope = FieldErrorContext.Provider;

export function useFieldErrorReport(): Report | null {
  return useContext(FieldErrorContext);
}

export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const report = useCallback<Report>((id, message) => {
    setErrors((current) => {
      if (message) return current[id] === message ? current : { ...current, [id]: message };
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  const messages = Object.values(errors);
  return { report, count: messages.length, first: messages[0] ?? null };
}
