import { useState } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { visitorApi } from "../lib/visitorAccess";
import "../styles/customer-ux.css";

export function OrderProofUpload({
  businessSlug,
  orderId,
  leadId,
  compact = false,
}: {
  businessSlug: string;
  orderId: string;
  leadId: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file.type)) {
      setError("Escolhe uma imagem PNG, JPG, WebP ou PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("O comprovativo deve ter no máximo 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const api = visitorApi(businessSlug);
      const { uploadURL, objectPath } = await api.requestOrderProofUrl(orderId, leadId, file);
      const uploaded = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploaded.ok) throw new Error("O upload não terminou");
      await api.submitOrderProof(orderId, leadId, objectPath);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o comprovativo.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left" style={{ background: "#F0FDF4", color: "#15803D", fontSize: 12 }}>
        <CheckCircle2 size={16} />
        Comprovativo enviado. O negócio vai revê-lo.
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl text-left" style={{ background: "#F8FAFC", border: "1px solid #E6EBF1", padding: compact ? 10 : 12 }}>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold transition-opacity hover:opacity-80 touch-target-min" style={{ background: "#FFFFFF", border: "1px solid #D8E1EA", color: "#0A2540", fontSize: 12 }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
        {busy ? "A enviar…" : "Enviar comprovativo"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {!compact && (
        <p className="mt-2 text-center" style={{ color: "#667781", fontSize: 11 }}>
          PNG, JPG, WebP ou PDF até 10 MB
        </p>
      )}
      {error && <p className="mt-2 text-center" style={{ color: "#DC2626", fontSize: 11 }}>{error}</p>}
    </div>
  );
}