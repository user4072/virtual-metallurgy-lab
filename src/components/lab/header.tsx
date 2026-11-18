"use client";

import { Atom, Cpu, Gauge, GitBranch, Activity, Share2, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { buildShareURL } from "@/components/lab/use-url-sync";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/store/lang-store";

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  const [now, setNow] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { dict: t } = useLang();

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", {
          hour12: false,
          timeZone: "Asia/Tehran",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleShare = async () => {
    const url = buildShareURL();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({
        title: t.header.shareToastTitle,
        description: t.header.shareToastDesc,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link to share the current recipe:", url);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          onClick={onToggleSidebar}
          className="grid h-9 w-9 place-items-center rounded-md border border-border/70 text-muted-foreground hover:text-foreground lg:hidden"
          aria-label="Toggle parameter panel"
        >
          <Gauge className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="relative grid h-10 w-10 place-items-center rounded-lg border border-primary/40 bg-primary/10 copper-glow">
            <Atom className="h-5 w-5 text-primary" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-background animate-pulse-slow" />
          </div>
          <div className="leading-tight">
            <h1 className="font-mono text-[15px] font-semibold tracking-tight text-foreground sm:text-base">
              Virtual Metallurgy Lab
              <span className="ml-2 align-middle font-sans text-[10px] font-normal text-muted-foreground">
                Created by{" "}
                <a
                  href="https://github.com/sintheuser/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground/80 underline decoration-dotted underline-offset-2 hover:text-primary hover:decoration-primary"
                >
                  Sintheuser
                </a>
              </span>
            </h1>
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              {t.header.subtitle}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-primary transition hover:bg-primary/20"
            aria-label="Share current recipe link"
            title="Copy shareable recipe link"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden font-mono text-[11px] font-semibold text-emerald-400 sm:inline">{t.header.copied}</span>
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden font-mono text-[11px] font-semibold sm:inline">{t.header.share}</span>
              </>
            )}
          </button>
          <StatusChip
            icon={<Cpu className="h-3.5 w-3.5" />}
            label="CALPHAD"
            value="pycalphad"
            tone="primary"
          />
          <StatusChip
            icon={<GitBranch className="h-3.5 w-3.5" />}
            label="Micrograph"
            value="hybrid"
            tone="emerald"
            className="hidden md:flex"
          />
          <StatusChip
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Causal"
            value="SCM + OLS"
            tone="cyan"
            className="hidden md:flex"
          />
          <div className="hidden items-center gap-2 rounded-md border border-border/60 bg-card/50 px-3 py-1.5 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
            <span className="font-mono text-[11px] tabular-nums text-foreground">
              {now} {t.header.clock}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusChip({
  icon,
  label,
  value,
  tone,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "emerald" | "cyan";
  className?: string;
}) {
  const tones: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5 text-primary",
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    cyan: "border-cyan-500/30 bg-cyan-500/5 text-cyan-400",
  };
  return (
    <div
      className={`hidden items-center gap-2 rounded-md border px-2.5 py-1.5 sm:flex ${tones[tone]} ${className ?? ""}`}
    >
      {icon}
      <div className="leading-none">
        <div className="text-[9px] uppercase tracking-wider opacity-70">
          {label}
        </div>
        <div className="font-mono text-[11px] font-semibold tabular-nums">
          {value}
        </div>
      </div>
    </div>
  );
}
