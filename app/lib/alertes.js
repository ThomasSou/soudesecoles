// Comptage de ce qui attend un traitement du bureau : sert à mettre en avant
// les entrées du menu du back-office, le tableau de bord et le récapitulatif
// quotidien par e-mail. Un compteur n'est calculé que si le droit
// correspondant est accordé (`droits` : { cle: true }) ; sinon il vaut null.
export async function compterAlertes(admin, droits) {
  const compte = async (table, filtre) => {
    let q = admin.from(table).select("id", { count: "exact", head: true });
    q = filtre(q);
    const { count } = await q;
    return count || 0;
  };

  const [demandes, messages, devis, factures, remboursements] = await Promise.all([
    droits.demandes ? compte("registration_requests", (q) => q.eq("status", "pending")) : null,
    droits.messages ? compte("contact_messages", (q) => q.eq("handled", false)) : null,
    droits.enseignants ? compte("teacher_quotes", (q) => q.eq("status", "soumis")) : null,
    droits.enseignants ? compte("teacher_invoices", (q) => q.eq("status", "soumise")) : null,
    droits.remboursements ? compte("reimbursement_requests", (q) => q.eq("status", "pending")) : null,
  ]);

  return {
    demandes,
    messages,
    devis,
    factures,
    enseignants: devis == null ? null : devis + factures,
    remboursements,
  };
}
