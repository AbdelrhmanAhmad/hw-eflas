import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";

const tajawal = Tajawal({
  weight: ["300", "400", "500", "700", "800"],
  subsets: ["arabic"],
  variable: "--font-tajawal",
});

export const metadata: Metadata = {
  title: "مستشار الإفلاس الذكي | نظام الإفلاس السعودي",
  description: "منصة قانونية ذكية مخصصة للمحامين والمستشارين الماليين لتشخيص حالة الإفلاس للمنشآت، الكشف عن النواقص الشكلية، وإعداد طلبات التصفية الإدارية وصياغة الوثائق القانونية بشكل متكامل.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable}`}>
      <body style={{ fontFamily: "var(--font-tajawal), sans-serif" }}>{children}</body>
    </html>
  );
}
