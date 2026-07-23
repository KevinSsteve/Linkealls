import { useState } from "react";
import { Plus, Trash2, Save, RefreshCw, Loader2 } from "lucide-react";
import type { BusinessProfile, ProfileDraft, Offering, FaqItem } from "../../lib/api";

const inputCls =
  "w-full bg-[#0D1826] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#00A884]/60 transition-colors";
const labelCls = "block text-[13px] font-medium text-slate-400 mb-1.5";
const sectionCls =
  "bg-[#101B29] border border-white/[0.06] rounded-xl p-4 space-y-4";

interface Props {
  profile: BusinessProfile;
  draft: ProfileDraft | null;
  saving: boolean;
  reanalyzing: boolean;
  onSave: (fields: ProfileDraft & { websiteUrl?: string | null }) => void;
  onReanalyze: (url: string) => void;
}

export function ProfileEditor({ profile, draft, saving, reanalyzing, onSave, onReanalyze }: Props) {
  const init = <K extends keyof ProfileDraft>(key: K, fallback: NonNullable<ProfileDraft[K]>) =>
    (draft?.[key] ?? (profile[key as keyof BusinessProfile] as ProfileDraft[K]) ?? fallback) as NonNullable<ProfileDraft[K]>;

  const [name, setName] = useState<string>(init("name", ""));
  const [sector, setSector] = useState<string>(init("sector", ""));
  const [description, setDescription] = useState<string>(init("description", ""));
  const [targetAudience, setTargetAudience] = useState<string>(init("targetAudience", ""));
  const [toneOfVoice, setToneOfVoice] = useState<string>(init("toneOfVoice", ""));
  const [differentials, setDifferentials] = useState<string[]>(init("differentials", []));
  const [offerings, setOfferings] = useState<Offering[]>(init("offerings", []));
  const [faq, setFaq] = useState<FaqItem[]>(init("faq", []));
  const [qualificationGoals, setQualificationGoals] = useState<string[]>(init("qualificationGoals", []));
  const [siteUrl, setSiteUrl] = useState<string>(profile.websiteUrl ?? "");

  const handleSave = () => {
    onSave({
      name: name.trim(),
      sector: sector.trim(),
      description: description.trim(),
      targetAudience: targetAudience.trim(),
      toneOfVoice: toneOfVoice.trim(),
      differentials: differentials.map((d) => d.trim()).filter(Boolean),
      offerings: offerings.filter((o) => o.name.trim()),
      faq: faq.filter((f) => f.question.trim()),
      qualificationGoals: qualificationGoals.map((g) => g.trim()).filter(Boolean),
      websiteUrl: siteUrl.trim() || null,
    });
  };

  return (
    <div className="space-y-4 pb-48">
      {/* Identity */}
      <div className={sectionCls}>
        <h3 className="text-sm font-semibold text-slate-200">Identidade</h3>
        <div>
          <label className={labelCls}>Nome do negócio *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Óptica Luanda Premium" />
        </div>
        <div>
          <label className={labelCls}>Setor</label>
          <input className={inputCls} value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Ex.: Óptica e saúde visual" />
        </div>
        <div>
          <label className={labelCls}>Descrição</label>
          <textarea className={`${inputCls} min-h-[90px] resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que o negócio faz, para quem e onde" />
        </div>
        <div>
          <label className={labelCls}>Público-alvo</label>
          <input className={inputCls} value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Quem são os clientes ideais" />
        </div>
        <div>
          <label className={labelCls}>Tom de voz</label>
          <input className={inputCls} value={toneOfVoice} onChange={(e) => setToneOfVoice(e.target.value)} placeholder="Ex.: profissional e acolhedor" />
        </div>
      </div>

      {/* Offerings */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Produtos & serviços</h3>
          <AddBtn onClick={() => setOfferings([...offerings, { name: "", description: "", price: "" }])} />
        </div>
        {offerings.length === 0 && <EmptyHint text="Adiciona os produtos/serviços que a IA pode oferecer nas chamadas." />}
        {offerings.map((o, i) => (
          <div key={i} className="border border-white/[0.06] rounded-lg p-3 space-y-2 relative">
            <RemoveBtn onClick={() => setOfferings(offerings.filter((_, j) => j !== i))} />
            <input className={inputCls} value={o.name} placeholder="Nome" onChange={(e) => setOfferings(offerings.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input className={inputCls} value={o.price} placeholder="Preço (ex.: 45.000 Kz, sob consulta)" onChange={(e) => setOfferings(offerings.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            <textarea className={`${inputCls} min-h-[60px] resize-y`} value={o.description} placeholder="Descrição curta" onChange={(e) => setOfferings(offerings.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          </div>
        ))}
      </div>

      {/* Differentials */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Diferenciais</h3>
          <AddBtn onClick={() => setDifferentials([...differentials, ""])} />
        </div>
        {differentials.length === 0 && <EmptyHint text="O que torna o negócio único (entrega rápida, garantia, etc.)." />}
        {differentials.map((d, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} value={d} placeholder="Ex.: Entrega em 24h em Luanda" onChange={(e) => setDifferentials(differentials.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveBtn inline onClick={() => setDifferentials(differentials.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Perguntas frequentes</h3>
          <AddBtn onClick={() => setFaq([...faq, { question: "", answer: "" }])} />
        </div>
        {faq.length === 0 && <EmptyHint text="Respostas prontas que a IA usa nas chamadas." />}
        {faq.map((f, i) => (
          <div key={i} className="border border-white/[0.06] rounded-lg p-3 space-y-2 relative">
            <RemoveBtn onClick={() => setFaq(faq.filter((_, j) => j !== i))} />
            <input className={inputCls} value={f.question} placeholder="Pergunta" onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
            <textarea className={`${inputCls} min-h-[60px] resize-y`} value={f.answer} placeholder="Resposta" onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
          </div>
        ))}
      </div>

      {/* Qualification goals */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Objetivos de qualificação</h3>
          <AddBtn onClick={() => setQualificationGoals([...qualificationGoals, ""])} />
        </div>
        <EmptyHint text="O que a IA deve descobrir em cada chamada (orçamento, prazo, contacto...)." />
        {qualificationGoals.map((g, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} value={g} placeholder="Ex.: Orçamento disponível" onChange={(e) => setQualificationGoals(qualificationGoals.map((x, j) => (j === i ? e.target.value : x)))} />
            <RemoveBtn inline onClick={() => setQualificationGoals(qualificationGoals.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>

      {/* Re-analysis */}
      <div className={sectionCls}>
        <h3 className="text-sm font-semibold text-slate-200">Reanalisar o site</h3>
        <p className="text-[13px] text-slate-500">Substitui o perfil pelo resultado de uma nova análise do site.</p>
        <div className="flex gap-2">
          <input className={inputCls} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://oteusite.co.ao" />
          <button
            onClick={() => siteUrl.trim() && onReanalyze(siteUrl.trim())}
            disabled={reanalyzing || !siteUrl.trim()}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white/[0.06] text-slate-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            {reanalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Reanalisar
          </button>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed left-0 right-0 p-3 bg-gradient-to-t from-[#080E18] via-[#080E18]/95 to-transparent flex justify-center z-10" style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}>
        <div className="w-full max-w-2xl">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-[#00A884] hover:bg-[#02BD7E] disabled:opacity-40 text-[#06251C] font-semibold rounded-xl px-4 py-3 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "A guardar..." : "Guardar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[13px] font-medium text-[#00A884] hover:text-[#02BD7E] transition-colors">
      <Plus className="w-4 h-4" /> Adicionar
    </button>
  );
}

function RemoveBtn({ onClick, inline }: { onClick: () => void; inline?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={
        inline
          ? "shrink-0 p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors"
          : "absolute top-2 right-2 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-white/[0.04] transition-colors"
      }
      aria-label="Remover"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-[13px] text-slate-500">{text}</p>;
}
