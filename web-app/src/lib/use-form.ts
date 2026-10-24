"use client";

import { useState } from "react";
import { hasErrors, validate, type Errors, type Rule } from "./validation";

// Small form helper: controlled values, per-field errors that clear on edit,
// and a submit guard that runs the rules.
export function useForm<F extends Record<string, string>>(initial: F) {
  const [values, setValues] = useState<F>(initial);
  const [errors, setErrors] = useState<Errors>({});

  const bind = (key: keyof F & string) => ({
    name: key,
    value: values[key],
    error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValues((s) => ({ ...s, [key]: v }));
      setErrors((s) => ({ ...s, [key]: undefined }));
    },
  });

  const check = (rules: Rule<F>[]) => {
    const e = validate(values, rules);
    setErrors(e);
    return !hasErrors(e);
  };

  const reset = () => {
    setValues(initial);
    setErrors({});
  };

  return { values, errors, bind, check, reset };
}
