"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Card from "@/components/ui/Card";
import IconButton from "@/components/ui/IconButton";
import Switch from "@/components/ui/Switch";
import { getNotificationsOptIn, saveNotificationsOptIn } from "@/lib/notifications";

export default function BenachrichtigungenPage() {
  const router = useRouter();
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setOptIn(getNotificationsOptIn());
  }, []);

  function toggle(value: boolean) {
    setOptIn(value);
    saveNotificationsOptIn(value);
  }

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <header className="flex items-center gap-3 px-4 pt-4">
        <IconButton onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[17px] font-bold tracking-tight">
          Benachrichtigungen
        </h1>
      </header>

      <div className="flex-1 px-5 pb-10 pt-5">
        <Card className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">
              Benachrichtigungen erhalten
            </p>
            <p className="mt-0.5 text-[13px] leading-5 text-foreground-secondary">
              Wir informieren dich, sobald es Neuigkeiten zu Spotted gibt.
            </p>
          </div>
          <Switch
            checked={optIn}
            onChange={toggle}
            label="Benachrichtigungen erhalten"
          />
        </Card>

        <p className="mt-4 px-1 text-[12.5px] text-foreground-tertiary">
          Push-Benachrichtigungen sind noch nicht aktiv — wir bereiten sie
          gerade vor. Deine Auswahl wird gespeichert, damit wir dich
          automatisch informieren, sobald sie verfügbar sind.
        </p>
      </div>
    </div>
  );
}
