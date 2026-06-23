"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import IconButton from "@/components/ui/IconButton";
import Button from "@/components/ui/Button";
import BirthdatePicker from "@/components/ui/BirthdatePicker";
import { getProfile, isCompleteEmail, saveProfile } from "@/lib/profile";

export default function AccountPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState<string | null>(null);
  const [emailError, setEmailError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const profile = getProfile();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with localStorage, a client-only external system
    setName(profile.name);
    setEmail(profile.email);
    setBirthdate(profile.birthdate);
    setLoaded(true);
  }, []);

  function handleSave() {
    if (!isCompleteEmail(email)) {
      setEmailError(true);
      return;
    }
    saveProfile({ name, email, birthdate });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div className="flex min-h-screen flex-col safe-top">
      <header className="flex items-center gap-3 px-4 pt-4">
        <IconButton onClick={() => router.back()}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[17px] font-bold tracking-tight">Account</h1>
      </header>

      <div className="flex-1 px-5 pb-32 pt-5">
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dein Name"
              maxLength={30}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40"
            />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <label className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
                E-Mail
              </label>
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-strong">
                Pflichtfeld
              </span>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(false);
              }}
              placeholder="Deine E-Mail-Adresse"
              className={`w-full rounded-2xl border bg-surface px-4 py-3 text-[15px] text-foreground placeholder:text-foreground-tertiary shadow-soft focus:outline-none focus:ring-2 focus:ring-accent-strong/40 ${
                emailError ? "border-danger" : "border-border"
              }`}
            />
            {emailError && (
              <p className="mt-1.5 px-1 text-[12.5px] text-danger">
                Bitte gib eine gültige E-Mail-Adresse ein.
              </p>
            )}
          </div>
          <div>
            <label className="mb-2 block px-1 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-foreground-tertiary">
              Geburtsdatum
            </label>
            {loaded && <BirthdatePicker value={birthdate} onChange={setBirthdate} />}
          </div>
        </div>

        <p className="mt-5 px-1 text-[12.5px] text-foreground-tertiary">
          Name und Geburtsdatum sind optional. Alle Angaben werden
          ausschließlich lokal auf diesem Gerät gespeichert.
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 hairline-t bg-background/85 backdrop-blur-xl safe-bottom">
        <div className="mx-auto px-5 py-4">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleSave}
          >
            {saved ? (
              <>
                <Check size={17} />
                Gespeichert
              </>
            ) : (
              "Speichern"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
