import { useState } from "react";
import { Link } from "wouter";
import {
  Edit2, Share2, MapPin, Clock, Mail,
  Globe, Phone, Camera, CheckCircle2, Store, Eye, EyeOff, Info, AlertTriangle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BusinessProfile } from "../../lib/api";
import { getCatalogVisibility, type ProfileEditorTarget } from "../../lib/profilePresentation";
import { sharePublicProfile } from "../../lib/shareProfile";
import { getStorageObjectUrl } from "../../lib/api";
import { avatarPalette, initials, D } from "./profileTheme";

export function OwnerProfileOverview({
  profile,
  slug,
  onEdit,
}: {
  profile: BusinessProfile;
  slug: string;
  onEdit: (target?: ProfileEditorTarget) => void;
}) {
  const [shareFeedback, setShareFeedback] = useState<"shared" | "copied" | "manual" | null>(null);
  const [sharing, setSharing] = useState(false);

  const pal = avatarPalette(profile.name || "N");
  const inits = initials(profile.name || "N");
  const visibility = getCatalogVisibility(profile);
  const catalogUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${import.meta.env.BASE_URL}${slug}`;

  const handleShare = async () => {
    if (sharing || !visibility.isPublic) return;
    setSharing(true);
    setShareFeedback(null);
    try {
      const result = await sharePublicProfile({ title: profile.name, url: catalogUrl });
      if (result !== "cancelled") setShareFeedback(result);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div style={{ background: D.bg }}>
      {/* ─── Identity ────────────────────────────────────────────────────────── */}
      <div style={{ background: D.surface, borderBottom: `1px solid ${D.border}`, paddingTop: 24, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 }}>
        <div className="flex items-start gap-4">
          <button 
            onClick={() => onEdit("avatar")}
            className="group relative flex items-center justify-center shrink-0 rounded-full font-bold overflow-hidden"
            style={{
              width: 72, height: 72,
              background: pal.bg,
              color: pal.text,
              fontSize: 26,
              border: `1.5px solid ${D.border}`,
            }}
            data-testid="edit-photo-action"
            aria-label="Alterar fotografia do negócio"
          >
            {profile.avatarUrl ? (
              <img src={getStorageObjectUrl(profile.avatarUrl)} alt={`Foto de ${profile.name}`} className="h-full w-full object-cover" />
            ) : inits}
            <div className="absolute bottom-0 inset-x-0 bg-[#00000088] flex items-center justify-center py-1">
              <Camera size={16} color="white" />
            </div>
          </button>
          
          <div className="flex-1 min-w-0 pt-1">
            <h2 className="leading-tight break-words" style={{ color: D.ink, fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px" }}>
              {profile.name || "Negócio sem nome"}
            </h2>
            {profile.sector && (
              <p className="mt-1 break-words" style={{ color: D.inkSoft, fontSize: 14, lineHeight: 1.4 }}>
                {profile.sector}
              </p>
            )}
            
            <div className="mt-2.5 flex items-center gap-2">
              <button onClick={() => onEdit(visibility.kind === "incomplete" ? "identity" : "catalog")} aria-label={`Configurar catálogo: ${visibility.label}`} data-testid="catalog-status-action" className="flex min-h-11 items-center gap-1.5 px-2.5 py-1 rounded-xl text-left text-[12px] font-semibold" style={{ background: visibility.isPublic ? D.greenMuted : D.subtle, color: visibility.isPublic ? D.greenDk : D.inkSoft }}>
                {visibility.isPublic ? <Eye size={14} /> : <EyeOff size={14} />}
                {visibility.label}
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-5" style={{ color: D.inkSoft }}>{visibility.description}</p>
        
        {/* Share Feedback / manual copy */}
        {shareFeedback === "manual" && (
          <div className="mt-5 p-3 rounded-[12px] border" style={{ background: D.subtle, borderColor: D.border }} role="status">
            <p className="text-[13px] font-medium mb-2 flex items-center gap-1.5" style={{ color: D.inkSoft }}>
               <Info size={16}/> A cópia automática não está disponível. Selecciona o link e copia-o manualmente:
            </p>
            <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2" style={{ borderColor: D.border }}>
               <input readOnly aria-label="Link público para copiar manualmente" data-testid="manual-share-url" value={catalogUrl} className="min-w-0 min-h-11 flex-1 bg-transparent text-[13px]" style={{ color: D.ink }} onFocus={(e)=>e.currentTarget.select()} onClick={(e)=>e.currentTarget.select()} />
            </div>
          </div>
        )}
        {(shareFeedback === "copied" || shareFeedback === "shared") && (
           <div className="mt-5 p-3 rounded-[12px] border flex items-center gap-2 text-[13px] font-medium" style={{ background: D.successBg, borderColor: D.successBorder, color: D.successText }} role="status">
              <CheckCircle2 size={16} /> {shareFeedback === "copied" ? "Link copiado para a área de transferência." : "Partilha concluída."}
           </div>
        )}

        {/* Action Toolbar */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <button 
            onClick={() => onEdit("identity")}
            className="flex flex-col items-center gap-1.5 p-3 rounded-[12px] border transition-colors active:opacity-50"
            style={{ background: D.bg, borderColor: D.border, color: D.inkSoft }}
            data-testid="edit-identity-action"
          >
            <Edit2 size={18} strokeWidth={2} />
            <span className="text-[12px] font-semibold">Editar</span>
          </button>
          
          {visibility.isPublic ? (
             <Link 
               href={`/${slug}`}
               className="flex flex-col items-center gap-1.5 p-3 rounded-[12px] border transition-colors active:opacity-50"
               style={{ background: D.greenLt, borderColor: D.greenLt, color: D.greenDk }}
               data-testid="public-catalog-action"
             >
               <Store size={18} strokeWidth={2} />
                <span className="text-[12px] font-semibold text-center">Ver página pública</span>
             </Link>
          ) : (
             <button 
                onClick={() => onEdit(visibility.kind === "incomplete" ? "identity" : "catalog")}
               className="flex flex-col items-center gap-1.5 p-3 rounded-[12px] border transition-colors active:opacity-50"
               style={{ background: D.errorBg, borderColor: D.errorBorder, color: D.errorText }}
               data-testid="visibility-catalog-action"
             >
               <AlertTriangle size={18} strokeWidth={2} />
               <span className="text-[12px] font-semibold">Publicar</span>
             </button>
          )}

          <button 
            onClick={handleShare}
             disabled={!visibility.isPublic || sharing}
            className="flex flex-col items-center gap-1.5 p-3 rounded-[12px] border transition-colors active:opacity-50 disabled:opacity-50"
            style={{ background: D.bg, borderColor: D.border, color: D.inkSoft }}
            data-testid="share-catalog-action"
          >
            <Share2 size={18} strokeWidth={2} />
             <span className="text-[12px] font-semibold">{sharing ? "A abrir…" : "Partilhar"}</span>
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => onEdit("offerings")} data-testid="manage-offerings-action" className="min-h-11 rounded-lg px-2 text-[13px] font-semibold" style={{ color: D.green }}>
            {profile.offerings.length ? `Gerir produtos (${profile.offerings.length})` : "Adicionar produtos"}
          </button>
          <button onClick={() => onEdit("links")} data-testid="manage-links-action" className="min-h-11 rounded-lg px-2 text-[13px] font-semibold" style={{ color: D.green }}>Gerir links públicos</button>
        </div>
      </div>

      {/* ─── Informações (Contact and Description grouped) ─────────────────── */}
      <div className="px-5 mt-8">
        <div className="flex items-center justify-between mb-3">
           <h3 className="text-[12px] font-bold tracking-[0.08em] uppercase" style={{ color: D.inkFaint }}>
             Sobre o negócio
           </h3>
            <button onClick={() => onEdit("description")} className="min-h-11 px-2 text-[13px] font-semibold" style={{ color: D.green }} data-testid="edit-description-action">
             {profile.description ? "Editar" : "Adicionar"}
           </button>
        </div>
        <div 
          className="rounded-[16px] border p-4 text-[14px] leading-relaxed break-words"
          style={{ background: D.surface, borderColor: D.border, color: D.ink }}
        >
           {profile.description ? (
             <p className="whitespace-pre-wrap">{profile.description}</p>
           ) : (
             <p className="italic" style={{ color: D.inkFaint }}>Sem descrição. Adiciona uma apresentação do teu negócio.</p>
           )}
        </div>
      </div>

      <div className="px-5 mt-6 mb-8">
        <div className="flex items-center justify-between mb-3">
           <h3 className="text-[12px] font-bold tracking-[0.08em] uppercase" style={{ color: D.inkFaint }}>
             Contactos
           </h3>
        </div>
        
        <div className="rounded-[16px] border overflow-hidden" style={{ background: D.surface, borderColor: D.border }}>
          <ContactRow icon={MapPin} label="Endereço" value={profile.address} placeholder="Adicionar morada" onClick={() => onEdit("address")} dataTestId="contact-address-action" />
          <ContactRow icon={Clock} label="Horário" value={profile.hours} placeholder="Adicionar horário" onClick={() => onEdit("hours")} dataTestId="contact-hours-action" />
          <ContactRow icon={Phone} label="Telefone" value={profile.phone} placeholder="Adicionar telefone" onClick={() => onEdit("phone")} dataTestId="contact-phone-action" />
          <ContactRow icon={Mail} label="E-mail" value={profile.email} placeholder="Adicionar e-mail" onClick={() => onEdit("email")} dataTestId="contact-email-action" />
          <ContactRow icon={Globe} label="Website" value={profile.websiteUrl} placeholder="Adicionar website" onClick={() => onEdit("website")} dataTestId="contact-website-action" last />
        </div>
      </div>
    </div>
  );
}

function ContactRow({ icon: Icon, label, value, placeholder, onClick, last, dataTestId }: {
  icon: LucideIcon; label: string; value?: string | null; placeholder: string;
  onClick: () => void; last?: boolean; dataTestId: string;
}) {
  return (
    <button 
      onClick={onClick}
      className="w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8FAFC]"
      style={{ borderBottom: !last ? `1px solid ${D.border}` : "none" }}
      data-testid={dataTestId}
    >
      <div className="mt-0.5" style={{ color: D.inkFaint }}><Icon size={18} /></div>
      <div className="flex-1 min-w-0">
        {value && <p className="text-[12px] font-semibold mb-0.5" style={{ color: D.inkFaint }}>{label}</p>}
        {value ? (
          <p className="text-[14px] break-words whitespace-pre-line" style={{ color: D.ink }}>{value}</p>
        ) : (
          <p className="text-[14px] opacity-70" style={{ color: D.inkSoft }}>{placeholder}</p>
        )}
      </div>
    </button>
  );
}
