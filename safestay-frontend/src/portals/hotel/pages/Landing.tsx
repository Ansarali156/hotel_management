import { Link } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import BrandLogo from '../../../shared/components/BrandLogo';

// ── Feature card data ──────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: 'auto_awesome',
    title: 'AI-Powered Check-In',
    desc: 'Scan physical registers with your phone camera. Our AI extracts guest details instantly — no manual typing required.',
    accent: '#1B4332',
  },
  {
    icon: 'qr_code_scanner',
    title: 'Aadhaar OCR Scanner',
    desc: 'Point, shoot, done. Aadhaar card details are read and auto-filled in seconds with military-grade accuracy.',
    accent: '#012D1D',
  },
  {
    icon: 'description',
    title: 'Form C Generator',
    desc: 'Automatically generate government-compliant Form C for international guests. One click, zero paperwork.',
    accent: '#1B4332',
  },
  {
    icon: 'grid_view',
    title: 'Live Room Grid',
    desc: 'Visualize your entire property at a glance. Floor-by-floor room status, occupancy rates, and real-time availability.',
    accent: '#012D1D',
  },
  {
    icon: 'downloading',
    title: 'Export Anywhere',
    desc: 'Download guest records as PDF or CSV with a single click. Perfect for audits, compliance reports, and record-keeping.',
    accent: '#1B4332',
  },
  {
    icon: 'verified_user',
    title: 'Police-Grade Security',
    desc: 'Connected to law enforcement intelligence systems. Encrypted end-to-end with enterprise authentication protocols.',
    accent: '#012D1D',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Register Your Hotel',
    desc: 'Create your account with hotel details. Your entire room inventory is generated automatically.',
    icon: 'apartment',
  },
  {
    num: '02',
    title: 'Check In Guests',
    desc: 'Use manual entry, AI scan, or Aadhaar OCR. Each method takes under 30 seconds.',
    icon: 'person_add',
  },
  {
    num: '03',
    title: 'Manage & Monitor',
    desc: 'Track occupancy, generate reports, and maintain complete compliance — all from your dashboard.',
    icon: 'monitoring',
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function HotelLanding() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── PWA install prompt ────────────────────────────────────────────────────
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState<'android' | 'ios' | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    // Named handler so we can remove it on unmount (MP3) — the previous
    // inline arrow listener was impossible to detach.
    const installedHandler = () => setPwaInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const handleInstallPwa = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setPwaInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleAndroidClick = useCallback(async () => {
    if (deferredPrompt) {
      await handleInstallPwa();
    } else {
      setShowInstructions('android');
    }
  }, [deferredPrompt, handleInstallPwa]);

  return (
    <div className="bg-[#FAFBFC] text-on-surface antialiased overflow-x-hidden">
      {/* ═══════════════════════════════════════════════════════════════════════
          NAVBAR
      ═══════════════════════════════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300">
        <div className="bg-white/80 backdrop-blur-xl border-b border-outline-variant/10">
          <div className="max-w-7xl mx-auto px-6 lg:px-10 h-[72px] flex items-center justify-between">
            {/* Logo */}
            <Link to="/hotel" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 bg-gradient-to-br from-[#1B4332] to-[#012D1D] rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow p-1.5">
                <BrandLogo size={22} color="#ffffff" />
              </div>
              <span className="font-headline font-extrabold text-[22px] text-[#012D1D] tracking-tight">CheckInNow</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-[13px] font-semibold text-on-surface-variant hover:text-h-primary transition-colors tracking-wide uppercase">Features</a>
              <a href="#how-it-works" className="text-[13px] font-semibold text-on-surface-variant hover:text-h-primary transition-colors tracking-wide uppercase">How It Works</a>
            </div>

            {/* CTA */}
            <div className="hidden md:flex items-center gap-3">
              <Link to="/hotel/login" className="px-5 py-2.5 text-[13px] font-bold text-[#1B4332] hover:bg-[#1B4332]/5 rounded-lg transition-all">
                Sign In
              </Link>
              <Link
                to="/hotel/register"
                className="px-6 py-2.5 bg-gradient-to-r from-[#1B4332] to-[#012D1D] text-white text-[13px] font-bold rounded-lg shadow-sm hover:shadow-lg hover:shadow-[#1B4332]/15 transition-all active:scale-[0.98]"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-2xl">{mobileMenuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-outline-variant/10 bg-white px-6 pb-6 pt-4 space-y-4">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-semibold text-on-surface-variant">Features</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-semibold text-on-surface-variant">How It Works</a>
              <div className="flex flex-col gap-3 pt-4 border-t border-outline-variant/10">
                <Link to="/hotel/login" className="text-center py-3 text-sm font-bold text-[#1B4332] border border-[#1B4332]/20 rounded-lg">Sign In</Link>
                <Link to="/hotel/register" className="text-center py-3 text-sm font-bold text-white bg-[#1B4332] rounded-lg">Get Started</Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════
          HERO — centered, no right panel
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-[72px] overflow-hidden">
        {/* Soft ambient blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-[#c1ecd4]/20 to-transparent blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40vw] h-[400px] bg-gradient-to-tr from-[#e1e3e4]/30 to-transparent blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[35vw] h-[400px] bg-gradient-to-tl from-[#c1ecd4]/10 to-transparent blur-2xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 lg:px-10 pt-24 pb-28 lg:pt-36 lg:pb-40 text-center">

          {/* Headline */}
          <h1 className="font-headline text-[34px] sm:text-[46px] lg:text-[68px] font-black text-[#012D1D] leading-[1.04] tracking-[-0.03em] mb-7 animate-fade-in-up delay-100">
            Hotel management,{' '}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] bg-clip-text text-transparent">reimagined.</span>
              <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-gradient-to-r from-[#1B4332] to-[#2D6A4F] rounded-full opacity-25" />
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg lg:text-xl text-[#414844] leading-relaxed mb-12 max-w-2xl mx-auto animate-fade-in-up delay-200">
            Check in guests in under 30 seconds. AI-powered register scanning, Aadhaar OCR, and automated compliance — all from one dashboard.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center animate-fade-in-up delay-300">
            <Link
              to="/hotel/register"
              className="w-full sm:w-auto px-9 py-4 bg-gradient-to-r from-[#1B4332] to-[#012D1D] text-white font-headline font-bold text-base rounded-xl shadow-lg shadow-[#1B4332]/20 hover:shadow-xl hover:shadow-[#1B4332]/30 hover:-translate-y-0.5 active:scale-[0.97] active:shadow-md flex items-center justify-center gap-2"
            >
              Get Started
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto px-9 py-4 border-2 border-[#1B4332]/15 text-[#1B4332] font-headline font-bold text-base rounded-xl hover:bg-[#1B4332]/6 hover:border-[#1B4332]/25 hover:-translate-y-0.5 active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">play_circle</span>
              See How It Works
            </a>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center gap-6 mt-12 justify-center animate-fade-in-up delay-400">
            {[
              { icon: 'lock', label: 'End-to-End Encrypted' },
              { icon: 'gpp_good', label: 'Gov Compliant' },
              { icon: 'verified', label: 'ISO 27001' },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && <div className="w-px h-4 bg-outline-variant/30 mr-4" />}
                <span className="material-symbols-outlined text-[#1B4332] text-[16px] icon-fill">{b.icon}</span>
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{b.label}</span>
              </div>
            ))}
          </div>

          {/* Mini feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mt-10 animate-fade-in-up delay-500">
            {['AI Register Scan', 'Aadhaar OCR', 'Form C Auto-Gen', 'Live Room Grid', 'PDF/CSV Export'].map((tag) => (
              <span key={tag} className="px-3.5 py-1.5 bg-white border border-outline-variant/20 rounded-full text-[12px] font-semibold text-on-surface-variant shadow-sm hover:shadow-md hover:border-[#1B4332]/20 hover:text-[#1B4332] cursor-default">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: FEATURES
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="features" className="py-24 lg:py-32 relative">
        <div className="absolute top-20 right-0 w-[300px] h-[300px] bg-[#c1ecd4]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          {/* Section header */}
          <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1B4332]/5 rounded-full mb-6">
              <span className="material-symbols-outlined text-[#1B4332] text-[14px] icon-fill">star</span>
              <span className="text-[11px] font-bold text-[#1B4332] uppercase tracking-widest">Core Features</span>
            </div>
            <h2 className="font-headline text-[36px] lg:text-[44px] font-black text-[#012D1D] leading-tight tracking-[-0.02em] mb-4">
              Everything you need to run your hotel
            </h2>
            <p className="text-base lg:text-lg text-[#414844] leading-relaxed">
              Purpose-built tools that replace spreadsheets, paper registers, and manual compliance workflows.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                style={{ animationDelay: `${i * 80}ms` }}
                className="group animate-fade-in-up bg-white rounded-2xl p-8 hover:shadow-xl hover:shadow-[#1B4332]/6 hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-[#1B4332]/10 relative overflow-hidden cursor-default"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#c1ecd4]/0 group-hover:from-[#c1ecd4]/12 to-transparent transition-all duration-500 rounded-bl-full" />
                <div className="relative">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#1B4332]/10 to-[#1B4332]/5 rounded-xl flex items-center justify-center mb-6 group-hover:from-[#1B4332] group-hover:to-[#012D1D] transition-all duration-300 group-hover:scale-110">
                    <span className="material-symbols-outlined text-[#1B4332] text-[26px] group-hover:text-white transition-colors duration-300 icon-fill">
                      {f.icon}
                    </span>
                  </div>
                  <h3 className="font-headline text-lg font-bold text-[#012D1D] mb-3 group-hover:text-[#1B4332] transition-colors duration-200">{f.title}</h3>
                  <p className="text-sm text-[#414844] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3: HOW IT WORKS
      ═══════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 lg:py-32 bg-[#f3f4f5] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-[#1B4332]/3 rounded-full blur-3xl pointer-events-none -translate-x-1/2" />
        <div className="max-w-7xl mx-auto px-6 lg:px-10 relative">
          {/* Section header */}
          <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#1B4332]/5 rounded-full mb-6">
              <span className="material-symbols-outlined text-[#1B4332] text-[14px] icon-fill">route</span>
              <span className="text-[11px] font-bold text-[#1B4332] uppercase tracking-widest">How It Works</span>
            </div>
            <h2 className="font-headline text-[36px] lg:text-[44px] font-black text-[#012D1D] leading-tight tracking-[-0.02em] mb-4">
              Get started in three steps
            </h2>
            <p className="text-base lg:text-lg text-[#414844] leading-relaxed">
              From registration to fully operational — in under 10 minutes.
            </p>
          </div>

          {/* Steps */}
          <div className="grid lg:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden lg:block absolute top-[72px] left-[17%] right-[17%] h-px bg-gradient-to-r from-[#1B4332]/20 via-[#1B4332]/10 to-[#1B4332]/20" />

            {STEPS.map((step, i) => (
              <div key={i} className="relative text-center">
                {/* Step number circle */}
                <div className="relative inline-flex mb-8">
                  <div className="w-[88px] h-[88px] rounded-full bg-white shadow-lg shadow-[#1B4332]/5 flex items-center justify-center relative z-10">
                    <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-[#1B4332] to-[#012D1D] flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-[32px]">{step.icon}</span>
                    </div>
                  </div>
                  <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-[#c1ecd4] flex items-center justify-center z-20">
                    <span className="text-[11px] font-black text-[#012D1D]">{step.num}</span>
                  </div>
                </div>

                <h3 className="font-headline text-xl font-bold text-[#012D1D] mb-3">{step.title}</h3>
                <p className="text-sm text-[#414844] leading-relaxed max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4: CTA BAND
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#1B4332] to-[#012D1D]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjAuNSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#2D6A4F]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <h2 className="font-headline text-[36px] lg:text-[48px] font-black text-white leading-tight tracking-[-0.02em] mb-6">
            Ready to modernize your hotel?
          </h2>
          <p className="text-lg text-white/70 leading-relaxed mb-10 max-w-xl mx-auto">
            Start managing your hotel smarter. Set up your property in under 10 minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <Link
              to="/hotel/register"
              className="w-full sm:w-auto px-10 py-4 bg-white text-[#012D1D] font-headline font-bold text-base rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.97] active:shadow-md transition-all flex items-center justify-center gap-2"
            >
              Get Started
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </Link>
            <Link
              to="/hotel/login"
              className="w-full sm:w-auto px-10 py-4 border-2 border-white/20 text-white font-headline font-bold text-base rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5: INSTALL APP
      ═══════════════════════════════════════════════════════════════════════ */}
      <section className="relative py-28 lg:py-36 overflow-hidden bg-[#FAFBFC]">
        {/* Subtle background grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#d1fae5_1px,transparent_1px)] [background-size:32px_32px] opacity-40 pointer-events-none" />
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#1B4332]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#2D6A4F]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* Left — copy */}
            <div className="animate-fade-in-up">
              <span className="inline-flex items-center gap-2 bg-[#1B4332]/10 text-[#1B4332] text-[11px] font-black uppercase tracking-[0.15em] px-4 py-1.5 rounded-full mb-6">
                <span className="material-symbols-outlined text-[14px]">download</span>
                Available on Android &amp; iOS
              </span>

              <h2 className="font-headline text-[40px] lg:text-[56px] font-black text-[#0A1F16] leading-[1.05] tracking-[-0.03em] mb-6">
                Take CheckInNow<br />
                <span className="text-[#1B4332]">everywhere</span><br />
                you go.
              </h2>

              <p className="text-lg text-on-surface-variant leading-relaxed mb-8 max-w-md">
                Install the CheckInNow app directly on your phone — no App Store needed.
                Works offline, loads instantly, and feels native. One tap and you're done.
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-3 mb-10">
                {[
                  { icon: 'wifi_off',         label: 'Works Offline' },
                  { icon: 'bolt',             label: 'Instant Load' },
                  { icon: 'notifications',    label: 'Push Alerts' },
                  { icon: 'home_app_logo',    label: 'Home Screen Icon' },
                ].map(({ icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1.5 bg-white border border-outline-variant/20 text-[12px] font-bold text-on-surface-variant px-3.5 py-2 rounded-lg shadow-sm">
                    <span className="material-symbols-outlined text-[15px] text-[#1B4332]">{icon}</span>
                    {label}
                  </span>
                ))}
              </div>

              {/* Platform install buttons */}
              {pwaInstalled ? (
                <div className="inline-flex items-center gap-3 bg-[#1B4332]/10 text-[#1B4332] font-bold text-base px-8 py-4 rounded-2xl">
                  <span className="material-symbols-outlined text-[22px]">check_circle</span>
                  App Installed Successfully!
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Android button */}
                  <button
                    onClick={handleAndroidClick}
                    className="group flex items-center gap-4 bg-[#1B4332] text-white px-7 py-4 rounded-2xl shadow-xl shadow-[#1B4332]/25 hover:bg-[#012D1D] hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#1B4332]/30 active:scale-[0.97] active:translate-y-0 transition-all duration-200"
                  >
                    {/* Android logo */}
                    <svg className="w-7 h-7 flex-shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.523 15.341a.54.54 0 01-.54.54H7.017a.54.54 0 01-.54-.54V9.66a.54.54 0 01.54-.54h9.966a.54.54 0 01.54.54v5.681zm-8.55-8.897L7.8 5.27a.27.27 0 10-.383.383l1.237 1.237A5.94 5.94 0 0012 6c1.09 0 2.11.29 2.985.795l1.198-1.198a.27.27 0 10-.383-.383l-1.134 1.134A5.94 5.94 0 0012 6a5.94 5.94 0 00-3.027.444zM10.08 8.04a.54.54 0 11-1.08 0 .54.54 0 011.08 0zm4.92 0a.54.54 0 11-1.08 0 .54.54 0 011.08 0zM6.48 9.12v6.756c0 .597.483 1.08 1.08 1.08h.54v2.214a.81.81 0 101.62 0V16.956h1.62v2.214a.81.81 0 101.62 0V16.956h.54c.597 0 1.08-.483 1.08-1.08V9.12H6.48zm12.42 0a.81.81 0 00-.81.81v4.32a.81.81 0 001.62 0V9.93a.81.81 0 00-.81-.81zm-13.8 0a.81.81 0 00-.81.81v4.32a.81.81 0 001.62 0V9.93a.81.81 0 00-.81-.81z"/>
                    </svg>
                    <div className="text-left">
                      <p className="text-[10px] font-medium text-white/70 leading-none mb-0.5">
                        {deferredPrompt ? 'Tap to install' : 'Get it on'}
                      </p>
                      <p className="text-base font-black leading-tight">Android</p>
                    </div>
                  </button>

                  {/* iOS button */}
                  <button
                    onClick={() => setShowInstructions('ios')}
                    className="group flex items-center gap-4 bg-white border-2 border-[#1B4332]/20 text-[#1B4332] px-7 py-4 rounded-2xl shadow-lg hover:border-[#1B4332] hover:-translate-y-1 hover:shadow-xl active:scale-[0.97] active:translate-y-0 transition-all duration-200"
                  >
                    {/* Apple logo */}
                    <svg className="w-7 h-7 flex-shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    <div className="text-left">
                      <p className="text-[10px] font-medium text-[#1B4332]/60 leading-none mb-0.5">Get it on</p>
                      <p className="text-base font-black leading-tight">iPhone / iPad</p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Right — phone mockup */}
            <div className="flex justify-center lg:justify-end animate-fade-in-up delay-200">
              <div className="relative">
                {/* Glow */}
                <div className="absolute inset-0 bg-[#1B4332]/20 rounded-[48px] blur-3xl scale-90" />

                {/* Phone frame */}
                <div className="relative w-[280px] lg:w-[320px] bg-[#0A1F16] rounded-[44px] p-3 shadow-[0_40px_80px_rgba(0,0,0,0.35)]">
                  {/* Notch */}
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#0A1F16] rounded-full z-10" />
                  {/* Screen */}
                  <div className="bg-[#FAFBFC] rounded-[36px] overflow-hidden h-[560px] lg:h-[620px] flex flex-col">
                    {/* Status bar */}
                    <div className="bg-[#1B4332] px-6 pt-10 pb-6 flex-shrink-0">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-[12px] icon-fill">hotel</span>
                        </div>
                        <span className="text-white text-[11px] font-bold">CheckInNow</span>
                      </div>
                      <p className="text-white/60 text-[10px]">Good morning,</p>
                      <p className="text-white font-black text-lg leading-tight">Grand Palace Hotel</p>
                    </div>
                    {/* App content */}
                    <div className="flex-1 p-4 space-y-3 overflow-hidden">
                      {/* Stat cards */}
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Checked In', value: '24', icon: 'person' },
                          { label: 'Available', value: '12', icon: 'door_open' },
                        ].map(({ label, value, icon }) => (
                          <div key={label} className="bg-white rounded-xl p-3 shadow-sm border border-outline-variant/10">
                            <span className="material-symbols-outlined text-[#1B4332] text-[16px]">{icon}</span>
                            <p className="text-[18px] font-black text-on-surface mt-1">{value}</p>
                            <p className="text-[9px] text-on-surface-variant font-medium">{label}</p>
                          </div>
                        ))}
                      </div>
                      {/* Guest list preview */}
                      <div className="bg-white rounded-xl p-3 shadow-sm border border-outline-variant/10">
                        <p className="text-[9px] font-black uppercase tracking-wider text-on-surface-variant mb-2">Recent Check-ins</p>
                        {['Rajesh Kumar', 'Priya Sharma', 'Amit Singh'].map((name) => (
                          <div key={name} className="flex items-center gap-2 py-1.5 border-b border-outline-variant/10 last:border-0">
                            <div className="w-5 h-5 rounded-full bg-[#1B4332]/10 flex items-center justify-center">
                              <span className="material-symbols-outlined text-[#1B4332] text-[10px]">person</span>
                            </div>
                            <span className="text-[10px] font-medium text-on-surface">{name}</span>
                            <span className="ml-auto text-[8px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">IN</span>
                          </div>
                        ))}
                      </div>
                      {/* Quick action */}
                      <div className="bg-[#1B4332] rounded-xl p-3 text-center">
                        <span className="material-symbols-outlined text-white text-[18px]">qr_code_scanner</span>
                        <p className="text-white text-[9px] font-bold mt-1">Scan Aadhaar</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating badge */}
                <div className="hidden sm:flex absolute -right-4 top-16 bg-white rounded-2xl shadow-xl px-4 py-3 items-center gap-2.5 border border-outline-variant/10">
                  <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-green-700 text-[16px]">check_circle</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface">Works Offline</p>
                    <p className="text-[8px] text-on-surface-variant">No internet needed</p>
                  </div>
                </div>

                <div className="hidden sm:flex absolute -left-4 bottom-24 bg-white rounded-2xl shadow-xl px-4 py-3 items-center gap-2.5 border border-outline-variant/10">
                  <div className="w-8 h-8 bg-[#1B4332]/10 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#1B4332] text-[16px]">bolt</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-on-surface">Instant Load</p>
                    <p className="text-[8px] text-on-surface-variant">&lt; 1s startup</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── PWA Install Instructions Modal ──────────────────────────────────── */}
      {showInstructions && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowInstructions(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-7 pt-7 pb-5 ${showInstructions === 'android' ? 'bg-[#1B4332]' : 'bg-[#0A1F16]'}`}>
              <button
                onClick={() => setShowInstructions(null)}
                className="absolute top-5 right-5 text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center">
                  {showInstructions === 'android' ? (
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.523 15.341a.54.54 0 01-.54.54H7.017a.54.54 0 01-.54-.54V9.66a.54.54 0 01.54-.54h9.966a.54.54 0 01.54.54v5.681zm-8.55-8.897L7.8 5.27a.27.27 0 10-.383.383l1.237 1.237A5.94 5.94 0 0012 6c1.09 0 2.11.29 2.985.795l1.198-1.198a.27.27 0 10-.383-.383l-1.134 1.134A5.94 5.94 0 0012 6a5.94 5.94 0 00-3.027.444zM10.08 8.04a.54.54 0 11-1.08 0 .54.54 0 011.08 0zm4.92 0a.54.54 0 11-1.08 0 .54.54 0 011.08 0zM6.48 9.12v6.756c0 .597.483 1.08 1.08 1.08h.54v2.214a.81.81 0 101.62 0V16.956h1.62v2.214a.81.81 0 101.62 0V16.956h.54c.597 0 1.08-.483 1.08-1.08V9.12H6.48zm12.42 0a.81.81 0 00-.81.81v4.32a.81.81 0 001.62 0V9.93a.81.81 0 00-.81-.81zm-13.8 0a.81.81 0 00-.81.81v4.32a.81.81 0 001.62 0V9.93a.81.81 0 00-.81-.81z"/>
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-white/60 text-[11px] font-bold uppercase tracking-wider">Install CheckInNow on</p>
                  <h3 className="text-white font-black text-xl">
                    {showInstructions === 'android' ? 'Android' : 'iPhone / iPad'}
                  </h3>
                </div>
              </div>
            </div>

            {/* Steps */}
            <div className="px-7 py-6 space-y-4">
              {showInstructions === 'android' ? (
                <>
                  {[
                    { icon: 'open_in_browser', title: 'Open in Chrome', desc: 'Make sure you\'re using Google Chrome browser on your Android device.' },
                    { icon: 'more_vert',        title: 'Tap the Menu ( ⋮ )', desc: 'Tap the three-dot menu icon in the top-right corner of Chrome.' },
                    { icon: 'add_to_home_screen', title: 'Tap "Add to Home Screen"', desc: 'Select "Add to Home Screen" from the menu and confirm the install.' },
                    { icon: 'rocket_launch',   title: 'Done! Launch CheckInNow', desc: 'The CheckInNow icon will appear on your home screen. Tap it to open.' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-[#1B4332]/10 rounded-xl flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#1B4332] text-[18px]">{step.icon}</span>
                      </div>
                      <div className="pt-0.5">
                        <p className="text-sm font-black text-on-surface">{step.title}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {[
                    { icon: 'open_in_browser', title: 'Open in Safari', desc: 'Make sure you\'re using Safari browser — Chrome on iOS cannot install PWAs.' },
                    { icon: 'ios_share',       title: 'Tap the Share Icon', desc: 'Tap the Share button (square with arrow pointing up) at the bottom of Safari.' },
                    { icon: 'add_box',         title: 'Tap "Add to Home Screen"', desc: 'Scroll down in the share sheet and tap "Add to Home Screen".' },
                    { icon: 'rocket_launch',   title: 'Done! Launch CheckInNow', desc: 'The CheckInNow icon will appear on your home screen. Tap it to open.' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-[#0A1F16]/10 rounded-xl flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#0A1F16] text-[18px]">{step.icon}</span>
                      </div>
                      <div className="pt-0.5">
                        <p className="text-sm font-black text-on-surface">{step.title}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <button
                onClick={() => setShowInstructions(null)}
                className={`w-full mt-2 py-3.5 rounded-2xl font-bold text-sm text-white transition-all active:scale-[0.98] ${
                  showInstructions === 'android' ? 'bg-[#1B4332] hover:bg-[#012D1D]' : 'bg-[#0A1F16] hover:bg-black'
                }`}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════════════════════ */}
      <footer className="bg-[#0A1F16] text-white/60">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-20">
          <div className="grid md:grid-cols-4 gap-12 lg:gap-16">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] rounded-lg flex items-center justify-center p-1.5">
                  <BrandLogo size={22} color="#ffffff" />
                </div>
                <span className="font-headline font-extrabold text-xl text-white tracking-tight">CheckInNow</span>
              </div>
              <p className="text-sm leading-relaxed text-white/40">
                India's most trusted hotel management platform. Secure, compliant, intelligent.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-[11px] font-bold text-white/30 uppercase tracking-[0.15em] mb-5">Product</h4>
              <ul className="space-y-3">
                {['Features', 'Security', 'API Docs'].map(link => (
                  <li key={link}><a href="#" className="text-sm text-white/50 hover:text-white transition-colors">{link}</a></li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-[11px] font-bold text-white/30 uppercase tracking-[0.15em] mb-5">Company</h4>
              <ul className="space-y-3">
                {['About Us', 'Blog', 'Careers', 'Contact'].map(link => (
                  <li key={link}><a href="#" className="text-sm text-white/50 hover:text-white transition-colors">{link}</a></li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-[11px] font-bold text-white/30 uppercase tracking-[0.15em] mb-5">Legal</h4>
              <ul className="space-y-3">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'GDPR'].map(link => (
                  <li key={link}><a href="#" className="text-sm text-white/50 hover:text-white transition-colors">{link}</a></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[12px] text-white/30 font-medium">
              © {new Date().getFullYear()} CheckInNow Network. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-white/20 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] icon-fill">verified_user</span>
                End-to-End Encrypted
              </span>
              <span className="text-[11px] text-white/20 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] icon-fill">gpp_good</span>
                Gov Compliant
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Keyframe for floating animation ──────────────────────────────────── */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}
