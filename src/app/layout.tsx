import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Spotted",
  description:
    "Foto hochladen, Produkte erkennen, Originale und Alternativen finden.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Spotted",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF8F5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

const themeBootScript = `(function () {
  try {
    var KEY = "spotted.theme.v1";
    var pref = localStorage.getItem(KEY) || "system";
    var mql = window.matchMedia("(prefers-color-scheme: dark)");
    function isDark(p) {
      return p === "dark" || (p === "system" && mql.matches);
    }
    function apply(p) {
      var dark = isDark(p);
      document.documentElement.classList.toggle("dark", dark);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", dark ? "#15130f" : "#faf8f5");
    }
    apply(pref);
    mql.addEventListener("change", function () {
      apply(localStorage.getItem(KEY) || "system");
    });
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
