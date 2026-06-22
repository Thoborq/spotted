import BottomNav from "@/components/navigation/BottomNav";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 pb-28">{children}</div>
      <BottomNav />
    </div>
  );
}
