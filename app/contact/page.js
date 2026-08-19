"use client";

import { useState } from "react";
import { createClient } from "../lib/supabaseClient";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Merci de renseigner votre nom, votre e-mail et votre message.");
      return;
    }

    setSending(true);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("contact_messages").insert({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim() || null,
      message: message.trim(),
    });
    setSending(false);

    if (insertError) {
      setError(
        "Votre message n'a pas pu être envoyé. Vous pouvez nous écrire directement à contactsoudesecolesmontmerle@gmail.com."
      );
      return;
    }

    setSent(true);
  }

  return (
    <>
      <section className="bg-sou-blue text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <h1 className="text-3xl sm:text-4xl font-bold">Contact</h1>
          <p className="mt-3 text-white/80 max-w-2xl">
            Une question, une envie de rejoindre une commission, ou de devenir
            partenaire ? Écrivez-nous.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <div className="border border-slate-200 rounded-xl p-8">
          {sent ? (
            <div className="text-center py-6">
              <p className="text-xl font-semibold text-sou-blue mb-2">
                Merci, votre message est bien arrivé !
              </p>
              <p className="text-slate-600">
                Nous vous répondrons dès que possible à l&apos;adresse {email}.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                    Votre nom *
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    Votre e-mail *
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-4 py-2"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-700 mb-1">
                  Sujet
                </label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Adhésion, partenariat, bénévolat..."
                  className="w-full border border-slate-300 rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1">
                  Votre message *
                </label>
                <textarea
                  id="message"
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-4 py-2"
                />
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="bg-sou-blue text-white font-semibold px-6 py-3 rounded-full hover:bg-sou-gold transition-colors disabled:opacity-60"
              >
                {sending ? "Envoi..." : "Envoyer le message"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 text-sm text-slate-500 text-center">
          <p>
            Vous pouvez aussi nous écrire directement à{" "}
            <a
              href="mailto:contactsoudesecolesmontmerle@gmail.com"
              className="text-sou-blue underline"
            >
              contactsoudesecolesmontmerle@gmail.com
            </a>
          </p>
          <p className="mt-2">
            Sou des Écoles Laïques Montmerle-Lurcy — Mairie, 01090
            Montmerle-sur-Saône
          </p>
        </div>
      </section>
    </>
  );
}
