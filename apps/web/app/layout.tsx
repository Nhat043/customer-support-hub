import "./globals.css";

export const metadata = {
  title: "Customer Support Hub",
  description: "Multi-tenant workflow intelligence platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
