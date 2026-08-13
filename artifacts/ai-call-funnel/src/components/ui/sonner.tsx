/**
 * Toaster — thin wrapper around sonner with Linkealls WA light-theme preset.
 * Does NOT depend on next-themes (not used in this project).
 */
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      theme="light"
      richColors
      closeButton
      toastOptions={{
        style: {
          fontFamily: "inherit",
          fontSize: 14,
          borderRadius: 16,
        },
        classNames: {
          toast: "shadow-lg",
        },
      }}
    />
  );
}
