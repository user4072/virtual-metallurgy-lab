"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Header } from "@/components/lab/header";
import { ParamSidebar } from "@/components/lab/sidebar";
import { Footer } from "@/components/lab/footer";
import { PhaseDiagramTab } from "@/components/lab/tabs/phase-diagram-tab";
import { MicrostructureTab } from "@/components/lab/tabs/microstructure-tab";
import { SolidificationTab } from "@/components/lab/tabs/solidification-tab";
import { MechanicalTab } from "@/components/lab/tabs/mechanical-tab";
import { OptimizationTab } from "@/components/lab/tabs/optimization-tab";
import { PhaseFieldTab } from "@/components/lab/tabs/phase-field-tab";
import { PropertyRadarTab } from "@/components/lab/tabs/property-radar-tab";
import { Microstructure3dTab } from "@/components/lab/tabs/microstructure-3d-tab";
import { ComparisonTab } from "@/components/lab/tabs/comparison-tab";
import { SensitivityTab } from "@/components/lab/tabs/sensitivity-tab";
import { FailureTab } from "@/components/lab/tabs/failure-tab";
import { ReportTab } from "@/components/lab/tabs/report-tab";
import { OverviewTab } from "@/components/lab/tabs/overview-tab";
import { HeatTreatmentTab } from "@/components/lab/tabs/heat-treatment-tab";
import { useUrlSync } from "@/components/lab/use-url-sync";
import { useLang } from "@/store/lang-store";
import { ErrorBoundary } from "@/components/lab/error-boundary";
import {
  Atom,
  Microscope,
  Waves,
  Activity,
  GitBranch,
  Target,
  BookOpen,
  FileCode2,
  Orbit,
  Radar,
  Box,
  GitCompare,
  Grid3x3,
  AlertTriangle,
  FileText,
  LayoutDashboard,
  Flame,
} from "lucide-react";

const TOTAL_TABS = 14;

export default function Home() {
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const { dict: t } = useLang();
  useUrlSync();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header onToggleSidebar={() => setMobileSidebar((v) => !v)} />

      <div className="flex flex-1">
        <ParamSidebar
          mobileOpen={mobileSidebar}
          onMobileClose={() => setMobileSidebar(false)}
        />

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1700px] px-4 py-5 sm:px-6">
            {/* Title strip */}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="text-primary">{t.page.breadcrumb.vml}</span>
                  <span className="text-border">/</span>
                  <span>{t.page.breadcrumb.session}</span>
                  <span className="text-border">/</span>
                  <span className="text-foreground/70">{t.page.breadcrumb.dashboard}</span>
                </div>
                <h2 className="font-mono text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {t.page.title}
                  <span className="ml-2 align-middle font-sans text-xs font-normal text-muted-foreground">
                    {TOTAL_TABS} {t.page.modules}
                  </span>
                </h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {t.page.subtitle}
                </p>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-4 grid h-auto w-full grid-cols-2 gap-1 overflow-x-auto bg-card/40 p-1 sm:grid-cols-6 lg:flex lg:flex-wrap lg:justify-between">
                <TabTrigger value="overview" icon={<LayoutDashboard className="h-3.5 w-3.5" />} label={t.tabs.overview} />
                <TabTrigger value="phase" icon={<Atom className="h-3.5 w-3.5" />} label={t.tabs.phase} />
                <TabTrigger value="micro" icon={<Microscope className="h-3.5 w-3.5" />} label={t.tabs.micro} />
                <TabTrigger value="micro3d" icon={<Box className="h-3.5 w-3.5" />} label={t.tabs.micro3d} />
                <TabTrigger value="scheil" icon={<Waves className="h-3.5 w-3.5" />} label={t.tabs.scheil} />
                <TabTrigger value="mech" icon={<Activity className="h-3.5 w-3.5" />} label={t.tabs.mech} />
                <TabTrigger value="ht" icon={<Flame className="h-3.5 w-3.5" />} label={t.tabs.ht} />
                <TabTrigger value="field" icon={<Orbit className="h-3.5 w-3.5" />} label={t.tabs.field} />
                <TabTrigger value="opt" icon={<Target className="h-3.5 w-3.5" />} label={t.tabs.opt} />
                <TabTrigger value="radar" icon={<Radar className="h-3.5 w-3.5" />} label={t.tabs.radar} />
                <TabTrigger value="compare" icon={<GitCompare className="h-3.5 w-3.5" />} label={t.tabs.compare} />
                <TabTrigger value="sens" icon={<Grid3x3 className="h-3.5 w-3.5" />} label={t.tabs.sens} />
                <TabTrigger value="fail" icon={<AlertTriangle className="h-3.5 w-3.5" />} label={t.tabs.fail} />
                <TabTrigger value="report" icon={<FileText className="h-3.5 w-3.5" />} label={t.tabs.report} />
              </TabsList>

              <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Overview"><OverviewTab onNavigate={setActiveTab} /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="phase" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Phase Diagram"><PhaseDiagramTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="micro" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Microstructure"><MicrostructureTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="micro3d" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="3D Microstructure"><Microstructure3dTab active={activeTab === "micro3d"} /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="scheil" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Solidification"><SolidificationTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="mech" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Mechanical"><MechanicalTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="ht" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Heat Treatment"><HeatTreatmentTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="field" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Phase-Field"><PhaseFieldTab /></ErrorBoundary>
              </TabsContent>
                          <TabsContent value="opt" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Optimization"><OptimizationTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="radar" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Property Radar"><PropertyRadarTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="compare" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Comparison"><ComparisonTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="sens" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Sensitivity"><SensitivityTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="fail" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Failure"><FailureTab /></ErrorBoundary>
              </TabsContent>
              <TabsContent value="report" className="mt-0 focus-visible:outline-none">
                <ErrorBoundary label="Report"><ReportTab /></ErrorBoundary>
              </TabsContent>
                                    </Tabs>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}

function TabTrigger({
  value,
  icon,
  label,
}: {
  value: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="gap-1.5 py-2 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label}</span>
    </TabsTrigger>
  );
}
