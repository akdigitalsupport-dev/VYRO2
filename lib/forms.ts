export type FormActionState = {
  status: "idle" | "error" | "success";
  message: string;
  fieldErrors?: Record<string, string>;
  recordId?: string;
};

export const initialFormActionState: FormActionState = {
  status: "idle",
  message: "",
};
