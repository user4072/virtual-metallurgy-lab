"use client";

import { Atom, Github, BookOpen, Cpu } from "lucide-react";
import { useLang } from "@/store/lang-store";

export function Footer() {
  const { dict: t } = useLang();
  return (
    <footer className="mt-auto border-t border-border/60 bg-background/60 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col items-start justify-between gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center">
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md border border-primary/30 bg-primary/10">
            <Atom className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="font-mono text-[11px] font-semibold text-foreground">
              Virtual Metallurgy Lab
            </div>
            <div className="text-[10px] text-muted-foreground">
              {t.footer.tagline}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            "Next.js 16",
            "TypeScript",
            "PyTorch",
            "torch_geometric",
            "diffusers",
            "pycalphad",
            "DoWhy",
            "FastAPI",
          ].map((tech) => (
            <span
              key={tech}
              className="rounded border border-border/50 bg-card/40 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Cpu className="h-3 w-3 text-emerald-400" />
            {t.footer.inferenceOnDevice}
          </span>
          <span className="flex items-center gap-1 hover:text-foreground">
            <BookOpen className="h-3 w-3" />
            {t.footer.docs}
          </span>
          <a
            href="https://github.com/sintheuser/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Github className="h-3 w-3" />
            {t.footer.source}
          </a>
        </div>
      </div>
    </footer>
  );
}
