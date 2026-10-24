export type Rule<F> = [keyof F & string, (value: string, form: F) => boolean, string];
export type Errors = Record<string, string | undefined>;

export const emailOk = (e: string) => /^\S+@\S+\.\S+$/.test(e);
export const required = (v: string) => !!v.trim();
export const minLength = (n: number) => (v: string) => v.length >= n;
export const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 8;

// Returns the first failing message per field, in rule order.
export function validate<F extends Record<string, string>>(form: F, rules: Rule<F>[]): Errors {
  const errors: Errors = {};
  for (const [key, test, msg] of rules) if (!errors[key] && !test(form[key] ?? "", form)) errors[key] = msg;
  return errors;
}

export const hasErrors = (e: Errors) => Object.values(e).some(Boolean);
