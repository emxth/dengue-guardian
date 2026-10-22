import { useState } from "react";
import { UserCheck, UserX, CheckCircle2, Clock } from "lucide-react";

export default function PhiApprovalPage() {
    const [officers, setOfficers] = useState([
        {
            id: "PHI-KW-101",
            name: "K. A. Perera",
            division: "Kaduwela MOH",
            phone: "071-4582910",
            status: "Pending",
        },
        {
            id: "PHI-KW-102",
            name: "S. M. Jayasinghe",
            division: "Battaramulla North",
            phone: "077-8923145",
            status: "Pending",
        },
        {
            id: "PHI-KW-103",
            name: "R. D. Silva",
            division: "Malabe East",
            phone: "076-3129804",
            status: "Approved",
        },
    ]);

    const handleStatusChange = (id, newStatus) => {
        setOfficers((prev) =>
            prev.map((phi) => (phi.id === id ? { ...phi, status: newStatus } : phi))
        );
    };

    return (
        <div className="space-y-6">
            {/* Highlighted Header Card */}
            <div className="bg-mintSurface border-l-4 border-primary p-5 rounded-xl flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-darkBase">
                        PHI User Management & Field Access Approval
                    </h3>
                    <p className="text-sm text-textMuted mt-0.5">
                        Verify and authorize Public Health Inspectors to access the Dengue-Guardian Mobile Client
                    </p>
                </div>
                <span className="bg-surface text-primary border border-primary px-3.5 py-1.5 rounded-full text-xs font-bold">
                    Total Officers: {officers.length}
                </span>
            </div>

            {/* PHI Table Card */}
            <div className="bg-surface rounded-xl border border-borderLight shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-background border-b border-borderLight text-xs font-bold uppercase text-textMuted">
                        <tr>
                            <th className="p-4">Officer ID</th>
                            <th className="p-4">Full Name</th>
                            <th className="p-4">Assigned MOH / GN Division</th>
                            <th className="p-4">Contact</th>
                            <th className="p-4">Approval Status</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-borderLight text-sm">
                        {officers.map((phi) => (
                            <tr key={phi.id} className="hover:bg-background/60 transition">
                                <td className="p-4 font-bold text-primary">{phi.id}</td>
                                <td className="p-4 font-semibold text-darkBase">{phi.name}</td>
                                <td className="p-4 text-textMuted">{phi.division}</td>
                                <td className="p-4 text-textMuted">{phi.phone}</td>
                                <td className="p-4">
                                    {phi.status === "Approved" && (
                                        <span className="inline-flex items-center gap-1.5 bg-mintSurface text-riskCleared px-3 py-1 rounded-full text-xs font-bold">
                                            <CheckCircle2 size={14} /> Approved
                                        </span>
                                    )}
                                    {phi.status === "Pending" && (
                                        <span className="inline-flex items-center gap-1.5 bg-background border border-riskMedium text-riskMedium px-3 py-1 rounded-full text-xs font-bold">
                                            <Clock size={14} /> Pending Review
                                        </span>
                                    )}
                                    {phi.status === "Rejected" && (
                                        <span className="inline-flex items-center gap-1.5 bg-background border border-riskHigh text-riskHigh px-3 py-1 rounded-full text-xs font-bold">
                                            <UserX size={14} /> Revoked
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-right space-x-2">
                                    {phi.status !== "Approved" && (
                                        <button
                                            onClick={() => handleStatusChange(phi.id, "Approved")}
                                            className="bg-primary hover:bg-secondary text-surface px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition"
                                        >
                                            <UserCheck size={14} /> Approve PHI
                                        </button>
                                    )}
                                    {phi.status !== "Rejected" && (
                                        <button
                                            onClick={() => handleStatusChange(phi.id, "Rejected")}
                                            className="bg-surface border border-riskHigh text-riskHigh hover:bg-riskHigh hover:text-surface px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition"
                                        >
                                            <UserX size={14} /> Revoke
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}