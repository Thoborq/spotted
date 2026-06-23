"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Database, ImageIcon, Bell, ShieldCheck } from "lucide-react";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";

const sections = [
  {
    icon: Database,
    title: "Was wird gespeichert?",
    body: "Dein Profil (Name, E-Mail, Alter) und dein Spot-Verlauf werden ausschließlich lokal auf diesem Gerät gespeichert — alle Angaben sind optional. Es gibt kein Nutzerkonto auf einem Server und keinen Cloud-Abgleich. Niemand außer dir hat Zugriff auf diese Daten.",
  },
  {
    icon: ImageIcon,
    title: "Was passiert mit meinen Fotos?",
    body: "Wenn du ein Produkt scannst, wird dein Foto kurz an einen externen Bilderkennungsdienst übermittelt, um das Produkt zu identifizieren. Direkt danach wird es wieder gelöscht — es wird nicht dauerhaft gespeichert oder für andere Zwecke verwendet.",
  },
  {
    icon: Bell,
    title: "Benachrichtigungen",
    body: "Deine Auswahl bei Benachrichtigungen wird nur lokal gespeichert. Aktuell verschickt Spotted noch keine Push-Benachrichtigungen — das bereiten wir gerade vor.",
  },
  {
    icon: ShieldCheck,
    title: "Tracking & Werbung",
    body: "Spotted verwendet keine Analyse- oder Tracking-Tools und zeigt keine Werbung an.",
  },
];

export default function DatenschutzPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <header className="flex items-center gap-3 px-4 pt-4">
        <IconButton onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[17px] font-bold tracking-tight">Datenschutz</h1>
      </header>

      <div className="flex-1 px-5 pb-10 pt-5">
        <p className="px-1 text-[14px] leading-6 text-foreground-secondary">
          Kurz und verständlich — so geht Spotted mit deinen Daten um.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          {sections.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="p-4">
              <div className="mb-2.5 flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
                  <Icon size={16} className="text-foreground-secondary" />
                </div>
                <p className="text-[15px] font-semibold">{title}</p>
              </div>
              <p className="text-[13.5px] leading-5 text-foreground-secondary">
                {body}
              </p>
            </Card>
          ))}
        </div>

        <p className="mt-6 px-1 text-[12.5px] text-foreground-tertiary">
          Du kannst deine Profildaten jederzeit in den Account-Einstellungen
          ändern oder leeren.
        </p>
      </div>
    </div>
  );
}
