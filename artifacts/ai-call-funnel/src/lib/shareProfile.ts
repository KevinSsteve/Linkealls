interface SharingTools {
  share?: (data: { title: string; url: string }) => Promise<void>;
  copy?: (text: string) => Promise<void>;
}

function browserTools(): SharingTools {
  if (typeof navigator === "undefined") return {};
  return {
    share: navigator.share?.bind(navigator),
    copy: navigator.clipboard?.writeText.bind(navigator.clipboard),
  };
}

/** Cancellation is deliberate: never copy a link after the user closes Share. */
export async function sharePublicProfile(
  data: { title: string; url: string },
  tools: SharingTools = browserTools(),
): Promise<"shared" | "copied" | "cancelled" | "manual"> {
  if (tools.share) {
    try {
      await tools.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }
  if (tools.copy) {
    try {
      await tools.copy(data.url);
      return "copied";
    } catch {
      // The caller exposes a selectable link instead of silently failing.
    }
  }
  return "manual";
}