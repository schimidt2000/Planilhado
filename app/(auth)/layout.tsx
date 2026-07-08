export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-muted/30 px-4 py-6 sm:items-center">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
