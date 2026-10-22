import React from 'react';
import {
    Share2,
    Network,
    ShieldCheck,
    ArrowRight,
    Wind,
    CloudRain,
    Bug,
    Sparkles,
    Info,
    CheckCircle2
} from 'lucide-react';

const NDCU_RULES = [
    {
        id: "RULE-01",
        name: "High Wind Adulticiding Constraint",
        condition: "Wind Velocity > 15.0 km/h",
        action: "Deploy Indoor ULV Cold Fogging",
        rationale: "Prevents atmospheric dispersion and thermal drift of pesticide droplet cloud away from target adult mosquito rest sites.",
        status: "Active in recommendation_engine.py"
    },
    {
        id: "RULE-02",
        name: "Moderate Wind Thermal Canopy Penetration",
        condition: "Wind Velocity ≤ 15.0 km/h",
        action: "Outdoor Thermal Fogging (Malathion / Deltamethrin)",
        rationale: "Thermal fog penetrates outdoor vegetation canopy and residential perimeter resting habitats during calm morning/evening hours.",
        status: "Active in recommendation_engine.py"
    },
    {
        id: "RULE-03",
        name: "Larval Focus Saturation",
        condition: "Active Breeding Sites > 15 & Cumulative Rain > 100mm",
        action: "Direct Application of Temephos (Abate) Larvicide",
        rationale: "Interrupts mosquito life-cycle by eliminating Aedes aegypti larvae in non-potable stagnant water accumulations before pupation.",
        status: "Active in recommendation_engine.py"
    },
    {
        id: "RULE-04",
        name: "Post-Monsoon Primary Source Reduction",
        condition: "Heavy Rain (7-day > 80mm) with Discarded Containers",
        action: "Manual Source Reduction & Community Disposal",
        rationale: "Physical elimination of water-holding receptacles (coconut shells, tires, open tins) provides sustainable, chemical-free vector containment.",
        status: "Active in recommendation_engine.py"
    }
];

export default function KnowledgeGraphScreen() {
    return (
        <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-surface p-5 rounded-xl border border-borderLight shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-mintSurface text-primary flex items-center justify-center shrink-0">
                        <Share2 size={22} />
                    </div>
                    <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-textMuted">
                            Clinical & Operational Knowledge Engineering
                        </span>
                        <h3 className="text-base font-bold text-darkBase">
                            Prevention Knowledge Graph & NDCU Protocol Relationships
                        </h3>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="bg-mintSurface text-primary border border-secondary/30 px-3 py-1 rounded-full text-xs font-bold">
                        NDCU Decision Tree Active
                    </span>
                </div>
            </div>

            {/* Active NDCU Rule Ontology Matrix */}
            <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-xs font-bold uppercase text-textMuted tracking-wider">
                            Active Deterministic Ontology
                        </span>
                        <h4 className="text-base font-bold text-darkBase">
                            National Dengue Control Unit (NDCU) Guideline Logic
                        </h4>
                    </div>
                    <span className="text-xs font-mono text-textMuted">
                        Source: Sri Lanka Ministry of Health NDCU Circulars
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {NDCU_RULES.map((rule) => (
                        <div key={rule.id} className="p-4 bg-background rounded-xl border border-borderLight space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] font-bold bg-surface border border-borderLight px-2 py-0.5 rounded text-primary">
                                    {rule.id}
                                </span>
                                <span className="text-[10px] font-bold text-riskCleared flex items-center gap-1">
                                    <CheckCircle2 size={12} /> {rule.status}
                                </span>
                            </div>

                            <h5 className="font-bold text-darkBase text-sm">
                                {rule.name}
                            </h5>

                            <div className="space-y-1 text-xs">
                                <p className="text-slate-700">
                                    <strong className="text-darkBase">Environmental Trigger:</strong>{' '}
                                    <span className="font-mono text-primary font-bold">{rule.condition}</span>
                                </p>
                                <p className="text-slate-700">
                                    <strong className="text-darkBase">Mandated Action:</strong>{' '}
                                    <span className="font-semibold text-darkBase">{rule.action}</span>
                                </p>
                            </div>

                            <p className="text-[11px] text-textMuted italic bg-surface p-2.5 rounded-lg border border-borderLight">
                                "{rule.rationale}"
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Prevention Entity Relationship Map */}
            <div className="bg-surface p-6 rounded-xl border border-borderLight shadow-sm space-y-4">
                <span className="text-xs font-bold uppercase text-textMuted tracking-wider block">
                    Structural Prevention Entity Relationships
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="p-4 bg-mintSurface rounded-xl border border-primary/20 space-y-2">
                        <span className="font-bold text-primary block uppercase text-[10px] tracking-wider">Macro Tier 1 (Strategy)</span>
                        <p className="font-extrabold text-darkBase text-sm">Source Reduction</p>
                        <p className="text-[11px] text-textMuted">
                            Physical container elimination, solid waste removal, drain clearance. Zero environmental toxicity.
                        </p>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                        <span className="font-bold text-secondary block uppercase text-[10px] tracking-wider">Macro Tier 1 (Chemical)</span>
                        <p className="font-extrabold text-darkBase text-sm">Larviciding (Temephos)</p>
                        <p className="text-[11px] text-textMuted">
                            Organophosphate vector control applied directly to domestic breeding containers and roadside drain traps.
                        </p>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                        <span className="font-bold text-amber-800 block uppercase text-[10px] tracking-wider">Macro Tier 1 (Emergency)</span>
                        <p className="font-extrabold text-darkBase text-sm">Adulticiding (Fogging)</p>
                        <p className="text-[11px] text-textMuted">
                            Thermal or cold fog space spray with Malathion or Deltamethrin for adult vector knockdown during cluster surges.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
