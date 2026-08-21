import "./globals.css";
import { Header, Footer } from "./components";
import Mesure from "./mesure";

export const metadata = {
  title: "Sou des Écoles Montmerle-Lurcy",
  description:
    "Association de parents d'élèves des écoles de Montmerle-sur-Saône : événements, cotisations, partenaires.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="min-h-screen flex flex-col bg-white text-slate-800">
        <Mesure />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
